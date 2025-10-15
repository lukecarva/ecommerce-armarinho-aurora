import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CollectionInput } from './dto';
import { uniqueSlug } from './slug.helper';

@Injectable()
export class AdminCollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const collections = await this.prisma.collection.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });

    const now = new Date();

    return collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      type: collection.type,
      bannerUrl: collection.bannerUrl,
      startsAt: collection.startsAt,
      endsAt: collection.endsAt,
      active: collection.active,
      position: collection.position,
      productCount: collection._count.products,
      /** A coleção está realmente na vitrine agora? */
      live: isLive(collection, now),
    }));
  }

  async findOne(id: string) {
    const collection = await this.prisma.collection.findUnique({
      where: { id },
      include: {
        products: {
          orderBy: { position: 'asc' },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                images: {
                  take: 1,
                  orderBy: { position: 'asc' },
                  include: { media: { select: { url: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!collection) throw new NotFoundException('Coleção não encontrada.');

    return {
      ...collection,
      products: collection.products.map((item) => ({
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        imageUrl: item.product.images[0]?.media.url ?? null,
        position: item.position,
      })),
      productIds: collection.products.map((item) => item.productId),
    };
  }

  async create(input: CollectionInput) {
    const slug = await uniqueSlug(this.prisma.collection, input.slug ?? input.name);

    const collection = await this.prisma.collection.create({
      data: {
        name: input.name,
        slug,
        type: input.type,
        description: input.description ?? null,
        bannerUrl: input.bannerUrl ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        active: input.active,
        position: input.position,
        seo: input.seo ?? undefined,
      },
    });

    await this.setProducts(collection.id, input.productIds);
    return this.findOne(collection.id);
  }

  async update(id: string, input: CollectionInput) {
    const current = await this.prisma.collection.findUnique({
      where: { id },
      select: { slug: true },
    });
    if (!current) throw new NotFoundException('Coleção não encontrada.');

    const slug =
      input.slug && input.slug !== current.slug
        ? await uniqueSlug(this.prisma.collection, input.slug, id)
        : current.slug;

    await this.prisma.collection.update({
      where: { id },
      data: {
        name: input.name,
        slug,
        type: input.type,
        description: input.description ?? null,
        bannerUrl: input.bannerUrl ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        active: input.active,
        position: input.position,
        seo: input.seo ?? undefined,
      },
    });

    await this.setProducts(id, input.productIds);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    // Coleção é agrupamento editorial: apagar não afeta produto nenhum,
    // então aqui a exclusão é direta mesmo.
    await this.prisma.collection.delete({ where: { id } });
  }

  private async setProducts(collectionId: string, productIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.collectionProduct.deleteMany({ where: { collectionId } }),
      ...(productIds.length > 0
        ? [
            this.prisma.collectionProduct.createMany({
              data: productIds.map((productId, index) => ({
                collectionId,
                productId,
                position: index,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }
}

/**
 * Coleção sazonal entra e sai sozinha nas datas marcadas — é o que permite
 * programar a campanha de Natal em outubro e esquecer dela.
 */
export function isLive(
  collection: { active: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date,
): boolean {
  if (!collection.active) return false;
  if (collection.startsAt && now < collection.startsAt) return false;
  if (collection.endsAt && now > collection.endsAt) return false;
  return true;
}
