import { resolvePrice } from '@aurora/types';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  fromCents,
  fromCentsOrNull,
  fromQuantity,
  toCents,
  toCentsOrNull,
  toQuantity,
} from '../../common/decimal';
import { loadEnv } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import type { BulkUpdateInput, ProductInput, ProductListQuery } from './dto';
import { uniqueSlug } from './slug.helper';

const LIST_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  images: {
    orderBy: { position: 'asc' as const },
    take: 1,
    include: { media: { select: { url: true, blurhash: true, variants: true } } },
  },
  inventory: { where: { variantId: null }, take: 1 },
  _count: { select: { variants: true, images: true } },
} satisfies Prisma.ProductInclude;

const DETAIL_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true } },
  images: {
    orderBy: { position: 'asc' as const },
    include: { media: true },
  },
  variants: { orderBy: { position: 'asc' as const } },
  priceTiers: { orderBy: { minQty: 'asc' as const } },
  inventory: true,
  collections: { select: { collectionId: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class AdminProductsService {
  private readonly env = loadEnv();

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductListQuery) {
    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { status: query.status } : { status: { not: 'arquivado' } }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.needsContent !== undefined ? { needsContent: query.needsContent } : {}),
      ...(query.collectionId
        ? { collections: { some: { collectionId: query.collectionId } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { skuFutura: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      recentes: { updatedAt: 'desc' as const },
      nome: { name: 'asc' as const },
      preco: { price: 'asc' as const },
      estoque: { updatedAt: 'desc' as const },
    }[query.orderBy];

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        include: LIST_INCLUDE,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toListItem(row)),
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });

    if (!product) throw new NotFoundException('Produto não encontrado.');

    return this.toDetail(product);
  }

  async create(input: ProductInput) {
    const slug = await uniqueSlug(this.prisma.product, input.slug ?? input.name);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...this.scalarData(input),
          slug,
          // Sem foto e sem categoria o produto não está pronto para a vitrine.
          needsContent: input.images.length === 0 || !input.categoryId,
        },
      });

      await this.syncRelations(tx, created.id, input);
      return created;
    });

    return this.findOne(product.id);
  }

  async update(id: string, input: ProductInput) {
    const current = await this.prisma.product.findUnique({
      where: { id },
      select: { slug: true },
    });
    if (!current) throw new NotFoundException('Produto não encontrado.');

    const slug =
      input.slug && input.slug !== current.slug
        ? await uniqueSlug(this.prisma.product, input.slug, id)
        : current.slug;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...this.scalarData(input),
          slug,
          needsContent: input.images.length === 0 || !input.categoryId,
        },
      });

      await this.syncRelations(tx, id, input);
    });

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produto não encontrado.');

    // Arquivar em vez de apagar: o histórico de pedidos vai apontar para este
    // produto a partir da Sprint 5, e um catálogo sem rastro complica auditoria.
    await this.prisma.product.update({
      where: { id },
      data: { status: 'arquivado' },
    });
  }

  /** Edição em lote a partir da listagem — o atalho que salva tempo na carga. */
  async bulkUpdate(input: BulkUpdateInput) {
    const { ids } = input;

    await this.prisma.$transaction(async (tx) => {
      if (input.status !== undefined || input.categoryId !== undefined) {
        await tx.product.updateMany({
          where: { id: { in: ids } },
          data: {
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          },
        });
      }

      if (input.priceAdjustPercent !== undefined) {
        const factor = 1 + input.priceAdjustPercent / 100;
        const products = await tx.product.findMany({
          where: { id: { in: ids } },
          select: { id: true, price: true },
        });

        for (const product of products) {
          const adjusted = Math.max(0, Math.round(toCents(product.price) * factor));
          await tx.product.update({
            where: { id: product.id },
            data: { price: fromCents(adjusted) },
          });
        }
      }

      if (input.addToCollectionId) {
        await tx.collectionProduct.createMany({
          data: ids.map((productId) => ({
            collectionId: input.addToCollectionId!,
            productId,
          })),
          skipDuplicates: true,
        });
      }

      if (input.removeFromCollectionId) {
        await tx.collectionProduct.deleteMany({
          where: { collectionId: input.removeFromCollectionId, productId: { in: ids } },
        });
      }
    });

    return { updated: ids.length };
  }

  private scalarData(input: ProductInput): Prisma.ProductUncheckedCreateInput {
    return {
      name: input.name,
      slug: '', // preenchido por quem chama
      skuFutura: input.skuFutura?.trim() || null,
      shortDesc: input.shortDesc ?? null,
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      brandId: input.brandId ?? null,
      unit: input.unit,
      saleStep: fromQuantity(input.saleStep),
      minQty: fromQuantity(input.minQty),
      packSize: input.packSize ?? null,
      price: fromCents(input.price),
      promoPrice: fromCentsOrNull(input.promoPrice),
      promoStartsAt: input.promoStartsAt ?? null,
      promoEndsAt: input.promoEndsAt ?? null,
      attributes: input.attributes,
      status: input.status,
      seo: input.seo ?? undefined,
    };
  }

  /**
   * Reescreve imagens, variações, faixas de preço, coleções e estoque.
   *
   * A tela sempre envia o estado completo dessas listas, então substituir é
   * mais simples e menos sujeito a divergência do que aplicar diffs — e cabe
   * numa transação só.
   */
  private async syncRelations(
    tx: Prisma.TransactionClient,
    productId: string,
    input: ProductInput,
  ): Promise<void> {
    await tx.productImage.deleteMany({ where: { productId } });
    if (input.images.length > 0) {
      await tx.productImage.createMany({
        data: input.images.map((image, index) => ({
          productId,
          mediaId: image.mediaId,
          variantId: image.variantId ?? null,
          alt: image.alt ?? null,
          position: index,
        })),
        skipDuplicates: true,
      });
    }

    // Variações são preservadas por id quando já existem, para não perder o
    // estoque vinculado a elas.
    const keptVariantIds = input.variants.filter((v) => v.id).map((v) => v.id!);
    await tx.productVariant.deleteMany({
      where: { productId, ...(keptVariantIds.length ? { id: { notIn: keptVariantIds } } : {}) },
    });

    for (const [index, variant] of input.variants.entries()) {
      const data = {
        name: variant.name,
        skuFutura: variant.skuFutura?.trim() || null,
        color: variant.color ?? null,
        colorHex: variant.colorHex ?? null,
        size: variant.size ?? null,
        priceDelta: fromCents(variant.priceDelta),
        position: index,
      };

      if (variant.id) {
        await tx.productVariant.update({ where: { id: variant.id }, data });
      } else {
        await tx.productVariant.create({ data: { ...data, productId } });
      }
    }

    await tx.priceTier.deleteMany({ where: { productId } });
    if (input.priceTiers.length > 0) {
      await tx.priceTier.createMany({
        data: input.priceTiers.map((tier) => ({
          productId,
          groupId: tier.groupId,
          minQty: fromQuantity(tier.minQty),
          price: fromCents(tier.price),
        })),
        skipDuplicates: true,
      });
    }

    await tx.collectionProduct.deleteMany({ where: { productId } });
    if (input.collectionIds.length > 0) {
      await tx.collectionProduct.createMany({
        data: input.collectionIds.map((collectionId, index) => ({
          collectionId,
          productId,
          position: index,
        })),
        skipDuplicates: true,
      });
    }

    if (input.stock) {
      const existing = await tx.inventory.findFirst({ where: { productId, variantId: null } });
      const availability =
        input.stock.availability ?? availabilityFor(input.stock.qty, input.stock.lowStockThreshold);

      const data = {
        qty: fromQuantity(input.stock.qty),
        lowStockThreshold: fromQuantity(input.stock.lowStockThreshold),
        availability,
      };

      if (existing) {
        await tx.inventory.update({ where: { id: existing.id }, data });
      } else {
        await tx.inventory.create({ data: { ...data, productId, source: 'manual' } });
      }
    }
  }

  private toListItem(row: Prisma.ProductGetPayload<{ include: typeof LIST_INCLUDE }>) {
    const price = this.effectivePrice(row);
    const image = row.images[0]?.media;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      skuFutura: row.skuFutura,
      status: row.status,
      needsContent: row.needsContent,
      unit: row.unit,
      price: toCents(row.price),
      promoPrice: toCentsOrNull(row.promoPrice),
      effectivePrice: price.unitPrice,
      compareAt: price.compareAt,
      category: row.category,
      imageUrl: image?.url ?? null,
      blurhash: image?.blurhash ?? null,
      availability: row.inventory[0]?.availability ?? 'sob_consulta',
      stockQty: toQuantity(row.inventory[0]?.qty),
      variantCount: row._count.variants,
      imageCount: row._count.images,
      updatedAt: row.updatedAt,
    };
  }

  private toDetail(row: Prisma.ProductGetPayload<{ include: typeof DETAIL_INCLUDE }>) {
    const stock = row.inventory.find((item) => item.variantId === null);

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      skuFutura: row.skuFutura,
      shortDesc: row.shortDesc,
      description: row.description,
      categoryId: row.categoryId,
      category: row.category,
      brandId: row.brandId,
      brand: row.brand,
      unit: row.unit,
      saleStep: toQuantity(row.saleStep),
      minQty: toQuantity(row.minQty),
      packSize: row.packSize,
      price: toCents(row.price),
      promoPrice: toCentsOrNull(row.promoPrice),
      promoStartsAt: row.promoStartsAt,
      promoEndsAt: row.promoEndsAt,
      attributes: row.attributes,
      status: row.status,
      needsContent: row.needsContent,
      seo: row.seo,
      images: row.images.map((image) => ({
        mediaId: image.mediaId,
        variantId: image.variantId,
        alt: image.alt,
        url: image.media.url,
        blurhash: image.media.blurhash,
        width: image.media.width,
        height: image.media.height,
      })),
      variants: row.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        skuFutura: variant.skuFutura,
        color: variant.color,
        colorHex: variant.colorHex,
        size: variant.size,
        priceDelta: toCents(variant.priceDelta),
      })),
      priceTiers: row.priceTiers.map((tier) => ({
        groupId: tier.groupId,
        minQty: toQuantity(tier.minQty),
        price: toCents(tier.price),
      })),
      collectionIds: row.collections.map((item) => item.collectionId),
      stock: {
        qty: toQuantity(stock?.qty),
        lowStockThreshold: toQuantity(stock?.lowStockThreshold ?? 3),
        availability: stock?.availability ?? 'sob_consulta',
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Mesma resolução usada na vitrine, para o painel mostrar o preço real. */
  private effectivePrice(row: {
    price: Prisma.Decimal;
    promoPrice: Prisma.Decimal | null;
    promoStartsAt: Date | null;
    promoEndsAt: Date | null;
  }) {
    return resolvePrice(
      {
        price: toCents(row.price),
        promoPrice: toCentsOrNull(row.promoPrice),
        promoStartsAt: row.promoStartsAt,
        promoEndsAt: row.promoEndsAt,
      },
      { wholesaleEnabled: this.env.WHOLESALE_ENABLED },
    );
  }
}

/** Traduz quantidade em estado exibível. Nunca mostramos o número na vitrine. */
export function availabilityFor(
  qty: number,
  threshold: number,
): 'em_estoque' | 'ultimas_unidades' | 'sob_consulta' {
  if (qty <= 0) return 'sob_consulta';
  if (qty <= threshold) return 'ultimas_unidades';
  return 'em_estoque';
}
