import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';

interface FakeCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  position: number;
}

/** Prisma falso: devolve as linhas na ordem que o serviço espera do banco. */
function serviceWith(rows: FakeCategory[]): CategoriesService {
  const prisma = {
    category: {
      findMany: () =>
        Promise.resolve(
          [...rows].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
        ),
    },
  } as unknown as PrismaService;

  return new CategoriesService(prisma);
}

const CATEGORIAS: FakeCategory[] = [
  { id: 'tec', parentId: null, name: 'Tecidos', slug: 'tecidos', imageUrl: null, position: 1 },
  {
    id: 'fios',
    parentId: null,
    name: 'Fios e Barbantes',
    slug: 'fios-e-barbantes',
    imageUrl: null,
    position: 2,
  },
  {
    id: 'tricoline',
    parentId: 'tec',
    name: 'Tricoline',
    slug: 'tricoline',
    imageUrl: null,
    position: 1,
  },
  { id: 'malha', parentId: 'tec', name: 'Malha', slug: 'malha', imageUrl: null, position: 2 },
  {
    id: 'amigurumi',
    parentId: 'fios',
    name: 'Amigurumi',
    slug: 'amigurumi',
    imageUrl: null,
    position: 1,
  },
];

describe('CategoriesService.tree', () => {
  it('monta a árvore a partir da lista plana do banco', async () => {
    const tree = await serviceWith(CATEGORIAS).tree();

    expect(tree).toHaveLength(2);
    expect(tree.map((node) => node.slug)).toEqual(['tecidos', 'fios-e-barbantes']);
    expect(tree[0]?.children.map((node) => node.slug)).toEqual(['tricoline', 'malha']);
    expect(tree[1]?.children.map((node) => node.slug)).toEqual(['amigurumi']);
  });

  it('respeita a ordem definida no painel', async () => {
    const invertidas = CATEGORIAS.map((category) =>
      category.parentId === null
        ? { ...category, position: category.id === 'tec' ? 2 : 1 }
        : category,
    );

    const tree = await serviceWith(invertidas).tree();
    expect(tree.map((node) => node.slug)).toEqual(['fios-e-barbantes', 'tecidos']);
  });

  it('não devolve nada quando não há categorias', async () => {
    expect(await serviceWith([]).tree()).toEqual([]);
  });

  it('ignora categoria órfã, cujo pai não veio na consulta', async () => {
    // Acontece quando o pai está inativo: o filho não pode virar raiz da vitrine.
    const comOrfa: FakeCategory[] = [
      ...CATEGORIAS,
      {
        id: 'orfa',
        parentId: 'inexistente',
        name: 'Órfã',
        slug: 'orfa',
        imageUrl: null,
        position: 9,
      },
    ];

    const tree = await serviceWith(comOrfa).tree();
    const slugs = JSON.stringify(tree);

    expect(tree).toHaveLength(2);
    expect(slugs).not.toContain('orfa');
  });
});
