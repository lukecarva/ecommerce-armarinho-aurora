import { describe, expect, it } from 'vitest';
import { isPromoActive, resolvePrice } from './pricing.js';

const HOJE = new Date('2026-09-08T15:00:00Z');

describe('isPromoActive', () => {
  it('vale quando não há janela de datas', () => {
    expect(isPromoActive({ price: 2190, promoPrice: 1690 }, HOJE)).toBe(true);
  });

  it('não vale antes de começar nem depois de terminar', () => {
    const promo = {
      price: 2190,
      promoPrice: 1690,
      promoStartsAt: '2026-09-10T00:00:00Z',
      promoEndsAt: '2026-09-20T00:00:00Z',
    };

    expect(isPromoActive(promo, HOJE)).toBe(false);
    expect(isPromoActive(promo, new Date('2026-09-15T12:00:00Z'))).toBe(true);
    expect(isPromoActive(promo, new Date('2026-09-25T12:00:00Z'))).toBe(false);
  });

  it('ignora promoção que não é desconto', () => {
    expect(isPromoActive({ price: 1590, promoPrice: 1590 }, HOJE)).toBe(false);
    expect(isPromoActive({ price: 1590, promoPrice: 1990 }, HOJE)).toBe(false);
    expect(isPromoActive({ price: 1590, promoPrice: null }, HOJE)).toBe(false);
  });
});

describe('resolvePrice', () => {
  it('devolve o preço de tabela quando não há nada aplicável', () => {
    expect(resolvePrice({ price: 1590 }, { at: HOJE })).toEqual({
      unitPrice: 1590,
      compareAt: null,
      source: 'tabela',
    });
  });

  it('aplica a promoção agendada e guarda o preço cheio para riscar', () => {
    expect(resolvePrice({ price: 2190, promoPrice: 1690 }, { at: HOJE })).toEqual({
      unitPrice: 1690,
      compareAt: 2190,
      source: 'promocao',
    });
  });

  it('aplica faixa por quantidade a partir do mínimo', () => {
    const tecido = {
      price: 1590,
      tiers: [{ groupId: null, minQty: 10, price: 1390 }],
    };

    expect(resolvePrice(tecido, { quantity: 5, at: HOJE }).unitPrice).toBe(1590);

    const dezMetros = resolvePrice(tecido, { quantity: 10, at: HOJE });
    expect(dezMetros).toEqual({ unitPrice: 1390, compareAt: 1590, source: 'faixa' });
  });

  it('escolhe a faixa mais alta que a quantidade alcança', () => {
    const escalonado = {
      price: 1590,
      tiers: [
        { groupId: null, minQty: 10, price: 1390 },
        { groupId: null, minQty: 50, price: 1190 },
      ],
    };

    expect(resolvePrice(escalonado, { quantity: 20, at: HOJE }).unitPrice).toBe(1390);
    expect(resolvePrice(escalonado, { quantity: 50, at: HOJE }).unitPrice).toBe(1190);
  });

  it('ignora tabela de atacado enquanto a flag está desligada — comportamento da v1', () => {
    const comAtacado = {
      price: 1590,
      tiers: [{ groupId: 'atacado', minQty: 1, price: 990 }],
    };

    expect(resolvePrice(comAtacado, { quantity: 1, groupId: 'atacado', at: HOJE })).toEqual({
      unitPrice: 1590,
      compareAt: null,
      source: 'tabela',
    });
  });

  it('aplica a tabela de atacado quando a flag é ligada na v2', () => {
    const comAtacado = {
      price: 1590,
      tiers: [{ groupId: 'atacado', minQty: 1, price: 990 }],
    };

    const resolvido = resolvePrice(comAtacado, {
      quantity: 1,
      groupId: 'atacado',
      wholesaleEnabled: true,
      at: HOJE,
    });

    expect(resolvido).toEqual({ unitPrice: 990, compareAt: 1590, source: 'grupo' });
  });

  it('não vaza preço de atacado para cliente de outro grupo', () => {
    const comAtacado = {
      price: 1590,
      tiers: [{ groupId: 'atacado', minQty: 1, price: 990 }],
    };

    const varejo = resolvePrice(comAtacado, {
      quantity: 1,
      groupId: 'varejo',
      wholesaleEnabled: true,
      at: HOJE,
    });

    expect(varejo.unitPrice).toBe(1590);
  });

  it('mantém o menor preço quando promoção e faixa competem', () => {
    const produto = {
      price: 2190,
      promoPrice: 1690,
      tiers: [{ groupId: null, minQty: 10, price: 1890 }],
    };

    // A promoção é melhor que a faixa: o cliente fica com a promoção.
    const resolvido = resolvePrice(produto, { quantity: 20, at: HOJE });
    expect(resolvido.unitPrice).toBe(1690);
    expect(resolvido.source).toBe('promocao');
  });

  it('a faixa do grupo vence a faixa geral de mesma quantidade', () => {
    const produto = {
      price: 1590,
      tiers: [
        { groupId: null, minQty: 10, price: 1390 },
        { groupId: 'atacado', minQty: 10, price: 1290 },
      ],
    };

    const atacado = resolvePrice(produto, {
      quantity: 10,
      groupId: 'atacado',
      wholesaleEnabled: true,
      at: HOJE,
    });

    expect(atacado).toEqual({ unitPrice: 1290, compareAt: 1590, source: 'grupo' });
  });
});
