import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CategoryInput } from './dto';
import { uniqueSlug } from './slug.helper';

export interface AdminCategoryNode {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  position: number;
  active: boolean;
  parentId: string | null;
  productCount: number;
  children: AdminCategoryNode[];
}

@Injectable()
export class AdminCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Árvore completa, inclusive as inativas — o painel vê tudo. */
  async tree(): Promise<AdminCategoryNode[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });

    const byParent = new Map<string | null, AdminCategoryNode[]>();

    for (const category of categories) {
      const node: AdminCategoryNode = {
        id: category.id,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        position: category.position,
        active: category.active,
        parentId: category.parentId,
        productCount: category._count.products,
        children: [],
      };

      const siblings = byParent.get(category.parentId) ?? [];
      siblings.push(node);
      byParent.set(category.parentId, siblings);
    }

    const attach = (nodes: AdminCategoryNode[]): AdminCategoryNode[] =>
      nodes.map((node) => ({ ...node, children: attach(byParent.get(node.id) ?? []) }));

    return attach(byParent.get(null) ?? []);
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoria não encontrada.');
    return category;
  }

  async create(input: CategoryInput) {
    const slug = await uniqueSlug(this.prisma.category, input.slug ?? input.name);

    const lastSibling = await this.prisma.category.findFirst({
      where: { parentId: input.parentId ?? null },
      orderBy: { position: 'desc' },
    });

    return this.prisma.category.create({
      data: {
        name: input.name,
        slug,
        parentId: input.parentId ?? null,
        imageUrl: input.imageUrl ?? null,
        active: input.active,
        seo: input.seo ?? undefined,
        position: (lastSibling?.position ?? 0) + 1,
      },
    });
  }

  async update(id: string, input: CategoryInput) {
    const current = await this.findOne(id);

    if (input.parentId !== undefined && input.parentId !== null) {
      await this.assertNoCycle(id, input.parentId);
    }

    const slug =
      input.slug && input.slug !== current.slug
        ? await uniqueSlug(this.prisma.category, input.slug, id)
        : current.slug;

    return this.prisma.category.update({
      where: { id },
      data: {
        name: input.name,
        slug,
        parentId: input.parentId ?? null,
        imageUrl: input.imageUrl ?? null,
        active: input.active,
        seo: input.seo ?? undefined,
      },
    });
  }

  /**
   * Exclusão só quando a categoria está realmente livre.
   *
   * Apagar uma categoria com produtos deixaria itens órfãos e invisíveis na
   * vitrine — o erro fica caro de descobrir depois.
   */
  async remove(id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });

    if (!category) throw new NotFoundException('Categoria não encontrada.');

    if (category._count.products > 0) {
      throw new BadRequestException(
        `Esta categoria tem ${category._count.products} produto(s). Mova-os antes de excluir.`,
      );
    }

    if (category._count.children > 0) {
      throw new BadRequestException(
        'Esta categoria tem subcategorias. Exclua ou mova as subcategorias primeiro.',
      );
    }

    await this.prisma.category.delete({ where: { id } });
  }

  /** Aplica a nova ordem inteira em uma transação — a tela envia tudo junto. */
  async reorder(items: Array<{ id: string; parentId: string | null; position: number }>) {
    for (const item of items) {
      if (item.parentId) await this.assertNoCycle(item.id, item.parentId);
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.category.update({
          where: { id: item.id },
          data: { parentId: item.parentId, position: item.position },
        }),
      ),
    );

    return this.tree();
  }

  /**
   * Impede que uma categoria vire descendente de si mesma.
   * Sem isso, a árvore some da vitrine e o servidor entra em laço ao montar.
   */
  private async assertNoCycle(id: string, parentId: string): Promise<void> {
    if (id === parentId) {
      throw new BadRequestException('Uma categoria não pode ser pai dela mesma.');
    }

    let cursor: string | null = parentId;
    let depth = 0;

    while (cursor && depth < 50) {
      if (cursor === id) {
        throw new BadRequestException(
          'Movimento inválido: isso criaria um ciclo na árvore de categorias.',
        );
      }

      const parent: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });

      cursor = parent?.parentId ?? null;
      depth += 1;
    }
  }
}
