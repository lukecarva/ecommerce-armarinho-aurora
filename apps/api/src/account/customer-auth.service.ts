import {
  checkPassword,
  normalizeEmail,
  PASSWORD_PROBLEM_MESSAGES,
  TERMS_VERSION,
} from '@aurora/types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import type { CustomerTokenPurpose, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { createHmac, randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { loadEnv } from '../config/env';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Autenticação do cliente da vitrine.
 *
 * Três portas de entrada — senha, link por e-mail e link de recuperação — e
 * todas terminam no mesmo lugar: uma sessão em cookie httpOnly.
 *
 * **O que não se revela.** Login, link de entrada e recuperação de senha
 * respondem igual para e-mail existente e inexistente, com o mesmo custo de
 * tempo. O cadastro é a exceção consciente: diz "já existe conta com este
 * e-mail". Escondê-lo exigiria confirmar o e-mail antes do primeiro acesso,
 * e sem servidor de e-mail isso trancaria todo mundo do lado de fora. O
 * cadastro tem limite por IP, que é o que torna a varredura cara.
 */

export const CUSTOMER_COOKIE = 'cp_sessao';

/** Trinta dias, renovados a cada uso. */
const SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Validade de cada link.
 *
 * O de entrada é curto porque é uma senha temporária solta numa caixa de
 * entrada; o de confirmação é longo porque a pessoa pode abrir o e-mail no
 * dia seguinte, e confirmar tarde não dá acesso a nada.
 */
const VALIDADE_MS: Record<CustomerTokenPurpose, number> = {
  magic_link: 15 * 60 * 1000,
  redefinir_senha: 60 * 60 * 1000,
  verificar_email: 48 * 60 * 60 * 1000,
};

/** Só gravamos o último acesso se o anterior tiver mais que isso. */
const TOQUE_MINIMO_MS = 5 * 60 * 1000;

export interface ClienteDaSessao {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  emailVerified: boolean;
  temSenha: boolean;
  acceptsMarketing: boolean;
  groupId: string | null;
}

export interface ContextoDeAcesso {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class CustomerAuthService {
  private readonly env = loadEnv();
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly avisos: NotificationsService,
  ) {}

  get sessaoMs(): number {
    return SESSAO_MS;
  }

  async cadastrar(
    entrada: {
      nome: string;
      email: string;
      telefone: string;
      senha: string;
      aceitaMarketing: boolean;
    },
    contexto: ContextoDeAcesso,
  ): Promise<{ token: string; cliente: ClienteDaSessao }> {
    this.exigirSenhaBoa(entrada.senha);

    const email = normalizeEmail(entrada.email);
    const existente = await this.prisma.customer.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existente) {
      throw new ConflictException(
        'Já existe uma conta com este e-mail. Entre ou use "esqueci a senha".',
      );
    }

