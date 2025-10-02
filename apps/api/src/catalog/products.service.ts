import { resolvePrice, type Availability, type QuantityRules, type SaleUnit } from '@aurora/types';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { toCents, toCentsOrNull, toQuantity } from '../common/decimal';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Catálogo público.
 *
 * Duas regras valem em todas as consultas daqui, sem exceção:
 *
 * 1. **Só entra o que está pronto.** `status = ativo` e `needsContent = false`.
 *    Um produto importado do Futura sem foto e sem categoria existe no banco,
 *    mas não pode aparecer na vitrine — foi para isso que o `needsContent`
 *    nasceu na Sprint 2.
 * 2. **Nunca sai quantidade.** A vitrine mostra "Em estoque" ou "Últimas
 *    unidades". Como o pagamento acontece no WhatsApp, não há risco de
 *    oversell, e esconder o número torna a defasagem do estoque irrelevante.
 */

export type Ordenacao = 'relevancia' | 'menor-preco' | 'maior-preco' | 'novidades' | 'nome';

export interface ListarProdutos {
  categoria?: string;
  colecao?: string;
  busca?: string;
  /** Filtros por atributo: `{ largura: ['1,50m'], composicao: ['100% Algodão'] }` */
  atributos?: Record<string, string[]>;
  disponibilidade?: Availability[];
  precoMin?: number;
  precoMax?: number;
  ordenar?: Ordenacao;
  /**
   * Restringe a um conjunto de ids. É por aqui que a busca entrega seu
   * resultado: quem ranqueia é o Postgres, quem sabe montar o card é este
   * serviço.
   */
  ids?: string[];
  /**
   * Devolve os produtos na ordem em que os ids chegaram, e não na ordem do
   * banco. Sem isso o ranking de relevância da busca se perderia no `IN`.
   */
  preservarOrdemDosIds?: boolean;
  page: number;
  perPage: number;
}

export interface ProdutoDaVitrine {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAt: number | null;
  descontoPercent: number;
  unit: SaleUnit;
  packSize: number | null;
  availability: Availability;
  imageUrl: string | null;
  blurhash: string | null;
  /** Linha curta de atributo: "1,50m largura". */
  highlight: string | null;
}

export interface ImagemDaGaleria {
  url: string;
  blurhash: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface VariacaoDoProduto {
  id: string;
  name: string;
  color: string | null;
  colorHex: string | null;
  size: string | null;
  /** Preço final da variação, já com o `priceDelta` aplicado. */
  price: number;
  availability: Availability;
  imageUrl: string | null;
}

export interface ProdutoDetalhe extends ProdutoDaVitrine {
  sku: string | null;
  shortDesc: string | null;
  description: string | null;
  /** Regras do seletor de quantidade: passo, mínimo. Tecido anda de 0,5 em 0,5. */
  quantidade: QuantityRules;
  attributes: Array<{ chave: string; valor: string }>;
  images: ImagemDaGaleria[];
  variants: VariacaoDoProduto[];
  categoria: { name: string; slug: string } | null;
  marca: { name: string; slug: string } | null;
  trilha: Array<{ name: string; slug: string }>;
  seo: { title?: string; description?: string } | null;
  relacionados: ProdutoDaVitrine[];
}

export interface FacetaValor {
  valor: string;
  total: number;
}

export interface Facetas {
  atributos: Record<string, FacetaValor[]>;
  disponibilidade: FacetaValor[];
  preco: { min: number; max: number };
}

/** Atributos que viram filtro, na ordem em que aparecem na tela. */
const ATRIBUTOS_FILTRAVEIS = ['largura', 'composicao', 'cor', 'gramatura', 'metragem', 'marca'];

@Injectable()
export class PublicProductsService {
  private readonly env = loadEnv();

  constructor(private readonly prisma: PrismaService) {}

  async listar(entrada: ListarProdutos) {
    if (entrada.ids?.length === 0) {
      return { items: [], page: entrada.page, perPage: entrada.perPage, total: 0, totalPages: 1 };
    }

    const where = await this.montarWhere(entrada);
    // A busca já paginou ao fatiar o ranking; paginar de novo aqui devolveria
    // uma página vazia a partir da segunda.
    const paginar = !entrada.preservarOrdemDosIds;

    const [linhas, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: this.ordenar(entrada.ordenar),
        ...(paginar ? { skip: (entrada.page - 1) * entrada.perPage, take: entrada.perPage } : {}),
        include: LISTA_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    const ordenadas = entrada.preservarOrdemDosIds
      ? ordenarPorIds(linhas, entrada.ids ?? [])
      : linhas;

    return {
      items: ordenadas.map((linha) => this.paraVitrine(linha)),
      page: entrada.page,
      perPage: entrada.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / entrada.perPage)),
    };
  }

