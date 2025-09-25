import { describe, expect, it } from 'vitest';
import { diffOf } from './audit.service';

describe('diffOf', () => {
  it('registra apenas os campos que mudaram', () => {
    const diff = diffOf(
      { name: 'Tricoline', price: 1590, status: 'ativo' },
      { name: 'Tricoline', price: 1390, status: 'ativo' },
    );

    expect(diff).toEqual({ price: { de: 1590, para: 1390 } });
  });

  it('devolve null quando nada mudou', () => {
    expect(diffOf({ price: 1590 }, { price: 1590 })).toBeNull();
  });

  it('marca criação e remoção', () => {
    expect(diffOf(null, { name: 'Nova categoria' })).toEqual({
      criado: { name: 'Nova categoria' },
    });
    expect(diffOf({ name: 'Antiga' }, null)).toEqual({ removido: { name: 'Antiga' } });
  });

  it('nunca grava senha ou segredo no log', () => {
    const diff = diffOf(
      { email: 'a@b.com', passwordHash: 'hash-antigo', totpSecret: 'ABC' },
      { email: 'a@b.com', passwordHash: 'hash-novo', totpSecret: 'XYZ' },
    );

    expect(diff).toBeNull();
  });

  it('não vaza senha nem na criação', () => {
    const diff = diffOf(null, { email: 'a@b.com', passwordHash: 'hash' }) as Record<
      string,
      Record<string, unknown>
    >;

    expect(diff.criado).toEqual({ email: 'a@b.com' });
  });

  it('serializa data e decimal para comparação estável', () => {
    const data = new Date('2026-09-08T12:00:00Z');

    expect(diffOf({ promoEndsAt: data }, { promoEndsAt: new Date(data) })).toBeNull();
    expect(diffOf({ promoEndsAt: null }, { promoEndsAt: data })).toEqual({
      promoEndsAt: { de: null, para: '2026-09-08T12:00:00.000Z' },
    });
  });

  it('detecta campo novo e campo removido', () => {
    expect(diffOf({ a: 1 }, { a: 1, b: 2 })).toEqual({ b: { de: null, para: 2 } });
    expect(diffOf({ a: 1, b: 2 }, { a: 1 })).toEqual({ b: { de: 2, para: null } });
  });
});
