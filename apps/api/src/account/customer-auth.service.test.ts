import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import type { MailService } from '../mail/mail.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CustomerAuthService } from './customer-auth.service';

/**
 * O que se verifica aqui é o que decide acesso: mensagens iguais para conta
 * inexistente e senha errada, token nunca guardado em claro, link de uso
 * único e sessão que morre quando deve.
 */

let hashDaSenha = '';

beforeAll(async () => {
  hashDaSenha = await AuthService.hashPassword('linha de costura azul');
});

function cliente(extra: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'Maria Silva',
    email: 'maria@exemplo.com',
    phoneE164: '5511999990000',
    passwordHash: hashDaSenha,
    emailVerifiedAt: null,
    acceptsMarketing: false,
    groupId: 'g1',
    anonymizedAt: null,
    ...extra,
  };
}

function montar(
  estado: {
    cliente?: ReturnType<typeof cliente> | null;
    token?: Record<string, unknown> | null;
    sessao?: Record<string, unknown> | null;
    marcarToken?: number;
  } = {},
) {
  const sessoes: Array<Record<string, unknown>> = [];
  const tokens: Array<Record<string, unknown>> = [];

  const prisma = {
    customer: {
      findFirst: vi.fn().mockResolvedValue(estado.cliente ?? null),
      findUnique: vi.fn().mockResolvedValue(estado.cliente ?? null),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...cliente(), ...args.data, id: 'novo' }),
      ),
      update: vi.fn(() => Promise.resolve(estado.cliente ?? cliente())),
    },
    customerGroup: { findFirst: vi.fn().mockResolvedValue({ id: 'g1' }) },
    customerSession: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        sessoes.push(args.data);
        return Promise.resolve(args.data);
      }),
      findUnique: vi.fn().mockResolvedValue(estado.sessao ?? null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    customerToken: {
      findUnique: vi.fn().mockResolvedValue(estado.token ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: estado.marcarToken ?? 1 }),
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        tokens.push(args.data);
        return Promise.resolve(args.data);
      }),
    },
    $transaction: vi.fn((operacoes: Array<Promise<unknown>>) => Promise.all(operacoes)),
  } as unknown as PrismaService;

  const mail = {
    entrarComLink: vi.fn().mockResolvedValue('x'),
    redefinirSenha: vi.fn().mockResolvedValue('x'),
    confirmarEmail: vi.fn().mockResolvedValue('x'),
  };

  const avisos = { criar: vi.fn().mockResolvedValue(undefined) };

  const servico = new CustomerAuthService(
    prisma,
    mail as unknown as MailService,
    avisos as unknown as NotificationsService,
  );

  return { servico, prisma, mail, sessoes, tokens };
}

const CONTEXTO = { ip: '10.0.0.1', userAgent: 'teste' };

describe('cadastro', () => {
  const dados = {
    nome: 'Maria Silva',
    email: 'Maria@Exemplo.com',
    telefone: '5511999990000',
    senha: 'linha de costura azul',
    aceitaMarketing: true,
  };

  it('cria a conta, abre a sessão e guarda o consentimento com a versão do texto', async () => {
    const { servico, prisma } = montar();

    const resultado = await servico.cadastrar(dados, CONTEXTO);

    expect(resultado.token).toBeTruthy();
    const criado = vi.mocked(prisma.customer.create).mock.calls[0]![0].data as unknown as {
      email: string;
      passwordHash: string;
      consent: { termos: { versao: string }; marketing: { aceito: boolean } };
    };
    // E-mail normalizado: "Maria@Exemplo.com" e "maria@exemplo.com" são a mesma caixa.
    expect(criado.email).toBe('maria@exemplo.com');
    expect(criado.consent.termos.versao).toBeTruthy();
    expect(criado.consent.marketing.aceito).toBe(true);
    expect(criado.passwordHash).not.toBe(dados.senha);
  });

  it('recusa e-mail que já tem conta', async () => {
    const { servico } = montar({ cliente: cliente() });

    await expect(servico.cadastrar(dados, CONTEXTO)).rejects.toBeInstanceOf(ConflictException);
  });

  it('recusa senha fraca antes de tocar no banco', async () => {
    const { servico, prisma } = montar();

    await expect(
      servico.cadastrar({ ...dados, senha: '12345678' }, CONTEXTO),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.customer.findFirst).not.toHaveBeenCalled();
  });
});

