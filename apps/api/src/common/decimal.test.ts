import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { fromCents, fromQuantity, toCents, toCentsOrNull, toQuantity } from './decimal';

describe('toCents', () => {
  it('converte Decimal do banco em centavos', () => {
    expect(toCents(new Prisma.Decimal('19.90'))).toBe(1990);
    expect(toCents(new Prisma.Decimal('15.9'))).toBe(1590);
    expect(toCents(new Prisma.Decimal('0.5'))).toBe(50);
  });

  it('aceita número e string', () => {
    expect(toCents(11.99)).toBe(1199);
    expect(toCents('35.90')).toBe(3590);
  });

  it('trata ausência como zero', () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
  });

  it('arredonda o terceiro decimal, que não existe em dinheiro', () => {
    expect(toCents('19.905')).toBe(1991);
    expect(toCents('19.904')).toBe(1990);
  });
});

describe('toCentsOrNull', () => {
  it('preserva a diferença entre "sem promoção" e "promoção de R$ 0,00"', () => {
    expect(toCentsOrNull(null)).toBeNull();
    expect(toCentsOrNull(new Prisma.Decimal('0'))).toBe(0);
  });
});

describe('fromCents', () => {
  it('volta para Decimal com duas casas', () => {
    expect(fromCents(1990).toFixed(2)).toBe('19.90');
    expect(fromCents(1199).toFixed(2)).toBe('11.99');
    expect(fromCents(0).toFixed(2)).toBe('0.00');
  });

  it('faz a viagem de ida e volta sem perder centavo', () => {
    for (const cents of [1, 50, 1590, 1199, 123456, 999999]) {
      expect(toCents(fromCents(cents))).toBe(cents);
    }
  });
});

describe('quantidade', () => {
  it('preserva a fração de meio metro', () => {
    expect(toQuantity(new Prisma.Decimal('2.500'))).toBe(2.5);
    expect(fromQuantity(2.5).toFixed(3)).toBe('2.500');
    expect(toQuantity(fromQuantity(0.25))).toBe(0.25);
  });
});
