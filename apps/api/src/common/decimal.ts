import { Prisma } from '@prisma/client';

/**
 * Fronteira entre o banco e o resto do sistema.
 *
 * O Postgres guarda dinheiro como `Decimal(10,2)` e quantidade como
 * `Decimal(10,3)`. Do lado do código, dinheiro é sempre centavo inteiro e
 * quantidade é número comum. Toda a conversão acontece aqui — em nenhum outro
 * lugar um `Prisma.Decimal` deve escapar para a camada de negócio.
 */

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

/** Decimal do banco → centavos inteiros. `19.90` → `1990` */
export function toCents(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) * 100);
}

/** Igual a `toCents`, mas preserva a ausência de valor. */
export function toCentsOrNull(value: DecimalLike): number | null {
  if (value === null || value === undefined) return null;
  return toCents(value);
}

/** Centavos inteiros → Decimal para gravar. `1990` → `19.90` */
export function fromCents(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents).dividedBy(100);
}

export function fromCentsOrNull(cents: number | null | undefined): Prisma.Decimal | null {
  if (cents === null || cents === undefined) return null;
  return fromCents(cents);
}

/** Decimal de quantidade → número. `2.500` → `2.5` */
export function toQuantity(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** Número → Decimal de quantidade, com 3 casas. */
export function fromQuantity(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(3));
}
