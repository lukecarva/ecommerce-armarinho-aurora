import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  position: number;
  children: CategoryNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Árvore de categorias ativas, na ordem definida pelo admin. */
  async tree(): Promise<CategoryNode[]> {
    const categories = await this.prisma.category.findMany({
      where: { active: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });

    const byParent = new Map<string | null, CategoryNode[]>();

    for (const category of categories) {
      const node: CategoryNode = {
        id: category.id,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        position: category.position,
        children: [],
      };
      const siblings = byParent.get(category.parentId) ?? [];
      siblings.push(node);
      byParent.set(category.parentId, siblings);
    }

    const attach = (nodes: CategoryNode[]): CategoryNode[] =>
      nodes.map((node) => ({ ...node, children: attach(byParent.get(node.id) ?? []) }));

    return attach(byParent.get(null) ?? []);
  }
}