    const grupoPadrao = await this.prisma.customerGroup.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });

    const agora = new Date().toISOString();

    const cliente = await this.prisma.customer.create({
      data: {
        name: entrada.nome,
        email,
        phoneE164: entrada.telefone,
        passwordHash: await AuthService.hashPassword(entrada.senha),
        groupId: grupoPadrao?.id ?? null,
        acceptsMarketing: entrada.aceitaMarketing,
        // O consentimento guarda a versão do texto que a pessoa leu, quando e
        // de onde — é o que a LGPD pede para provar o aceite depois.
        consent: {
          termos: { versao: TERMS_VERSION, aceitoEm: agora, ip: contexto.ip ?? null },
          marketing: { aceito: entrada.aceitaMarketing, em: agora, ip: contexto.ip ?? null },
        },
        lastLoginAt: new Date(),
      },
    });

    await this.avisos.criar(cliente.id, {
      type: 'conta',
      title: 'Boas-vindas à Armarinho Aurora!',
      body: 'Sua conta está pronta. Confirme o e-mail pelo link que enviamos.',
      link: '/conta/dados',
    });

    void this.enviarConfirmacao(cliente.id);

    return { token: await this.abrirSessao(cliente.id, contexto), cliente: paraSessao(cliente) };
  }

  async entrar(
    emailBruto: string,
    senha: string,
    contexto: ContextoDeAcesso,
  ): Promise<{ token: string; cliente: ClienteDaSessao }> {
    const cliente = await this.prisma.customer.findFirst({
      where: { email: { equals: normalizeEmail(emailBruto), mode: 'insensitive' } },
    });

    // Mesma mensagem e mesmo custo de tempo para e-mail inexistente, conta sem
    // senha (só entra por link) e senha errada.
    if (!cliente?.passwordHash || cliente.anonymizedAt) {
      await gastarTempo();
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    const certa = await verify(cliente.passwordHash, senha).catch(() => false);
    if (!certa) throw new UnauthorizedException('E-mail ou senha incorretos.');

    await this.prisma.customer.update({
      where: { id: cliente.id },
      data: { lastLoginAt: new Date() },
    });

    return { token: await this.abrirSessao(cliente.id, contexto), cliente: paraSessao(cliente) };
  }

  async sair(token: string | undefined): Promise<void> {
    if (!token) return;

    await this.prisma.customerSession.updateMany({
      where: { tokenHash: this.hash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** O cliente da sessão, ou `null` se não houver sessão válida. */
  async resolver(token: string | undefined): Promise<ClienteDaSessao | null> {
    if (!token) return null;

    const sessao = await this.prisma.customerSession.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { customer: true },
    });

    if (!sessao || sessao.revokedAt || sessao.expiresAt < new Date()) return null;
    if (sessao.customer.anonymizedAt) return null;

    // Renovar a validade a cada requisição seria uma escrita por página vista.
    // De cinco em cinco minutos é o bastante para a sessão em uso não expirar.
    if (Date.now() - sessao.lastUsedAt.getTime() > TOQUE_MINIMO_MS) {
      await this.prisma.customerSession.update({
        where: { id: sessao.id },
        data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + SESSAO_MS) },
      });
    }

    return paraSessao(sessao.customer);
  }

  /** O cliente logado da requisição, se houver — para rotas que servem aos dois. */
  async daRequisicao(request: Request): Promise<ClienteDaSessao | null> {
    const cookies = request.cookies as Record<string, string> | undefined;
    return this.resolver(cookies?.[CUSTOMER_COOKIE]);
  }

  // ───────────────────────────── Links por e-mail ──────────────────────────

  /**
   * Link de entrada sem senha.
   *
   * Responde igual exista ou não a conta: quem pede não descobre se o e-mail
   * é cliente da loja.
   */
  async pedirLinkDeEntrada(emailBruto: string): Promise<void> {
    const cliente = await this.clientePorEmail(emailBruto);
    if (!cliente?.email) return;

    const token = await this.emitir(cliente.id, 'magic_link');
    await this.mail.entrarComLink(
      { email: cliente.email, nome: cliente.name },
      `${this.env.SITE_URL}/conta/entrar/link?token=${token}`,
    );
  }

  /**
   * Entra pelo link.
   *
   * Abrir o link prova que a pessoa controla a caixa de entrada, então o
   * e-mail é dado como confirmado de brinde.
   */
  async entrarComLink(
    token: string,
    contexto: ContextoDeAcesso,
  ): Promise<{ token: string; cliente: ClienteDaSessao }> {
    const customerId = await this.consumir(token, 'magic_link');

    const cliente = await this.prisma.customer.update({
      where: { id: customerId },
      data: { lastLoginAt: new Date(), emailVerifiedAt: new Date() },
    });

    return { token: await this.abrirSessao(cliente.id, contexto), cliente: paraSessao(cliente) };
  }

  async esqueciASenha(emailBruto: string): Promise<void> {
    const cliente = await this.clientePorEmail(emailBruto);
    if (!cliente?.email) return;

    const token = await this.emitir(cliente.id, 'redefinir_senha');
    await this.mail.redefinirSenha(
      { email: cliente.email, nome: cliente.name },
      `${this.env.SITE_URL}/conta/redefinir?token=${token}`,
    );
  }

  /**
   * Troca a senha esquecida e já deixa a pessoa dentro.
   *
   * Todas as sessões anteriores caem: quem pede para redefinir a senha pode
   * estar fazendo isso justamente porque alguém entrou na conta.
   */
  async redefinirSenha(
    token: string,
    senha: string,
    contexto: ContextoDeAcesso,
  ): Promise<{ token: string; cliente: ClienteDaSessao }> {
    this.exigirSenhaBoa(senha);
    const customerId = await this.consumir(token, 'redefinir_senha');

    await this.revogarTodas(customerId);

    const cliente = await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        passwordHash: await AuthService.hashPassword(senha),
        // Receber o link de recuperação também prova o e-mail.
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
      },
    });

    await this.avisos.criar(customerId, {
      type: 'conta',
      title: 'Sua senha foi alterada',
      body: 'Se não foi você, redefina a senha de novo e fale com a loja.',
    });

    return { token: await this.abrirSessao(cliente.id, contexto), cliente: paraSessao(cliente) };
  }

  async enviarConfirmacao(customerId: string): Promise<void> {
    try {
      const cliente = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (!cliente?.email || cliente.emailVerifiedAt) return;

      const token = await this.emitir(cliente.id, 'verificar_email');
      await this.mail.confirmarEmail(
        { email: cliente.email, nome: cliente.name },
        `${this.env.SITE_URL}/conta/verificar?token=${token}`,
      );
    } catch (erro) {
      this.logger.warn(`Confirmação de e-mail não saiu para ${customerId}: ${String(erro)}`);
    }
  }

  async confirmarEmail(token: string): Promise<void> {
    const customerId = await this.consumir(token, 'verificar_email');

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /**
   * Troca de senha com a pessoa já dentro da conta.
   *
   * Conta criada só pelo link de entrada não tem senha: nesse caso a primeira
   * senha é definida sem pedir a atual. As outras sessões caem; a atual
   * continua.
   */
  async trocarSenha(
    customerId: string,
    atual: string | undefined,
    nova: string,
    tokenDaSessaoAtual: string | undefined,
  ): Promise<void> {
    this.exigirSenhaBoa(nova);

    const cliente = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

    if (cliente.passwordHash) {
      const certa = atual ? await verify(cliente.passwordHash, atual).catch(() => false) : false;
      if (!certa) throw new BadRequestException('A senha atual não confere.');
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash: await AuthService.hashPassword(nova) },
    });

    await this.prisma.customerSession.updateMany({
      where: {
        customerId,
        revokedAt: null,
        ...(tokenDaSessaoAtual ? { tokenHash: { not: this.hash(tokenDaSessaoAtual) } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  async revogarTodas(customerId: string): Promise<void> {
    await this.prisma.customerSession.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  private async abrirSessao(customerId: string, contexto: ContextoDeAcesso): Promise<string> {
    const token = randomBytes(32).toString('base64url');

    await this.prisma.customerSession.create({
      data: {
        customerId,
        tokenHash: this.hash(token),
        userAgent: contexto.userAgent?.slice(0, 255) ?? null,
        ip: contexto.ip ?? null,
        expiresAt: new Date(Date.now() + SESSAO_MS),
      },
    });

    return token;
  }

  /**
   * Emite um link de uso único.
   *
   * Os links anteriores do mesmo tipo são invalidados: só o último e-mail
   * vale. Quem pediu três vezes e abriu o primeiro não deve entrar com um link
   * que ela mesma já considerava perdido.
   */
  private async emitir(customerId: string, purpose: CustomerTokenPurpose): Promise<string> {
    const token = randomBytes(32).toString('base64url');

    await this.prisma.$transaction([
      this.prisma.customerToken.updateMany({
        where: { customerId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.customerToken.create({
        data: {
          customerId,
          purpose,
          tokenHash: this.hash(token),
          expiresAt: new Date(Date.now() + VALIDADE_MS[purpose]),
        },
      }),
    ]);

    return token;
  }

  /**
   * Gasta o link e devolve de quem ele era.
   *
   * O `updateMany` com `usedAt: null` no filtro é o que garante o uso único
   * mesmo com dois cliques simultâneos: só um deles consegue marcar a linha.
   */
  private async consumir(token: string, purpose: CustomerTokenPurpose): Promise<string> {
    const linha = await this.prisma.customerToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { customer: { select: { anonymizedAt: true } } },
    });

    const invalido = new BadRequestException('Este link expirou ou já foi usado. Peça outro.');

    if (!linha || linha.purpose !== purpose || linha.customer.anonymizedAt) throw invalido;
    if (linha.usedAt || linha.expiresAt < new Date()) throw invalido;

    const marcado = await this.prisma.customerToken.updateMany({
      where: { id: linha.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (marcado.count !== 1) throw invalido;
    return linha.customerId;
  }

  private async clientePorEmail(emailBruto: string) {
    const cliente = await this.prisma.customer.findFirst({
      where: {
        email: { equals: normalizeEmail(emailBruto), mode: 'insensitive' },
        anonymizedAt: null,
      },
      select: { id: true, name: true, email: true },
    });

    // Sem conta, o custo de tempo tem que ser o mesmo de quando há conta —
    // senão o relógio conta o que a resposta esconde.
    if (!cliente) await gastarTempo();
    return cliente;
  }

  private exigirSenhaBoa(senha: string): void {
    const problema = checkPassword(senha);
    if (problema) throw new BadRequestException(PASSWORD_PROBLEM_MESSAGES[problema]);
  }

  /**
   * HMAC com separação de domínio.
   *
   * Mesmo segredo do painel, mas com o prefixo `cliente:` — um token de
   * sessão de cliente nunca produz o mesmo hash que um refresh do painel,
   * mesmo que alguém tente reaproveitar um no lugar do outro.
   */
  private hash(token: string): string {
    return createHmac('sha256', this.env.JWT_REFRESH_SECRET)
      .update(`cliente:${token}`)
      .digest('hex');
  }
}

function paraSessao(cliente: Prisma.CustomerGetPayload<object>): ClienteDaSessao {
  return {
    id: cliente.id,
    name: cliente.name,
    email: cliente.email,
    phone: cliente.phoneE164,
    emailVerified: cliente.emailVerifiedAt !== null,
    temSenha: cliente.passwordHash !== null,
    acceptsMarketing: cliente.acceptsMarketing,
    groupId: cliente.groupId,
  };
}

/** Equaliza o tempo de resposta quando a conta não existe. */
async function gastarTempo(): Promise<void> {
  await verify(
    '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2E$0000000000000000000000000000000000000000000',
    'senha-invalida',
  ).catch(() => false);
}
