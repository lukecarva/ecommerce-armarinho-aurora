import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdminOrdersService } from './admin-orders.service';

/** Avisos e e-mail não são o que se testa aqui: os pedidos de teste não têm conta. */
const AVISOS_FALSOS = { criar: () => Promise.resolve() } as never;
const MAIL_FALSO = { pedidoAtualizado: () => Promise.resolve('') } as never;

/**
 * O que se verifica aqui são as travas que o relatório depende: perda sem
 * motivo é recusada, valor fechado fora de hora é recusado, e o CSV não sai
 * com fórmula embutida no nome de um cliente.
 */

function montar(pedido: Record<string, unknown> | null = { id: 'o1', status: 'novo' }) {
  const atualizacoes: Array<Record<string, unknown>> = [];

  const prisma = {
    order: {
      findUnique: () => Promise.resolve(pedido),
      findMany: () =>
        Promise.resolve([
          {
            code: 'CP-2026-0001',
            status: 'novo',
            createdAt: new Date('2026-09-09T10:00:00Z'),
            guestName: '=SOMA(A1:A9)',
            guestPhone: '5511999990000',
            guestEmail: null,
            deliveryLabel: 'Retirar na loja',
            deliveryNote: null,
            subtotal: 7969,
            discount: 0,
            totalEstimate: 7969,
            finalValue: null,
            lostReason: null,
            whatsappClickedAt: null,
            items: [{ id: 'i1' }],
          },
        ]),
      update: (args: { data: Record<string, unknown> }) => {
        atualizacoes.push(args.data);
        return Promise.resolve({
          code: 'CP-2026-0001',
          status: args.data.status ?? 'novo',
          createdAt: new Date(),
          guestName: 'Maria',
          guestPhone: '5511999990000',
          deliveryLabel: 'Retirar na loja',
          subtotal: 1000,
          discount: 0,
          totalEstimate: 1000,
          finalValue: args.data.finalValue ?? null,
          whatsappClickedAt: null,
          items: [],
        });
      },
    },
  } as unknown as PrismaService;

  return { servico: new AdminOrdersService(prisma, AVISOS_FALSOS, MAIL_FALSO), atualizacoes };
}

describe('mudança de status', () => {
  it('recusa "perdido" sem motivo — senão o relatório não explica nada', async () => {
    const { servico } = montar();

    await expect(servico.mudarStatus('CP-2026-0001', { status: 'perdido' }, 'u1')).rejects.toThrow(
      /motivo/i,
    );
  });

  it('recusa "cancelado" sem motivo', async () => {
    const { servico } = montar();

    await expect(
      servico.mudarStatus('CP-2026-0001', { status: 'cancelado' }, 'u1'),
    ).rejects.toThrow(/motivo/i);
  });

  it('aceita a perda quando há motivo, e o guarda', async () => {
    const { servico, atualizacoes } = montar();

    await servico.mudarStatus(
      'CP-2026-0001',
      { status: 'perdido', lostReason: 'achou mais barato' },
      'u1',
    );

    expect(atualizacoes[0]).toMatchObject({ status: 'perdido', lostReason: 'achou mais barato' });
  });

  it('recusa valor fechado antes de haver venda', async () => {
    const { servico } = montar();

    await expect(
      servico.mudarStatus('CP-2026-0001', { status: 'em_atendimento', finalValue: 5000 }, 'u1'),
    ).rejects.toThrow(/valor fechado/i);
  });

  it('aceita o valor fechado a partir de pago', async () => {
    const { servico, atualizacoes } = montar();

    await servico.mudarStatus('CP-2026-0001', { status: 'pago', finalValue: 7500 }, 'u1');

    expect(atualizacoes[0]?.finalValue).toBeDefined();
  });

  it('encerrar marca a data; reabrir limpa a marca', async () => {
    const encerrado = montar();
    await encerrado.servico.mudarStatus(
      'CP-2026-0001',
      { status: 'entregue', finalValue: 7969 },
      'u1',
    );
    expect(encerrado.atualizacoes[0]?.closedAt).toBeInstanceOf(Date);

    const reaberto = montar();
    await reaberto.servico.mudarStatus('CP-2026-0001', { status: 'em_atendimento' }, 'u1');
    expect(reaberto.atualizacoes[0]?.closedAt).toBeNull();
  });

  it('some com o motivo ao tirar o pedido da perda', async () => {
    const { servico, atualizacoes } = montar();

    await servico.mudarStatus('CP-2026-0001', { status: 'em_atendimento' }, 'u1');

    expect(atualizacoes[0]?.lostReason).toBeNull();
  });

  it('pedido inexistente responde 404, não 500', async () => {
    const { servico } = montar(null);

    await expect(servico.mudarStatus('CP-2026-9999', { status: 'pago' }, 'u1')).rejects.toThrow(
      /não encontrado/i,
    );
  });
});

