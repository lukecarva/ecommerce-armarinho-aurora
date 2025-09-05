import { SALE_UNIT_LABELS, type SaleUnit } from './enums.js';

export interface QuantityRules {
  /** Menor incremento vendável. Ex.: 0,5 para tecido de meio em meio metro. */
  step: number;
  /** Quantidade mínima do pedido. Ex.: 1 metro. */
  min: number;
  /** Teto opcional, quando a loja limita a venda pelo site. */
  max?: number;
}

export function defaultRulesFor(unit: SaleUnit): QuantityRules {
  const step = SALE_UNIT_LABELS[unit].defaultStep;
  return { step, min: step };
}

/**
 * Ajusta a quantidade digitada para um valor realmente vendável:
 * múltiplo do passo, respeitando mínimo e máximo.
 *
 * Ex.: 2,3 metros com passo 0,5 → 2,5 metros.
 */
export function normalizeQuantity(quantity: number, rules: QuantityRules): number {
  const { step, min, max } = rules;
  if (!Number.isFinite(quantity) || quantity <= 0) return min;

  const steps = Math.round(quantity / step);
  let normalized = round3(steps * step);

  if (normalized < min) normalized = min;
  if (max !== undefined && normalized > max) normalized = max;

  return normalized;
}

/** Próximo valor ao clicar em "+" no seletor de quantidade. */
export function incrementQuantity(quantity: number, rules: QuantityRules): number {
  return normalizeQuantity(round3(quantity + rules.step), rules);
}

/** Valor anterior ao clicar em "−". Nunca desce abaixo do mínimo. */
export function decrementQuantity(quantity: number, rules: QuantityRules): number {
  return normalizeQuantity(round3(quantity - rules.step), rules);
}

/**
 * Formata quantidade + unidade como o cliente lê.
 *
 * (2.5, 'metro')   → "2,5 metros"
 * (1, 'metro')     → "1 metro"
 * (1, 'unidade')   → "1 un"
 * (3, 'pacote')    → "3 pacotes"
 */
export function formatQuantity(quantity: number, unit: SaleUnit): string {
  const labels = SALE_UNIT_LABELS[unit];
  const number = formatNumber(quantity);

  if (unit === 'unidade') return `${number} un`;
  if (unit === 'kg') return `${number} kg`;

  const noun = quantity === 1 ? labels.singular : labels.plural;
  return `${number} ${noun}`;
}

/** "R$ 15,90/metro" — o preço como aparece no card e na página do produto. */
export function formatUnitPriceSuffix(unit: SaleUnit): string {
  return SALE_UNIT_LABELS[unit].priceSuffix;
}

/**
 * Texto auxiliar de embalagem, quando o produto é vendido em pacote.
 * (10) → "Pacote com 10 un"
 */
export function formatPackSize(packSize: number | null | undefined): string | null {
  if (!packSize || packSize <= 1) return null;
  return `Pacote com ${packSize} un`;
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
