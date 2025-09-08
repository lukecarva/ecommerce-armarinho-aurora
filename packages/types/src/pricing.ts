import type { Cents } from './money.js';

/**
 * Resolução do preço efetivo de um produto.
 *
 * Três coisas podem mudar o preço, nesta ordem de aplicação:
 *
 * 1. **Promoção agendada** — `promoPrice` dentro da janela de datas.
 * 2. **Faixa por quantidade** — "acima de 10 metros, R$ 13,90". Vale para
 *    qualquer cliente e faz parte da v1.
 * 3. **Tabela por grupo (atacado)** — só entra quando o atacado está ligado.
 *    Na v1 a vitrine sempre resolve como varejo; a estrutura existe para a v2
 *    não exigir refatoração.
 *
 * Vence sempre o menor preço aplicável, e `compareAt` guarda o valor cheio
 * para a vitrine mostrar riscado.
 */

export interface PriceTierInput {
  /** `null` = faixa por quantidade, válida para todo mundo. */
  groupId: string | null;
  minQty: number;
  price: Cents;
}

export interface PriceInput {
  price: Cents;
  promoPrice?: Cents | null;
  promoStartsAt?: Date | string | null;
  promoEndsAt?: Date | string | null;
  tiers?: PriceTierInput[];
}

export interface ResolvePriceOptions {
  /** Quantidade no carrinho — decide qual faixa se aplica. */
  quantity?: number;
  /** Grupo do cliente. Ignorado quando `wholesaleEnabled` é falso. */
  groupId?: string | null;
  /** Feature flag do atacado. Padrão: desligado, como na v1. */
  wholesaleEnabled?: boolean;
  /** Momento da avaliação. Injetável para testes. */
  at?: Date;
}

export type PriceSource = 'tabela' | 'promocao' | 'faixa' | 'grupo';

export interface ResolvedPrice {
  /** O que o cliente paga por unidade de venda. */
  unitPrice: Cents;
  /** Preço cheio a exibir riscado, ou `null` quando não há desconto. */
  compareAt: Cents | null;
  source: PriceSource;
}

/** A promoção está valendo neste instante? */
export function isPromoActive(input: PriceInput, at: Date = new Date()): boolean {
  if (input.promoPrice === null || input.promoPrice === undefined) return false;
  if (input.promoPrice >= input.price) return false;

  const starts = toDate(input.promoStartsAt);
  const ends = toDate(input.promoEndsAt);

  if (starts && at < starts) return false;
  if (ends && at > ends) return false;

  return true;
}

export function resolvePrice(input: PriceInput, options: ResolvePriceOptions = {}): ResolvedPrice {
  const { quantity = 1, groupId = null, wholesaleEnabled = false, at = new Date() } = options;

  let unitPrice = input.price;
  let source: PriceSource = 'tabela';

  if (isPromoActive(input, at)) {
    unitPrice = input.promoPrice as Cents;
    source = 'promocao';
  }

  const tier = bestTier(input.tiers ?? [], quantity, groupId, wholesaleEnabled);

  if (tier && tier.price < unitPrice) {
    unitPrice = tier.price;
    source = tier.groupId === null ? 'faixa' : 'grupo';
  }

  return {
    unitPrice,
    compareAt: unitPrice < input.price ? input.price : null,
    source,
  };
}

/**
 * Melhor faixa aplicável.
 *
 * Entre faixas válidas, a de maior `minQty` é a mais específica (comprou mais,
 * paga menos). Faixa de grupo tem prioridade sobre faixa geral de mesma
 * quantidade, porque representa um acordo comercial explícito.
 */
function bestTier(
  tiers: PriceTierInput[],
  quantity: number,
  groupId: string | null,
  wholesaleEnabled: boolean,
): PriceTierInput | null {
  const applicable = tiers.filter((tier) => {
    if (tier.minQty > quantity) return false;
    if (tier.groupId === null) return true;
    return wholesaleEnabled && tier.groupId === groupId;
  });

  if (applicable.length === 0) return null;

  return applicable.reduce((best, tier) => {
    if (tier.minQty !== best.minQty) return tier.minQty > best.minQty ? tier : best;
    // Mesma quantidade: a faixa do grupo vence a faixa geral.
    if (tier.groupId !== null && best.groupId === null) return tier;
    if (tier.groupId === null && best.groupId !== null) return best;
    return tier.price < best.price ? tier : best;
  });
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
