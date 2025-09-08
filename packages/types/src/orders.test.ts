import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES } from './enums.js';
import {
  acceptsFinalValue,
  applyCoupon,
  calculateTotals,
  formatOrderCode,
  isClosedStatus,
  KANBAN_COLUMNS,
  lineTotal,
  needsRecovery,
  parseOrderCode,
  requiresLostReason,
  type CouponRules,
} from './orders.js';

describe('calculateTotals', () => {
  it('soma as linhas do pedido do design', () => {
    const totais = calculateTotals([
      { quantity: 2, unitPrice: 1590 },
      { quantity: 1, unitPrice: 3590 },
      { quantity: 1, unitPrice: 1199 },
    ]);

    expect(totais.subtotal).toBe(7969); // R$ 79,69
    expect(totais.itemCount).toBe(3);
    expect(totais.total).toBe(7969);
  });

  it('arredonda cada linha uma vez, e não o total', () => {
    // 3 × R$ 3,33 = R$ 9,99 — não R$ 10,00.
    const totais = calculateTotals([{ quantity: 3, unitPrice: 333 }]);
    expect(totais.subtotal).toBe(999);
  });

  it('a soma das linhas bate com o subtotal, para a conta fechar na tela', () => {
    const linhas = [
      { quantity: 2.5, unitPrice: 1590 },
      { quantity: 0.5, unitPrice: 1990 },
      { quantity: 1.5, unitPrice: 333 },
    ];
    const soma = linhas.reduce((total, linha) => total + lineTotal(linha), 0);

    expect(calculateTotals(linhas).subtotal).toBe(soma);
  });

  it('metragem fracionada: 2,5 m × R$ 15,90 = R$ 39,75', () => {
    expect(lineTotal({ quantity: 2.5, unitPrice: 1590 })).toBe(3975);
  });

  it('desconto sai do subtotal', () => {
    const totais = calculateTotals([{ quantity: 1, unitPrice: 10000 }], 1500);

    expect(totais.discount).toBe(1500);
    expect(totais.total).toBe(8500);
  });

  it('desconto maior que o pedido zera a conta, não gera crédito', () => {
    const totais = calculateTotals([{ quantity: 1, unitPrice: 3000 }], 5000);

    expect(totais.discount).toBe(3000);
    expect(totais.total).toBe(0);
  });

  it('carrinho vazio não quebra', () => {
    expect(calculateTotals([])).toEqual({ itemCount: 0, subtotal: 0, discount: 0, total: 0 });
  });
});

describe('applyCoupon', () => {
  const percentual: CouponRules = { code: 'NATAL10', type: 'percent', value: 10, active: true };

  it('desconta o percentual', () => {
    expect(applyCoupon(10000, percentual)).toEqual({ valid: true, discount: 1000 });
  });

  it('desconta o valor fixo', () => {
    const cupom: CouponRules = { code: 'MENOS5', type: 'fixed', value: 500, active: true };
    expect(applyCoupon(10000, cupom)).toEqual({ valid: true, discount: 500 });
  });

  it('cupom fixo maior que o pedido para no subtotal', () => {
    const cupom: CouponRules = { code: 'MENOS50', type: 'fixed', value: 5000, active: true };
    expect(applyCoupon(3000, cupom)).toEqual({ valid: true, discount: 3000 });
  });

  it('recusa cupom que não existe', () => {
    const resultado = applyCoupon(10000, null);
    expect(resultado).toMatchObject({ valid: false, reason: 'inexistente' });
  });

  it('recusa cupom desligado', () => {
    const resultado = applyCoupon(10000, { ...percentual, active: false });
    expect(resultado).toMatchObject({ valid: false, reason: 'inativo' });
  });

  it('recusa antes de começar e depois de acabar', () => {
    const agora = new Date('2026-06-15T12:00:00Z');

    expect(
      applyCoupon(10000, { ...percentual, startsAt: '2026-07-01T00:00:00Z' }, agora),
    ).toMatchObject({ valid: false, reason: 'fora_da_data' });

    expect(
      applyCoupon(10000, { ...percentual, endsAt: '2026-06-01T00:00:00Z' }, agora),
    ).toMatchObject({ valid: false, reason: 'fora_da_data' });
  });

  it('aceita dentro da janela', () => {
    const agora = new Date('2026-06-15T12:00:00Z');
    const cupom = {
      ...percentual,
      startsAt: '2026-06-01T00:00:00Z',
      endsAt: '2026-06-30T00:00:00Z',
    };

    expect(applyCoupon(10000, cupom, agora)).toEqual({ valid: true, discount: 1000 });
  });

  it('recusa cupom esgotado', () => {
    const resultado = applyCoupon(10000, { ...percentual, usageLimit: 5, usedCount: 5 });
    expect(resultado).toMatchObject({ valid: false, reason: 'esgotado' });
  });

  it('recusa abaixo do valor mínimo, comparando com o subtotal sem desconto', () => {
    const resultado = applyCoupon(9900, { ...percentual, minSubtotal: 10000 });
    expect(resultado).toMatchObject({ valid: false, reason: 'subtotal_insuficiente' });

    expect(applyCoupon(10000, { ...percentual, minSubtotal: 10000 })).toEqual({
      valid: true,
      discount: 1000,
    });
  });

  it('a recusa vem com texto pronto para a tela', () => {
    const resultado = applyCoupon(100, { ...percentual, minSubtotal: 10000 });

    expect(resultado.valid).toBe(false);
    if (!resultado.valid) expect(resultado.message).toMatch(/valor mínimo/i);
  });
});

