import { isUf, isValidCep, MAX_FAVORITES } from '@aurora/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  apagarCookieDoCarrinho,
  gravarCookieDoCarrinho,
  lerCookieDoCarrinho,
} from '../cart/cart.cookie';
import { CartService } from '../cart/cart.service';
import { telefoneBr, textoOpcional } from '../common/br-schemas';
import { clientIp } from '../common/current-user';
import { Public } from '../common/permissions.decorator';
import { LIMITES, RateLimitService } from '../common/rate-limit.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountService } from './account.service';
import { AddressesService } from './addresses.service';
import {
  type ClienteDaSessao,
  CUSTOMER_COOKIE,
  CustomerAuthService,
} from './customer-auth.service';
import { ClienteAtual, CustomerGuard, tokenDaSessao } from './customer.guard';

const email = z.string().trim().toLowerCase().email('Informe um e-mail válido.').max(160);

/** A política de senha mora no serviço; aqui só o formato. */
const senha = z.string().min(1, 'Informe a senha.').max(200);

const token = z.string().trim().min(20, 'Link inválido.').max(200);

const cadastroSchema = z.object({
  nome: z.string().trim().min(2, 'Como podemos te chamar?').max(120),
  email,
  telefone: telefoneBr,
  senha,
  aceitaMarketing: z.boolean().default(false),
  // Sem o aceite dos termos não existe conta: é o registro que a LGPD pede.
  aceitaTermos: z.literal(true, {
    errorMap: () => ({ message: 'Aceite os termos para criar a conta.' }),
  }),
});

const loginSchema = z.object({ email, senha });
const emailSchema = z.object({ email });
const tokenSchema = z.object({ token });
const redefinirSchema = z.object({ token, senha });

const perfilSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  telefone: telefoneBr,
  aceitaMarketing: z.boolean(),
});

const trocarSenhaSchema = z.object({
  atual: z.string().max(200).optional(),
  nova: senha,
});

const enderecoSchema = z.object({
  label: textoOpcional(40),
  cep: z.string().refine(isValidCep, 'CEP inválido.'),
  street: z.string().trim().min(2, 'Informe a rua.').max(160),
  number: z.string().trim().min(1, 'Informe o número.').max(20),
  complement: textoOpcional(80),
  district: z.string().trim().min(2, 'Informe o bairro.').max(80),
  city: z.string().trim().min(2, 'Informe a cidade.').max(80),
  uf: z
    .string()
    .trim()
    .transform((valor) => valor.toUpperCase())
    .refine(isUf, 'UF inválida.'),
  reference: textoOpcional(160),
  isDefault: z.boolean().optional(),
});

const favoritosSchema = z.object({
  ids: z.array(z.string().uuid()).max(MAX_FAVORITES),
});

const lidasSchema = z.object({
  ids: z.array(z.string().uuid()).max(100).optional(),
});

const paginaSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

/**
 * Entrada, saída e links por e-mail. Público: é por aqui que se chega à conta.
 */