  /**
   * Opções de filtro calculadas sobre o resultado atual.
   *
   * São geradas a partir do JSONB de atributos, e não de uma lista fixa: a
   * loja cadastra "largura", "gramatura" ou o que fizer sentido para cada
   * categoria, e o filtro aparece sozinho.
   */
  async facetas(entrada: Omit<ListarProdutos, 'page' | 'perPage'>): Promise<Facetas> {
    // As facetas ignoram os próprios filtros de atributo: quem já escolheu
    // "1,50m" precisa continuar vendo as outras larguras disponíveis.
    const base = await this.montarWhere({ ...entrada, atributos: undefined, page: 1, perPage: 1 });
    // Os ids são TEXT no banco: `String @id @default(uuid())` do Prisma não
    // cria coluna `uuid`. Por isso o cast das agregações é `::text[]`.
    // Carregamos os ids para reaproveitá-los nas três agregações. Na prática o
    // conjunto é o de uma categoria ou de uma busca, não o catálogo inteiro —
    // a tela de filtros só existe dentro desses contextos.
    const ids = await this.prisma.product.findMany({ where: base, select: { id: true } });

    if (ids.length === 0) {
      return { atributos: {}, disponibilidade: [], preco: { min: 0, max: 0 } };
    }

    const lista = ids.map((item) => item.id);

    const [atributos, disponibilidade, faixa] = await Promise.all([
      this.prisma.$queryRaw<Array<{ chave: string; valor: string; total: number }>>`
        SELECT atributo.key AS chave, atributo.value AS valor, COUNT(*)::int AS total
          FROM products p, LATERAL jsonb_each_text(p.attributes) AS atributo
         WHERE p.id = ANY(${lista}::text[])
           AND atributo.value <> ''
         GROUP BY atributo.key, atributo.value
         ORDER BY atributo.key, COUNT(*) DESC, atributo.value
      `,
      this.prisma.$queryRaw<Array<{ valor: Availability; total: number }>>`
        SELECT i.availability AS valor, COUNT(*)::int AS total
          FROM inventory i
         WHERE i.product_id = ANY(${lista}::text[])
           AND i.variant_id IS NULL
         GROUP BY i.availability
         ORDER BY COUNT(*) DESC
      `,
      this.prisma.$queryRaw<Array<{ min: string; max: string }>>`
        SELECT MIN(COALESCE(p.promo_price, p.price))::text AS min,
               MAX(COALESCE(p.promo_price, p.price))::text AS max
          FROM products p
         WHERE p.id = ANY(${lista}::text[])
      `,
    ]);

    const porChave: Record<string, FacetaValor[]> = {};

    for (const linha of atributos) {
      // Só viram filtro os atributos que a loja usa para escolher produto.
      // "observacao" ou "codigo interno" poluiriam a barra lateral.
      if (!ATRIBUTOS_FILTRAVEIS.includes(linha.chave)) continue;
      (porChave[linha.chave] ??= []).push({ valor: linha.valor, total: linha.total });
    }

    return {
      atributos: porChave,
      disponibilidade: disponibilidade.map((linha) => ({
        valor: linha.valor,
        total: linha.total,
      })),
      preco: {
        min: Math.floor(Number(faixa[0]?.min ?? 0) * 100),
        max: Math.ceil(Number(faixa[0]?.max ?? 0) * 100),
      },
    };
  }

  /** Categoria com trilha de navegação e subcategorias. */
  async categoria(slug: string) {
    const categoria = await this.prisma.category.findFirst({
      where: { slug, active: true },
      include: {
        children: {
          where: { active: true },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, slug: true, imageUrl: true },
        },
      },
    });

    if (!categoria) throw new NotFoundException('Categoria não encontrada.');

