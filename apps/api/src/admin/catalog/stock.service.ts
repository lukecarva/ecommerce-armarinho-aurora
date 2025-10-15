import type { Availability } from '@aurora/types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { fromQuantity, toQuantity } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import { availabilityFor } from './admin-products.service';

/**
 * Ajuste manual de estoque.
 *
 * Todo ajuste exige motivo e vira uma movimentação. Sem isso, o estoque vira
 * um número que ninguém sabe explicar: quando a contagem não bate, a pergunta
 * é sempre "quem mexeu, quando e por quê" — e a resposta precisa estar aqui.
 *
 * A importação de planilha grava movimentação pelo mesmo caminho, então o
 * histórico mostra ajuste manual e importação lado a lado.
 */

export interface AjusteDeEstoque {
  /** `definir` grava o número contado; `ajustar` soma ou subtrai. */
  modo: 'definir' | 'ajustar';
  quantidade: number;
  motivo: string;
  lowStockThreshold?: number;
  /** Força a disponibilidade em vez de calcular pela quantidade. */
  availability?: Availability;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async ajustar(productId: string, entrada: AjusteDeEstoque, ator: { id: string; name: string }) {
    const produto = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true },
    });
    if (!produto) throw new NotFoundException('Produto não encontrado.');

    const atual = await this.prisma.inventory.findFirst({
      where: { productId, variantId: null },
    });

    const anterior = toQuantity(atual?.qty);
    const limite = entrada.lowStockThreshold ?? toQuantity(atual?.lowStockThreshold ?? 3);

    const nova = entrada.modo === 'definir' ? entrada.quantidade : anterior + entrada.quantidade;

    if (nova < 0) {
      throw new BadRequestException(
        `O ajuste deixaria o estoque em ${nova}. Informe uma quantidade que não fique negativa.`,
      );
    }

    const disponibilidade = entrada.availability ?? availabilityFor(nova, limite);

    return this.prisma.$transaction(async (tx) => {
      const estoque = atual
        ? await tx.inventory.update({
            where: { id: atual.id },
            data: {
              qty: fromQuantity(nova),
              lowStockThreshold: fromQuantity(limite),
              availability: disponibilidade,
              source: 'manual',
            },
          })
        : await tx.inventory.create({
            data: {
              productId,
              qty: fromQuantity(nova),
              lowStockThreshold: fromQuantity(limite),
              availability: disponibilidade,
              source: 'manual',
            },
          });

      // Movimentação só quando a quantidade realmente mudou: corrigir só o
      // limite de "últimas unidades" não é entrada nem saída de mercadoria.
      if (nova !== anterior) {
        await tx.inventoryMovement.create({
          data: {
            inventoryId: estoque.id,
            delta: fromQuantity(nova - anterior),
            reason: entrada.motivo,
            actorId: ator.id,
          },
        });
      }

      return {
        produto: produto.name,
        anterior,
        atual: nova,
        delta: nova - anterior,
        availability: disponibilidade,
        lowStockThreshold: limite,
      };
    });
  }

  /** Situação atual mais o histórico de movimentações do produto. */
  async historico(productId: string, limite = 50) {
    const estoque = await this.prisma.inventory.findFirst({
      where: { productId, variantId: null },
      include: {
        movements: {
          orderBy: { createdAt: 'desc' },
          take: limite,
        },
      },
    });

    if (!estoque) {
      return {
        qty: 0,
        lowStockThreshold: 3,
        availability: 'sob_consulta' as Availability,
        movimentacoes: [],
      };
    }

    const atores = await this.carregarAtores(
      estoque.movements.map((m) => m.actorId).filter((id): id is string => !!id),
    );

    return {
      qty: toQuantity(estoque.qty),
      lowStockThreshold: toQuantity(estoque.lowStockThreshold),
      availability: estoque.availability,
      source: estoque.source,
      updatedAt: estoque.updatedAt,
      movimentacoes: estoque.movements.map((movimento) => ({
        id: movimento.id,
        delta: toQuantity(movimento.delta),
        reason: movimento.reason,
        autor: movimento.actorId ? (atores.get(movimento.actorId) ?? null) : null,
        createdAt: movimento.createdAt,
      })),
    };
  }

  /**
   * Produtos em ruptura ou perto dela.
   *
   * Só considera o que está publicado: rascunho sem estoque é normal, produto
   * na vitrine sem estoque é venda perdida.
   */
  async alertas(pagina: number, porPagina: number) {
    // `lowStockThreshold` varia por produto, então a comparação entre colunas
    // precisa de SQL — o Prisma não expressa "campo <= outro campo".
    const ids = await this.prisma.$queryRaw<Array<{ product_id: string }>>`
      SELECT i.product_id
        FROM inventory i
        JOIN products p ON p.id = i.product_id
       WHERE i.variant_id IS NULL
         AND p.status = 'ativo'
         AND i.qty <= i.low_stock_threshold
       ORDER BY i.qty ASC
    `;

    const total = ids.length;
    const pagina_ids = ids
      .slice((pagina - 1) * porPagina, pagina * porPagina)
      .map((linha) => linha.product_id);

    const produtos = await this.prisma.product.findMany({
      where: { id: { in: pagina_ids } },
      select: {
        id: true,
        name: true,
        skuFutura: true,
        unit: true,
        category: { select: { name: true } },
        inventory: { where: { variantId: null }, take: 1 },
        images: {
          take: 1,
          orderBy: { position: 'asc' },
          select: { media: { select: { url: true } } },
        },
      },
    });

    // A consulta acima define a ordem; o `findMany` não a preserva.
    const porId = new Map(produtos.map((produto) => [produto.id, produto]));

    return {
      items: pagina_ids
        .map((id) => porId.get(id))
        .filter((produto): produto is NonNullable<typeof produto> => !!produto)
        .map((produto) => ({
          id: produto.id,
          name: produto.name,
          skuFutura: produto.skuFutura,
          unit: produto.unit,
          categoria: produto.category?.name ?? null,
          imageUrl: produto.images[0]?.media.url ?? null,
          qty: toQuantity(produto.inventory[0]?.qty),
          lowStockThreshold: toQuantity(produto.inventory[0]?.lowStockThreshold),
          availability: produto.inventory[0]?.availability ?? 'sob_consulta',
        })),
      page: pagina,
      perPage: porPagina,
      total,
      totalPages: Math.max(1, Math.ceil(total / porPagina)),
    };
  }

  private async carregarAtores(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();

    const usuarios = await this.prisma.adminUser.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });

    return new Map(usuarios.map((usuario) => [usuario.id, usuario.name]));
  }
}

/** Motivos sugeridos no painel — texto livre continua permitido. */
export const MOTIVOS_SUGERIDOS = [
  'Contagem de inventário',
  'Entrada de mercadoria',
  'Venda no balcão',
  'Perda ou avaria',
  'Devolução de cliente',
  'Correção de cadastro',
] as const;

export type MotivoSugerido = (typeof MOTIVOS_SUGERIDOS)[number];