describe('exportação CSV', () => {
  it('neutraliza fórmula no nome do cliente', async () => {
    const { servico } = montar();

    const csv = await servico.exportarCsv({});

    // O nome começa com "=" e viraria fórmula ao abrir a planilha.
    expect(csv).toContain('"\'=SOMA(A1:A9)"');
    expect(csv).not.toContain('"=SOMA(A1:A9)"');
  });

  it('abre no Excel em português: BOM, ponto e vírgula e vírgula decimal', async () => {
    const { servico } = montar();

    const csv = await servico.exportarCsv({});

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split('\r\n')[0]).toContain('codigo;criado_em;status');
    expect(csv).toContain('"7969,00"');
  });
});

describe('kanban', () => {
  it('distribui os pedidos nas colunas sem perder nenhum', async () => {
    const prisma = {
      order: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            card('CP-2026-0001', 'novo'),
            card('CP-2026-0002', 'pago'),
            card('CP-2026-0003', 'separado'),
            card('CP-2026-0004', 'entregue'),
            card('CP-2026-0005', 'perdido'),
          ]),
      },
    } as unknown as PrismaService;

    const quadro = await new AdminOrdersService(prisma, AVISOS_FALSOS, MAIL_FALSO).kanban();
    const total = quadro.colunas.reduce((soma, coluna) => soma + coluna.items.length, 0);

    expect(total).toBe(5);
    // "Pago" e "Separado" moram na mesma coluna; "Entregue" cai em Concluído.
    expect(quadro.colunas.find((c) => c.key === 'pago')?.items).toHaveLength(2);
    expect(quadro.colunas.find((c) => c.key === 'concluido')?.items).toHaveLength(1);
    expect(quadro.colunas.find((c) => c.key === 'perdido')?.items).toHaveLength(1);
  });

  it('marca como atrasado o pedido novo parado há mais de um dia', async () => {
    const antigo = card('CP-2026-0009', 'novo');
    antigo.createdAt = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const prisma = {
      order: { findMany: vi.fn().mockResolvedValue([antigo, card('CP-2026-0010', 'novo')]) },
    } as unknown as PrismaService;

    const quadro = await new AdminOrdersService(prisma, AVISOS_FALSOS, MAIL_FALSO).kanban();
    const novos = quadro.colunas.find((coluna) => coluna.key === 'novo')!.items;

    expect(novos.find((item) => item.code === 'CP-2026-0009')?.atrasado).toBe(true);
    expect(novos.find((item) => item.code === 'CP-2026-0010')?.atrasado).toBe(false);
  });
});

function card(code: string, status: string) {
  return {
    code,
    status,
    createdAt: new Date(),
    guestName: 'Maria',
    guestPhone: '5511999990000',
    deliveryLabel: 'Retirar na loja',
    subtotal: 1000,
    discount: 0,
    totalEstimate: 1000,
    finalValue: null,
    whatsappClickedAt: null,
    items: [{ id: 'i1' }],
  };
}
