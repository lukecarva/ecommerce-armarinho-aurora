import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ImageService } from './image.service';
import { StorageService } from './storage.service';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageService,
    private readonly storage: StorageService,
  ) {}

  async upload(file: UploadedFile, folder: string, uploadedById: string | null) {
    const processed = await this.images.process(file, folder);

    return this.prisma.mediaAsset.create({
      data: {
        key: processed.key,
        url: processed.url,
        mime: processed.mime,
        size: processed.size,
        width: processed.width,
        height: processed.height,
        blurhash: processed.blurhash,
        folder,
        variants: processed.variants as unknown as Prisma.InputJsonValue,
        uploadedById,
      },
    });
  }

  async list(params: { folder?: string; search?: string; page: number; perPage: number }) {
    const where: Prisma.MediaAssetWhereInput = {
      ...(params.folder ? { folder: params.folder } : {}),
      ...(params.search
        ? {
            OR: [
              { alt: { contains: params.search, mode: 'insensitive' } },
              { key: { contains: params.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.perPage,
        take: params.perPage,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    return {
      items,
      page: params.page,
      perPage: params.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.perPage)),
    };
  }

  async updateAlt(id: string, alt: string | null) {
    return this.prisma.mediaAsset.update({ where: { id }, data: { alt } });
  }

  /**
   * Remove a imagem do banco e do armazenamento, inclusive as derivações.
   *
   * Os vínculos com produtos caem em cascata, então a exclusão é bloqueada
   * quando a imagem ainda está em uso — apagar por engano uma foto usada em
   * dez produtos seria caro de refazer.
   */
  async remove(id: string): Promise<void> {
    const media = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: { _count: { select: { images: true } } },
    });

    if (!media) throw new NotFoundException('Imagem não encontrada.');

    if (media._count.images > 0) {
      throw new NotFoundException(
        `Esta imagem está em ${media._count.images} produto(s). Remova o vínculo antes de excluir.`,
      );
    }

    await this.prisma.mediaAsset.delete({ where: { id } });

    const variants = Array.isArray(media.variants)
      ? (media.variants as Array<{ key?: string }>)
      : [];

    await Promise.all([
      this.storage.remove(media.key),
      ...variants
        .filter((variant) => variant.key)
        .map((variant) => this.storage.remove(variant.key!)),
    ]);
  }
}
