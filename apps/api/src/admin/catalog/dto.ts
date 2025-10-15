import { PRODUCT_STATUSES, SALE_UNITS, AVAILABILITIES } from '@aurora/types';
import { z } from 'zod';

/**
 * Contratos das rotas de catálogo do painel.
 *
 * Preço trafega em **centavos inteiros** entre painel e API — o mesmo formato
 * usado no domínio. A conversão para `Decimal` acontece só na gravação.
 */

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(slugRegex, 'Use apenas letras minúsculas, números e hífens')
  .max(96);

export const seoSchema = z
  .object({
    title: z.string().trim().max(70).optional().nullable(),
    description: z.string().trim().max(180).optional().nullable(),
  })
  .nullable()
  .optional();

// ─────────────────────────────── Categorias ────────────────────────────────

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da categoria').max(80),
  slug: slugField.optional(),
  parentId: z.string().uuid().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  active: z.boolean().default(true),
  seo: seoSchema,
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/** Reordenação da árvore: a tela envia a lista inteira já na ordem final. */
export const categoryReorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        parentId: z.string().uuid().nullable(),
        position: z.number().int().min(0),
      }),
    )
    .min(1),
});

// ─────────────────────────────── Coleções ──────────────────────────────────

export const collectionInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugField.optional(),
  type: z.enum(['sazonal', 'oferta', 'curadoria']).default('curadoria'),
  description: z.string().trim().max(500).nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  active: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
  seo: seoSchema,
  productIds: z.array(z.string().uuid()).default([]),
});
export type CollectionInput = z.infer<typeof collectionInputSchema>;

// ──────────────────────────────── Produtos ─────────────────────────────────

const priceInCents = z.number().int().min(0, 'O preço não pode ser negativo');

export const productImageSchema = z.object({
  mediaId: z.string().uuid(),
  alt: z.string().trim().max(180).nullable().optional(),
  variantId: z.string().uuid().nullable().optional(),
});

export const productVariantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Dê um nome à variação').max(80),
  skuFutura: z.string().trim().max(40).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use o formato #RRGGBB')
    .nullable()
    .optional(),
  size: z.string().trim().max(40).nullable().optional(),
  /** Diferença sobre o preço do produto, em centavos. Pode ser negativa. */
  priceDelta: z.number().int().default(0),
});

export const priceTierSchema = z.object({
  /** `null` = faixa por quantidade, válida para todos os clientes. */
  groupId: z.string().uuid().nullable(),
  minQty: z.number().positive('A quantidade mínima precisa ser maior que zero'),
  price: priceInCents,
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do produto').max(160),
    slug: slugField.optional(),
    skuFutura: z.string().trim().max(40).nullable().optional(),
    shortDesc: z.string().trim().max(200).nullable().optional(),
    description: z.string().trim().max(8000).nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    brandId: z.string().uuid().nullable().optional(),

    unit: z.enum(SALE_UNITS),
    saleStep: z.number().positive('O passo de venda precisa ser maior que zero'),
    minQty: z.number().positive('A quantidade mínima precisa ser maior que zero'),
    packSize: z.number().int().positive().nullable().optional(),

    price: priceInCents,
    promoPrice: priceInCents.nullable().optional(),
    promoStartsAt: z.coerce.date().nullable().optional(),
    promoEndsAt: z.coerce.date().nullable().optional(),

    attributes: z.record(z.string(), z.string()).default({}),
    status: z.enum(PRODUCT_STATUSES).default('rascunho'),
    seo: seoSchema,

    images: z.array(productImageSchema).default([]),
    variants: z.array(productVariantSchema).default([]),
    priceTiers: z.array(priceTierSchema).default([]),
    collectionIds: z.array(z.string().uuid()).default([]),

    stock: z
      .object({
        qty: z.number().min(0).default(0),
        lowStockThreshold: z.number().min(0).default(3),
        availability: z.enum(AVAILABILITIES).optional(),
      })
      .optional(),
  })
  .refine(
    (data) =>
      data.promoPrice === null || data.promoPrice === undefined || data.promoPrice < data.price,
    {
      message: 'O preço promocional precisa ser menor que o preço de tabela',
      path: ['promoPrice'],
    },
  )
  .refine(
    (data) => !data.promoStartsAt || !data.promoEndsAt || data.promoStartsAt <= data.promoEndsAt,
    { message: 'A promoção termina antes de começar', path: ['promoEndsAt'] },
  )
  .refine((data) => data.minQty >= data.saleStep, {
    message: 'A quantidade mínima não pode ser menor que o passo de venda',
    path: ['minQty'],
  });

export type ProductInput = z.infer<typeof productInputSchema>;

export const productListSchema = z.object({
  search: z.string().trim().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  /** Filtro da fila "Produtos a completar". */
  needsContent: z.coerce.boolean().optional(),
  collectionId: z.string().uuid().optional(),
  orderBy: z.enum(['recentes', 'nome', 'preco', 'estoque']).default('recentes'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type ProductListQuery = z.infer<typeof productListSchema>;

/** Edição em lote a partir da listagem. */
export const bulkUpdateSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1, 'Selecione ao menos um produto'),
    status: z.enum(PRODUCT_STATUSES).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    /** Reajuste percentual: `10` sobe 10%, `-5` baixa 5%. */
    priceAdjustPercent: z.number().min(-90).max(500).optional(),
    addToCollectionId: z.string().uuid().optional(),
    removeFromCollectionId: z.string().uuid().optional(),
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.categoryId !== undefined ||
      data.priceAdjustPercent !== undefined ||
      data.addToCollectionId !== undefined ||
      data.removeFromCollectionId !== undefined,
    { message: 'Escolha ao menos uma alteração para aplicar' },
  );
export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;

// ───────────────────────── Grupos e tabelas de preço ───────────────────────

export const customerGroupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugField.optional(),
  discountPercent: z.number().min(0).max(90).default(0),
});
export type CustomerGroupInput = z.infer<typeof customerGroupSchema>;

// ──────────────────────────────── Estoque ──────────────────────────────────

export const paginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const ajusteDeEstoqueSchema = z.object({
  /** `definir` grava o número contado; `ajustar` soma ou subtrai. */
  modo: z.enum(['definir', 'ajustar']).default('definir'),
  quantidade: z.number(),
  /**
   * Motivo é obrigatório de propósito: sem ele o estoque vira um número que
   * ninguém sabe explicar quando a contagem não bate.
   */
  motivo: z.string().trim().min(3, 'Explique o motivo do ajuste').max(120),
  lowStockThreshold: z.number().min(0).optional(),
  availability: z.enum(AVAILABILITIES).optional(),
});
export type AjusteDeEstoqueInput = z.infer<typeof ajusteDeEstoqueSchema>;