@ApiTags('Conta do cliente')
@Public()
@Controller('account')
export class AccountAuthController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly carrinho: CartService,
    private readonly avisos: NotificationsService,
    private readonly limite: RateLimitService,
  ) {}

  @Get('me')
  @ApiOkResponse({
    description:
      'Quem está logado, ou `null`. Nunca responde 401 — a vitrine pergunta em toda página.',
  })
  async eu(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const cliente = await this.auth.daRequisicao(request);
    if (!cliente) return { cliente: null, naoLidas: 0 };

    // A cada visita logada o carrinho do navegador é conferido: se a pessoa
    // pôs itens antes de a sacola estar ligada à conta, eles passam a ser dela.
    await this.sincronizarCarrinho(request, response, cliente.id);

    return { cliente, naoLidas: await this.avisos.contarNaoLidas(cliente.id) };
  }

  @Post('register')
  @ApiOkResponse({ description: 'Cria a conta e já deixa a pessoa dentro.' })
  async cadastrar(
    @Body(new ZodValidationPipe(cadastroSchema)) corpo: z.infer<typeof cadastroSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ip = clientIp(request) ?? 'desconhecido';
    this.limite.consumir(
      `conta:cadastro:${ip}`,
      LIMITES.cadastroPorIp.limite,
      LIMITES.cadastroPorIp.janelaMs,
    );

    const sessao = await this.auth.cadastrar(corpo, this.contexto(request));
    await this.abrirNoNavegador(request, response, sessao);

    return { cliente: sessao.cliente };
  }

  @Post('login')
  @ApiOkResponse({ description: 'Entra com e-mail e senha.' })
  async entrar(
    @Body(new ZodValidationPipe(loginSchema)) corpo: z.infer<typeof loginSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ip = clientIp(request) ?? 'desconhecido';
    this.limite.consumir(
      `conta:login:ip:${ip}`,
      LIMITES.loginPorIp.limite,
      LIMITES.loginPorIp.janelaMs,
    );
    this.limite.consumir(
      `conta:login:email:${corpo.email}`,
      LIMITES.loginPorEmail.limite,
      LIMITES.loginPorEmail.janelaMs,
    );

    const sessao = await this.auth.entrar(corpo.email, corpo.senha, this.contexto(request));
    this.limite.liberar(`conta:login:email:${corpo.email}`);

    await this.abrirNoNavegador(request, response, sessao);
    return { cliente: sessao.cliente };
  }

  /**
   * Sai da conta e leva o carrinho junto.
   *
   * O carrinho continua salvo na conta, mas o navegador esquece dele: num
   * computador compartilhado, a próxima pessoa não deve encontrar a sacola —
   * nem o nome — de quem saiu.
   */
  @Post('logout')
  @ApiOkResponse({ description: 'Encerra a sessão deste navegador.' })
  async sair(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.sair(tokenDaSessao(request));
    response.clearCookie(CUSTOMER_COOKIE, { path: '/' });
    apagarCookieDoCarrinho(response);

    return { ok: true };
  }

  @Post('magic-link')
  @ApiOkResponse({ description: 'Manda o link de entrada. Responde igual exista ou não a conta.' })
  async pedirLink(
    @Body(new ZodValidationPipe(emailSchema)) corpo: z.infer<typeof emailSchema>,
    @Req() request: Request,
  ) {
    this.limitarEmail(corpo.email, request);
    await this.auth.pedirLinkDeEntrada(corpo.email);

    return {
      ok: true,
      mensagem: 'Se houver uma conta com este e-mail, o link chega em instantes.',
    };
  }

  @Post('magic-link/verify')
  @ApiOkResponse({ description: 'Entra pelo link recebido por e-mail.' })
  async entrarComLink(
    @Body(new ZodValidationPipe(tokenSchema)) corpo: z.infer<typeof tokenSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessao = await this.auth.entrarComLink(corpo.token, this.contexto(request));
    await this.abrirNoNavegador(request, response, sessao);

    return { cliente: sessao.cliente };
  }

  @Post('password/forgot')
  @ApiOkResponse({
    description: 'Manda o link de nova senha. Responde igual exista ou não a conta.',
  })
  async esqueci(
    @Body(new ZodValidationPipe(emailSchema)) corpo: z.infer<typeof emailSchema>,
    @Req() request: Request,
  ) {
    this.limitarEmail(corpo.email, request);
    await this.auth.esqueciASenha(corpo.email);

    return {
      ok: true,
      mensagem:
        'Se houver uma conta com este e-mail, o link para criar uma senha nova chega em instantes.',
    };
  }

  @Post('password/reset')
  @ApiOkResponse({ description: 'Troca a senha pelo link e já entra. Derruba as outras sessões.' })
  async redefinir(
    @Body(new ZodValidationPipe(redefinirSchema)) corpo: z.infer<typeof redefinirSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessao = await this.auth.redefinirSenha(corpo.token, corpo.senha, this.contexto(request));
    await this.abrirNoNavegador(request, response, sessao);

    return { cliente: sessao.cliente };
  }

  @Post('email/verify')
  @ApiOkResponse({ description: 'Confirma o e-mail pelo link.' })
  async confirmar(@Body(new ZodValidationPipe(tokenSchema)) corpo: z.infer<typeof tokenSchema>) {
    await this.auth.confirmarEmail(corpo.token);
    return { ok: true };
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  private contexto(request: Request) {
    return { ip: clientIp(request), userAgent: request.headers['user-agent'] ?? null };
  }

  /** Cada pedido de link manda um e-mail: limite por endereço e por IP. */
  private limitarEmail(emailAlvo: string, request: Request): void {
    const ip = clientIp(request) ?? 'desconhecido';
    this.limite.consumir(
      `conta:email:ip:${ip}`,
      LIMITES.emailPorIp.limite,
      LIMITES.emailPorIp.janelaMs,
    );
    this.limite.consumir(
      `conta:email:${emailAlvo}`,
      LIMITES.emailPorEndereco.limite,
      LIMITES.emailPorEndereco.janelaMs,
    );
  }

  private async abrirNoNavegador(
    request: Request,
    response: Response,
    sessao: { token: string; cliente: ClienteDaSessao },
  ): Promise<void> {
    response.cookie(CUSTOMER_COOKIE, sessao.token, {
      httpOnly: true,
      // `lax`: o cookie vai nas navegações vindas de fora (o link do e-mail),
      // mas não em POST disparado por outro site.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: this.auth.sessaoMs,
    });

    await this.sincronizarCarrinho(request, response, sessao.cliente.id);
  }

  private async sincronizarCarrinho(
    request: Request,
    response: Response,
    customerId: string,
  ): Promise<void> {
    const atual = lerCookieDoCarrinho(request);
    const proximo = await this.carrinho.adotar(atual, customerId);

    if (proximo && proximo !== atual) gravarCookieDoCarrinho(response, proximo);
    // O cookie apontava para o carrinho de outra conta: some daqui.
    if (!proximo && atual) apagarCookieDoCarrinho(response);
  }
}