    return {
      id: categoria.id,
      name: categoria.name,
      slug: categoria.slug,
      imageUrl: categoria.imageUrl,
      seo: categoria.seo,
      children: categoria.children,
      trilha: await this.trilha(categoria.parentId, [
        { name: categoria.name, slug: categoria.slug },
      ]),
    };
  }

  /**
   * Página de produto.
   *
   * Vale o mesmo filtro da vitrine: produto sem foto ou fora do ar responde
   * 404, e não uma página vazia. Um link antigo que caiu precisa devolver 404
   * de verdade — é o que tira a URL morta do Google.
   */
  async produto(slug: string): Promise<ProdutoDetalhe> {
    const linha = await this.prisma.product.findFirst({
      where: { slug, ...VISIVEL },
      include: DETALHE_INCLUDE,
    });

    if (!linha) throw new NotFoundException('Produto não encontrado.');

    const base = this.paraVitrine({
      ...linha,
      images: linha.images.slice(0, 1),
      inventory: linha.inventory.filter((item) => item.variantId === null).slice(0, 1),
    });

    const precoBase = resolvePrice(
      {
        price: toCents(linha.price),
        promoPrice: toCentsOrNull(linha.promoPrice),
        promoStartsAt: linha.promoStartsAt,
        promoEndsAt: linha.promoEndsAt,
      },
      { wholesaleEnabled: this.env.WHOLESALE_ENABLED },
    );

    const estoquePorVariacao = new Map(
      linha.inventory
        .filter((item) => item.variantId !== null)
        .map((item) => [item.variantId!, item.availability]),
    );

    return {
      ...base,
      sku: linha.skuFutura,
      shortDesc: linha.shortDesc,
      description: linha.description,
      quantidade: {
        step: toQuantity(linha.saleStep) || 1,
        min: toQuantity(linha.minQty) || 1,
      },
      attributes: atributosVisiveis(linha.attributes),
      images: linha.images.map((imagem) => ({
        url: imagem.media.url,
        blurhash: imagem.media.blurhash,
        alt: imagem.alt ?? imagem.media.alt ?? linha.name,
        width: imagem.media.width,
        height: imagem.media.height,
      })),
      variants: linha.variants.map((variacao) => ({
        id: variacao.id,
        name: variacao.name,
        color: variacao.color,
        colorHex: variacao.colorHex,
        size: variacao.size,
        // O delta é sobre o preço já resolvido: uma variação mais cara não
        // pode escapar da promoção que vale para o produto.
        price: precoBase.unitPrice + toCents(variacao.priceDelta),
        availability: estoquePorVariacao.get(variacao.id) ?? base.availability,
        imageUrl: variacao.images[0]?.media.url ?? null,
      })),
      categoria: linha.category ? { name: linha.category.name, slug: linha.category.slug } : null,
      marca: linha.brand ? { name: linha.brand.name, slug: linha.brand.slug } : null,
      trilha: linha.category
        ? await this.trilha(linha.category.parentId, [
            { name: linha.category.name, slug: linha.category.slug },
          ])
        : [],
      seo: (linha.seo as { title?: string; description?: string } | null) ?? null,
      relacionados: await this.relacionados(linha.id, linha.categoryId),
    };
  }

  /**
   * O que a home precisa, em uma consulta só: categorias, ofertas e as
   * coleções que estão no ar agora.
   */
  async home() {
    const agora = new Date();

    const [categorias, ofertas, colecoes, novidades] = await Promise.all([
      this.prisma.category.findMany({
        where: { active: true, parentId: null },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, slug: true, imageUrl: true },
      }),
      this.prisma.product.findMany({
        where: {
          ...VISIVEL,
          promoPrice: { not: null },
          OR: [{ promoStartsAt: null }, { promoStartsAt: { lte: agora } }],
          AND: [{ OR: [{ promoEndsAt: null }, { promoEndsAt: { gte: agora } }] }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 12,
        include: LISTA_INCLUDE,
      }),
      this.prisma.collection.findMany({
        where: {
          active: true,
          OR: [{ startsAt: null }, { startsAt: { lte: agora } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: agora } }] }],
        },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        take: 4,
        select: { id: true, name: true, slug: true, bannerUrl: true, type: true },
      }),
      this.prisma.product.findMany({
        where: VISIVEL,
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: LISTA_INCLUDE,
      }),
    ]);

    return {
      categorias,
      ofertas: ofertas.map((produto) => this.paraVitrine(produto)),
      colecoes,
      novidades: novidades.map((produto) => this.paraVitrine(produto)),
    };
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  private async montarWhere(entrada: ListarProdutos): Promise<Prisma.ProductWhereInput> {
    const where: Prisma.ProductWhereInput = { ...VISIVEL };
    const e: Prisma.ProductWhereInput[] = [];

    if (entrada.categoria) {
      // Inclui as subcategorias: quem abre "Tecidos" espera ver tricoline
      // e malha junto, não uma página vazia.
      const ids = await this.idsDaArvore(entrada.categoria);
      where.categoryId = { in: ids };
    }

    if (entrada.ids) {
      where.id = { in: entrada.ids };
    }

    if (entrada.colecao) {
      where.collections = { some: { collection: { slug: entrada.colecao, active: true } } };
    }

    if (entrada.busca) {
      const termo = entrada.busca.trim();
      e.push({
        OR: [
          { name: { contains: termo, mode: 'insensitive' } },
          { shortDesc: { contains: termo, mode: 'insensitive' } },
        ],
      });
    }

    // Filtro por atributo faz varredura sequencial: o JSONB não tem índice
    // que sirva para `attributes->'largura' = '...'`. É aceitável no tamanho
    // deste catálogo (centenas a poucos milhares). Se um dia pesar, o caminho
    // é trocar para o operador de contenção `@>` com índice GIN.
    for (const [chave, valores] of Object.entries(entrada.atributos ?? {})) {
      if (valores.length === 0) continue;
      // Vários valores do mesmo atributo somam (OU); atributos diferentes
      // se cruzam (E) — é o que a pessoa espera de uma barra de filtros.
      e.push({ OR: valores.map((valor) => ({ attributes: { path: [chave], equals: valor } })) });
    }

    if (entrada.disponibilidade?.length) {
      e.push({
        inventory: { some: { variantId: null, availability: { in: entrada.disponibilidade } } },
      });
    }

    if (entrada.precoMin !== undefined || entrada.precoMax !== undefined) {
      e.push({
        price: {
          ...(entrada.precoMin !== undefined ? { gte: entrada.precoMin / 100 } : {}),
          ...(entrada.precoMax !== undefined ? { lte: entrada.precoMax / 100 } : {}),
        },
      });
    }

    if (e.length > 0) where.AND = e;
    return where;
  }

  /** A categoria e todas as descendentes. */
  private async idsDaArvore(slug: string): Promise<string[]> {
    const raiz = await this.prisma.category.findFirst({
      where: { slug, active: true },
      select: { id: true },
    });

    if (!raiz) return ['00000000-0000-0000-0000-000000000000'];

    const ids = [raiz.id];
    let fronteira = [raiz.id];
    let profundidade = 0;

    // A árvore da loja tem dois ou três níveis; o teto evita laço se um dia
    // um ciclo escapar da validação do painel.
    while (fronteira.length > 0 && profundidade < 6) {
      const filhos = await this.prisma.category.findMany({
        where: { parentId: { in: fronteira }, active: true },
        select: { id: true },
      });

      fronteira = filhos.map((filho) => filho.id);
      ids.push(...fronteira);
      profundidade += 1;
    }

    return ids;
  }

  private async trilha(
    parentId: string | null,
    acumulado: Array<{ name: string; slug: string }>,
  ): Promise<Array<{ name: string; slug: string }>> {
    let cursor = parentId;
    let profundidade = 0;

    while (cursor && profundidade < 6) {
      const pai: { name: string; slug: string; parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: cursor },
          select: { name: true, slug: true, parentId: true },
        });

      if (!pai) break;
      acumulado.unshift({ name: pai.name, slug: pai.slug });
      cursor = pai.parentId;
      profundidade += 1;
    }

    return acumulado;
  }

  private ordenar(ordem: Ordenacao = 'relevancia'): Prisma.ProductOrderByWithRelationInput[] {
    switch (ordem) {
      case 'menor-preco':
        return [{ price: 'asc' }];
      case 'maior-preco':
        return [{ price: 'desc' }];
      case 'novidades':
        return [{ createdAt: 'desc' }];
      case 'nome':
        return [{ name: 'asc' }];
      default:
        // Sem termo de busca, "relevância" é a curadoria da loja: o que está
        // em promoção primeiro, depois o que foi mexido mais recentemente.
        return [{ promoPrice: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }];
    }
  }

  /**
   * "Quem viu este, viu também" sem histórico de navegação: os vizinhos de
   * categoria. Numa loja de aviamentos é o que funciona — quem abre um
   * tricoline quer comparar com os outros tricolines.
   */
  private async relacionados(id: string, categoryId: string | null): Promise<ProdutoDaVitrine[]> {
    if (!categoryId) return [];

    const linhas = await this.prisma.product.findMany({
      where: { ...VISIVEL, categoryId, id: { not: id } },
      orderBy: [{ promoPrice: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 8,
      include: LISTA_INCLUDE,
    });

    return linhas.map((produto) => this.paraVitrine(produto));
  }

  private paraVitrine(
    linha: Prisma.ProductGetPayload<{ include: typeof LISTA_INCLUDE }>,
  ): ProdutoDaVitrine {
    const preco = resolvePrice(
      {
        price: toCents(linha.price),
        promoPrice: toCentsOrNull(linha.promoPrice),
        promoStartsAt: linha.promoStartsAt,
        promoEndsAt: linha.promoEndsAt,
      },
      { wholesaleEnabled: this.env.WHOLESALE_ENABLED },
    );

    const imagem = linha.images[0]?.media;

    return {
      id: linha.id,
      name: linha.name,
      slug: linha.slug,
      price: preco.unitPrice,
      compareAt: preco.compareAt,
      descontoPercent: preco.compareAt
        ? Math.round(((preco.compareAt - preco.unitPrice) / preco.compareAt) * 100)
        : 0,
      unit: linha.unit,
      packSize: linha.packSize,
      availability: linha.inventory[0]?.availability ?? 'sob_consulta',
      imageUrl: imagem?.url ?? null,
      blurhash: imagem?.blurhash ?? null,
      highlight: destaque(linha.attributes, linha.shortDesc, linha.packSize),
    };
  }
}

/** O filtro que separa o catálogo interno da vitrine. */
const VISIVEL = {
  status: 'ativo',
  needsContent: false,
} as const satisfies Prisma.ProductWhereInput;

const DETALHE_INCLUDE = {
  images: {
    orderBy: { position: 'asc' as const },
    include: { media: true },
  },
  variants: {
    orderBy: { position: 'asc' as const },
    include: {
      images: {
        orderBy: { position: 'asc' as const },
        take: 1,
        include: { media: { select: { url: true } } },
      },
    },
  },
  // Todas as linhas: a do produto (variantId nulo) e a de cada variação.
  inventory: true,
  category: { select: { name: true, slug: true, parentId: true } },
  brand: { select: { name: true, slug: true } },
} satisfies Prisma.ProductInclude;

const LISTA_INCLUDE = {
  images: {
    orderBy: { position: 'asc' as const },
    take: 1,
    include: { media: { select: { url: true, blurhash: true } } },
  },
  inventory: { where: { variantId: null }, take: 1 },
} satisfies Prisma.ProductInclude;

/**
 * Linha curta abaixo do nome no card.
 *
 * Prefere o resumo escrito pela loja; sem ele, monta a partir do atributo
 * mais informativo. É o "1,50m largura" do design.
 */
export function destaque(
  attributes: Prisma.JsonValue,
  shortDesc: string | null,
  packSize: number | null,
): string | null {
  if (shortDesc) return shortDesc;

  if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
    const mapa = attributes as Record<string, unknown>;

    for (const chave of ['largura', 'metragem', 'gramatura', 'composicao']) {
      const valor = mapa[chave];
      if (typeof valor === 'string' && valor.trim()) {
        return chave === 'largura' ? `${valor} largura` : valor;
      }
    }
  }

  if (packSize && packSize > 1) return `Pacote com ${packSize} un`;
  return null;
}

/**
 * Reordena o resultado do banco segundo a ordem em que os ids chegaram.
 *
 * O `IN` do SQL não tem ordem, e o ranking de relevância da busca vive
 * justamente na ordem dos ids.
 */
function ordenarPorIds<T extends { id: string }>(linhas: T[], ids: string[]): T[] {
  const posicao = new Map(ids.map((id, indice) => [id, indice]));
  return [...linhas].sort(
    (a, b) => (posicao.get(a.id) ?? Infinity) - (posicao.get(b.id) ?? Infinity),
  );
}

/**
 * Atributos que a ficha técnica exibe, na ordem cadastrada.
 *
 * Só entra texto: um JSON aninhado que alguém tenha gravado no atributo não
 * vira `[object Object]` na tela.
 */
function atributosVisiveis(attributes: Prisma.JsonValue): Array<{ chave: string; valor: string }> {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return [];

  return Object.entries(attributes as Record<string, unknown>)
    .filter(
      (entrada): entrada is [string, string] =>
        typeof entrada[1] === 'string' && entrada[1].trim() !== '',
    )
    .map(([chave, valor]) => ({ chave, valor }));
}