describe('entrada com senha', () => {
  it('entra com a senha certa e guarda só o hash do token', async () => {
    const { servico, sessoes } = montar({ cliente: cliente() });

    const { token } = await servico.entrar('maria@exemplo.com', 'linha de costura azul', CONTEXTO);

    expect(sessoes).toHaveLength(1);
    expect(sessoes[0]!.tokenHash).not.toBe(token);
    expect(sessoes[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('senha errada e e-mail inexistente respondem exatamente igual', async () => {
    const semConta = montar({ cliente: null });
    const senhaErrada = montar({ cliente: cliente() });

    const erroA = await semConta.servico
      .entrar('ninguem@exemplo.com', 'qualquer coisa', CONTEXTO)
      .catch((e) => e);
    const erroB = await senhaErrada.servico
      .entrar('maria@exemplo.com', 'senha errada!', CONTEXTO)
      .catch((e) => e);

    expect(erroA).toBeInstanceOf(UnauthorizedException);
    expect(erroB).toBeInstanceOf(UnauthorizedException);
    expect(erroA.message).toBe(erroB.message);
  });

  it('conta anonimizada não entra', async () => {
    const { servico } = montar({ cliente: cliente({ anonymizedAt: new Date() }) });

    await expect(
      servico.entrar('maria@exemplo.com', 'linha de costura azul', CONTEXTO),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('link de entrada', () => {
  it('sem conta, não manda e-mail nenhum — e não conta isso a quem pediu', async () => {
    const { servico, mail } = montar({ cliente: null });

    await expect(servico.pedirLinkDeEntrada('ninguem@exemplo.com')).resolves.toBeUndefined();
    expect(mail.entrarComLink).not.toHaveBeenCalled();
  });

  it('com conta, manda o link e guarda só o hash', async () => {
    const { servico, mail, tokens } = montar({ cliente: cliente() });

    await servico.pedirLinkDeEntrada('maria@exemplo.com');

    const link = String(mail.entrarComLink.mock.calls[0]![1]);
    const token = new URL(link).searchParams.get('token')!;
    expect(token.length).toBeGreaterThan(30);
    expect(tokens[0]!.tokenHash).not.toBe(token);
  });

  it('link válido abre a sessão e confirma o e-mail de brinde', async () => {
    const { servico, prisma } = montar({
      token: {
        id: 't1',
        customerId: 'c1',
        purpose: 'magic_link',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        customer: { anonymizedAt: null },
      },
      cliente: cliente(),
    });

    const { token } = await servico.entrarComLink('x'.repeat(43), CONTEXTO);

    expect(token).toBeTruthy();
    const atualizacao = vi.mocked(prisma.customer.update).mock.calls[0]![0].data as Record<
      string,
      unknown
    >;
    expect(atualizacao.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('link já usado não entra', async () => {
    const { servico } = montar({
      token: {
        id: 't1',
        customerId: 'c1',
        purpose: 'magic_link',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        customer: { anonymizedAt: null },
      },
    });

    await expect(servico.entrarComLink('x'.repeat(43), CONTEXTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('link vencido não entra', async () => {
    const { servico } = montar({
      token: {
        id: 't1',
        customerId: 'c1',
        purpose: 'magic_link',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1),
        customer: { anonymizedAt: null },
      },
    });

    await expect(servico.entrarComLink('x'.repeat(43), CONTEXTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('dois cliques simultâneos: só um consegue gastar o link', async () => {
    // O segundo encontra a linha já marcada — o `updateMany` não altera nada.
    const { servico } = montar({
      token: {
        id: 't1',
        customerId: 'c1',
        purpose: 'magic_link',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        customer: { anonymizedAt: null },
      },
      marcarToken: 0,
    });

    await expect(servico.entrarComLink('x'.repeat(43), CONTEXTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('link de recuperação não serve para entrar direto', async () => {
    const { servico } = montar({
      token: {
        id: 't1',
        customerId: 'c1',
        purpose: 'redefinir_senha',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        customer: { anonymizedAt: null },
      },
    });

    await expect(servico.entrarComLink('x'.repeat(43), CONTEXTO)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('sessão', () => {
  const futuro = new Date(Date.now() + 60 * 60 * 1000);

  it('sessão válida devolve o cliente', async () => {
    const { servico } = montar({
      sessao: {
        id: 's1',
        revokedAt: null,
        expiresAt: futuro,
        lastUsedAt: new Date(),
        customer: cliente(),
      },
    });

    expect((await servico.resolver('token'))?.id).toBe('c1');
  });

  it('sessão encerrada, vencida ou de conta anonimizada não vale', async () => {
    const encerrada = montar({
      sessao: {
        id: 's1',
        revokedAt: new Date(),
        expiresAt: futuro,
        lastUsedAt: new Date(),
        customer: cliente(),
      },
    });
    const vencida = montar({
      sessao: {
        id: 's1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1),
        lastUsedAt: new Date(),
        customer: cliente(),
      },
    });
    const anonimizada = montar({
      sessao: {
        id: 's1',
        revokedAt: null,
        expiresAt: futuro,
        lastUsedAt: new Date(),
        customer: cliente({ anonymizedAt: new Date() }),
      },
    });

    expect(await encerrada.servico.resolver('token')).toBeNull();
    expect(await vencida.servico.resolver('token')).toBeNull();
    expect(await anonimizada.servico.resolver('token')).toBeNull();
  });

  it('sem cookie, ninguém — sem consultar o banco', async () => {
    const { servico, prisma } = montar();

    expect(await servico.resolver(undefined)).toBeNull();
    expect(prisma.customerSession.findUnique).not.toHaveBeenCalled();
  });
});