/**
 * A área logada: dados, pedidos, endereços, favoritos, avisos e cupons.
 */
@ApiTags('Conta do cliente')
@Public()
@UseGuards(CustomerGuard)
@Controller('account')
export class AccountController {
  constructor(
    private readonly conta: AccountService,
    private readonly enderecos: AddressesService,
    private readonly auth: CustomerAuthService,
    private readonly avisos: NotificationsService,
    private readonly carrinho: CartService,
    private readonly limite: RateLimitService,
  ) {}

  @Post('email/resend')
  @ApiOkResponse({ description: 'Manda de novo o link de confirmação do e-mail.' })
  async reenviarConfirmacao(@ClienteAtual() cliente: ClienteDaSessao) {
    this.limite.consumir(
      `conta:reenvio:${cliente.id}`,
      LIMITES.emailPorEndereco.limite,
      LIMITES.emailPorEndereco.janelaMs,
    );
    await this.auth.enviarConfirmacao(cliente.id);

    return { ok: true };
  }

  @Get('profile')
  @ApiOkResponse({ description: 'Meus dados.' })
  perfil(@ClienteAtual() cliente: ClienteDaSessao) {
    return this.conta.perfil(cliente.id);
  }

  @Patch('profile')
  @ApiOkResponse({ description: 'Atualiza nome, telefone e o aceite de novidades.' })
  atualizarPerfil(
    @ClienteAtual() cliente: ClienteDaSessao,
    @Body(new ZodValidationPipe(perfilSchema)) corpo: z.infer<typeof perfilSchema>,
    @Req() request: Request,
  ) {
    return this.conta.atualizarPerfil(cliente.id, corpo, clientIp(request));
  }

  @Post('password')
  @ApiOkResponse({ description: 'Troca a senha. As outras sessões caem; esta continua.' })
  async trocarSenha(
    @ClienteAtual() cliente: ClienteDaSessao,
    @Body(new ZodValidationPipe(trocarSenhaSchema)) corpo: z.infer<typeof trocarSenhaSchema>,
    @Req() request: Request,
  ) {
    await this.auth.trocarSenha(cliente.id, corpo.atual, corpo.nova, tokenDaSessao(request));
    return { ok: true };
  }

  @Get('orders')
  @ApiOkResponse({ description: 'Meus pedidos.' })
  pedidos(
    @ClienteAtual() cliente: ClienteDaSessao,
    @Query(new ZodValidationPipe(paginaSchema)) query: z.infer<typeof paginaSchema>,
  ) {
    return this.conta.pedidos(cliente.id, query.page);
  }