describe('status do pedido', () => {
  it('o kanban cobre todos os status, sem repetir nenhum', () => {
    const noQuadro = KANBAN_COLUMNS.flatMap((coluna) => coluna.statuses);

    expect([...noQuadro].sort()).toEqual([...ORDER_STATUSES].sort());
    expect(new Set(noQuadro).size).toBe(noQuadro.length);
  });

  it('reconhece o que já acabou', () => {
    expect(isClosedStatus('entregue')).toBe(true);
    expect(isClosedStatus('perdido')).toBe(true);
    expect(isClosedStatus('novo')).toBe(false);
    expect(isClosedStatus('pago')).toBe(false);
  });

  it('perda e cancelamento exigem motivo', () => {
    expect(requiresLostReason('perdido')).toBe(true);
    expect(requiresLostReason('cancelado')).toBe(true);
    expect(requiresLostReason('entregue')).toBe(false);
  });

  it('valor fechado só a partir de pago', () => {
    expect(acceptsFinalValue('pago')).toBe(true);
    expect(acceptsFinalValue('entregue')).toBe(true);
    expect(acceptsFinalValue('novo')).toBe(false);
    expect(acceptsFinalValue('perdido')).toBe(false);
  });
});

describe('código do pedido', () => {
  it('formata com quatro dígitos', () => {
    expect(formatOrderCode(2026, 1)).toBe('CP-2026-0001');
    expect(formatOrderCode(2026, 1234)).toBe('CP-2026-1234');
  });

  it('não trunca quando a loja passa de 9999 pedidos no ano', () => {
    expect(formatOrderCode(2026, 12345)).toBe('CP-2026-12345');
  });

  it('lê de volta o que formatou', () => {
    expect(parseOrderCode('CP-2026-0042')).toEqual({ year: 2026, sequence: 42 });
  });

  it('aceita minúsculas e espaços — a cliente digita como dá', () => {
    expect(parseOrderCode('  cp-2026-0042 ')).toEqual({ year: 2026, sequence: 42 });
  });

  it('recusa o que não é código', () => {
    expect(parseOrderCode('CP-26-1')).toBeNull();
    expect(parseOrderCode('qualquer coisa')).toBeNull();
  });
});

describe('needsRecovery', () => {
  const agora = new Date('2026-09-10T12:00:00Z');

  it('pedido novo parado há mais de um dia precisa de alguém', () => {
    expect(needsRecovery({ status: 'novo', createdAt: '2026-09-09T11:00:00Z' }, agora)).toBe(true);
  });

  it('pedido novo recente ainda não', () => {
    expect(needsRecovery({ status: 'novo', createdAt: '2026-09-10T10:00:00Z' }, agora)).toBe(false);
  });

  it('pedido já em atendimento não está abandonado', () => {
    expect(
      needsRecovery({ status: 'em_atendimento', createdAt: '2026-09-01T10:00:00Z' }, agora),
    ).toBe(false);
  });

  it('pedido encerrado nunca entra na fila', () => {
    expect(needsRecovery({ status: 'entregue', createdAt: '2026-01-01T10:00:00Z' }, agora)).toBe(
      false,
    );
    expect(needsRecovery({ status: 'perdido', createdAt: '2026-01-01T10:00:00Z' }, agora)).toBe(
      false,
    );
  });
});
