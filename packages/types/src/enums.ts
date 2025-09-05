/**
 * Unidades de venda da loja.
 *
 * Este é o conceito central do catálogo: tecido sai por metro (com fração),
 * fio por unidade, aviamento por pacote e retalho por quilo. Preço, carrinho
 * e mensagem do WhatsApp dependem disso estar certo.
 */
export const SALE_UNITS = ['metro', 'unidade', 'pacote', 'kg', 'conjunto'] as const;
export type SaleUnit = (typeof SALE_UNITS)[number];

export interface SaleUnitLabel {
  /** "metro" */
  singular: string;
  /** "metros" */
  plural: string;
  /** "m" — usado em espaços apertados, como o card de produto */
  abbr: string;
  /** "/metro" — sufixo do preço na vitrine */
  priceSuffix: string;
  /** Menor fração vendável padrão da unidade */
  defaultStep: number;
}

export const SALE_UNIT_LABELS: Record<SaleUnit, SaleUnitLabel> = {
  metro: {
    singular: 'metro',
    plural: 'metros',
    abbr: 'm',
    priceSuffix: '/metro',
    defaultStep: 0.5,
  },
  unidade: {
    singular: 'unidade',
    plural: 'unidades',
    abbr: 'un',
    priceSuffix: '/un',
    defaultStep: 1,
  },
  pacote: {
    singular: 'pacote',
    plural: 'pacotes',
    abbr: 'pct',
    priceSuffix: '/pacote',
    defaultStep: 1,
  },
  kg: { singular: 'kg', plural: 'kg', abbr: 'kg', priceSuffix: '/kg', defaultStep: 0.1 },
  conjunto: {
    singular: 'conjunto',
    plural: 'conjuntos',
    abbr: 'cj',
    priceSuffix: '/conjunto',
    defaultStep: 1,
  },
};

/**
 * Disponibilidade exibida na vitrine.
 *
 * Nunca mostramos a quantidade exata: como não há pagamento no site, não existe
 * risco de oversell, e esconder o número torna a defasagem do estoque irrelevante.
 * "sob_consulta" substitui "esgotado" quando a loja pode ter no depósito.
 */
export const AVAILABILITIES = [
  'em_estoque',
  'ultimas_unidades',
  'sob_consulta',
  'esgotado',
] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  em_estoque: 'Em estoque',
  ultimas_unidades: 'Últimas unidades',
  sob_consulta: 'Sob consulta',
  esgotado: 'Esgotado',
};

export const PRODUCT_STATUSES = ['rascunho', 'ativo', 'inativo', 'arquivado'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Ciclo de vida do pedido, do site até o fechamento no WhatsApp. */
export const ORDER_STATUSES = [
  'novo',
  'em_atendimento',
  'aguardando_pagamento',
  'pago',
  'separado',
  'entregue',
  'retirado',
  'cancelado',
  'perdido',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  separado: 'Separado',
  entregue: 'Entregue',
  retirado: 'Retirado',
  cancelado: 'Cancelado',
  perdido: 'Perdido',
};

/** Status que encerram o pedido — usados nos relatórios de conversão. */
export const CLOSED_ORDER_STATUSES: OrderStatus[] = [
  'entregue',
  'retirado',
  'cancelado',
  'perdido',
];

/**
 * Tipos de entrega. Não há cálculo de frete: motoboy é sempre "consultar valor".
 * O tipo existe para o admin poder cadastrar novas opções sem mexer em código.
 */
export const DELIVERY_TYPES = ['retirada', 'motoboy', 'combinar'] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export const IMPORT_KINDS = ['produtos', 'precos', 'estoque'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const EXPORT_FORMATS = ['csv', 'xlsx', 'zip'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