  @Get('orders/:code')
  @ApiOkResponse({ description: 'Um pedido meu, com histórico e link para o WhatsApp.' })
  pedido(@ClienteAtual() cliente: ClienteDaSessao, @Param('code') code: string) {
    return this.conta.pedido(cliente.id, code);
  }

  @Post('orders/:code/reorder')
  @ApiOkResponse({ description: 'Põe no carrinho o que ainda está à venda deste pedido.' })
  async pedirDeNovo(
    @ClienteAtual() cliente: ClienteDaSessao,
    @Param('code') code: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = (await this.carrinho.adotar(lerCookieDoCarrinho(request), cliente.id, {
      criar: true,
    }))!;
    gravarCookieDoCarrinho(response, token);

    return this.conta.pedirDeNovo(cliente.id, code, token);
  }

  @Get('addresses')
  @ApiOkResponse({ description: 'Meus endereços, o padrão primeiro.' })
  enderecosDoCliente(@ClienteAtual() cliente: ClienteDaSessao) {
    return this.enderecos.listar(cliente.id);
  }

  @Post('addresses')
  criarEndereco(
    @ClienteAtual() cliente: ClienteDaSessao,
    @Body(new ZodValidationPipe(enderecoSchema)) corpo: z.infer<typeof enderecoSchema>,
  ) {
    return this.enderecos.criar(cliente.id, corpo);
  }

  @Patch('addresses/:id')
  atualizarEndereco(
    @ClienteAtual() cliente: ClienteDaSessao,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(enderecoSchema)) corpo: z.infer<typeof enderecoSchema>,
  ) {
    return this.enderecos.atualizar(cliente.id, id, corpo);
  }

  @Delete('addresses/:id')
  async removerEndereco(@ClienteAtual() cliente: ClienteDaSessao, @Param('id') id: string) {
    await this.enderecos.remover(cliente.id, id);
    return this.enderecos.listar(cliente.id);
  }

  @Post('addresses/:id/default')
  tornarPadrao(@ClienteAtual() cliente: ClienteDaSessao, @Param('id') id: string) {
    return this.enderecos.tornarPadrao(cliente.id, id);
  }

  /**
   * Consulta de CEP atrás do login: aberta, viraria um proxy grátis do
   * ViaCEP pendurado no servidor da loja.
   */
  @Get('cep/:cep')
  @ApiOkResponse({ description: 'Rua, bairro e cidade do CEP — ou `null`, e a pessoa digita.' })
  async cep(@Param('cep') cep: string) {
    return { endereco: await this.enderecos.buscarCep(cep) };
  }

  @Get('favorites')
  async favoritos(@ClienteAtual() cliente: ClienteDaSessao) {
    return { ids: await this.conta.favoritos(cliente.id) };
  }

  @Put('favorites')
  @ApiOkResponse({ description: 'Grava a lista inteira, já unida à do navegador pela vitrine.' })
  async salvarFavoritos(
    @ClienteAtual() cliente: ClienteDaSessao,
    @Body(new ZodValidationPipe(favoritosSchema)) corpo: z.infer<typeof favoritosSchema>,
  ) {
    return { ids: await this.conta.salvarFavoritos(cliente.id, corpo.ids) };
  }

  @Get('notifications')
  avisosDoCliente(
    @ClienteAtual() cliente: ClienteDaSessao,
    @Query(new ZodValidationPipe(paginaSchema)) query: z.infer<typeof paginaSchema>,
  ) {
    return this.avisos.listar(cliente.id, query.page);
  }

  @Post('notifications/read')
  @ApiOkResponse({ description: 'Marca como lidas. Sem ids, marca todas.' })
  async marcarLidas(
    @ClienteAtual() cliente: ClienteDaSessao,
    @Body(new ZodValidationPipe(lidasSchema)) corpo: z.infer<typeof lidasSchema>,
  ) {
    await this.avisos.marcarLidas(cliente.id, corpo.ids);
    return { naoLidas: await this.avisos.contarNaoLidas(cliente.id) };
  }

  @Get('coupons')
  @ApiOkResponse({ description: 'Cupons da loja listados na área do cliente.' })
  cupons(@ClienteAtual() cliente: ClienteDaSessao) {
    return this.conta.cupons(cliente.id);
  }
}
