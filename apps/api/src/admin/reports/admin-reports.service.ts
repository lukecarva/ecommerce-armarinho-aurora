import { classificarABC, diaDaLoja, diasDoPeriodo } from '@aurora/types';
import { Injectable } from '@nestjs/common';
import type { OrderStatus } from '@prisma/client';
import { toCents } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Relatórios da loja.
 *
 * Três decisões valem para o arquivo inteiro:
 *
 * - **Venda é a que fechou.** `totalEstimate` é o que o site calculou;
 *   `finalValue` é o que a atendente fechou no WhatsApp. Faturamento soma o
 *   segundo. O primeiro aparece ao lado, porque a diferença entre os dois é
 *   informação: é o desconto que a loja dá na conversa.
 * - **O agrupamento por dia acontece em JavaScript, no fuso da loja.** Fazer
 *   `date_trunc` no Postgres agruparia por UTC e jogaria a venda das 21h para
 *   o dia seguinte. O volume desta loja cabe folgado na memória; se um dia não
 *   couber, o lugar de mudar é aqui, com `date_trunc(... AT TIME ZONE ...)`.
 * - **Consulta de relatório não escreve nada.** Tudo aqui é leitura.
 */

/** Pedido que virou dinheiro. "Pago" já conta: o combinado foi feito. */
const GANHOS: OrderStatus[] = ['pago', 'separado', 'entregue', 'retirado'];
const PERDIDOS: OrderStatus[] = ['cancelado', 'perdido'];

export interface Periodo {
  inicio: Date;
  fim: Date;
}

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vendas no período, dia a dia.
   *
   * Devolve todos os dias, inclusive os sem venda: um gráfico que pula os dias
   * vazios mente sobre o ritmo da loja.
   */
  async vendas({ inicio, fim }: Periodo) {
    const pedidos = await this.prisma.order.findMany({
      where: { createdAt: { gte: inicio, lte: fim } },
      select: { createdAt: true, status: true, totalEstimate: true, finalValue: true },
    });

    const porDia = new Map<
      string,
      { pedidos: number; estimado: number; fechado: number; ganhos: number }
    >();
    for (const dia of diasDoPeriodo(inicio, fim)) {
      porDia.set(dia, { pedidos: 0, estimado: 0, fechado: 0, ganhos: 0 });
    }

    for (const pedido of pedidos) {
      const dia = porDia.get(diaDaLoja(pedido.createdAt));
      if (!dia) continue;

      dia.pedidos += 1;
      dia.estimado += toCents(pedido.totalEstimate);

      if (GANHOS.includes(pedido.status)) {
        dia.ganhos += 1;
        dia.fechado += pedido.finalValue
          ? toCents(pedido.finalValue)
          : toCents(pedido.totalEstimate);
      }
    }

    const serie = [...porDia.entries()].map(([dia, valores]) => ({ dia, ...valores }));
    const total = serie.reduce(
      (soma, dia) => ({
        pedidos: soma.pedidos + dia.pedidos,
        estimado: soma.estimado + dia.estimado,
        fechado: soma.fechado + dia.fechado,
        ganhos: soma.ganhos + dia.ganhos,
      }),
      { pedidos: 0, estimado: 0, fechado: 0, ganhos: 0 },
    );

    return {
      serie,
      total: {
        ...total,
        ticketMedio: total.ganhos > 0 ? Math.round(total.fechado / total.ganhos) : 0,
      },
    };
  }

  /**
   * O funil: criado no site → conversa aberta → venda fechada.
   *
   * A conversa é contada por pedido que abriu o WhatsApp, não por clique:
   * quem clica três vezes no botão é uma pessoa, não três.
   */
  async funil({ inicio, fim }: Periodo) {
    const [criados, whatsapp, fechados, perdidos] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: inicio, lte: fim } } }),
      this.prisma.order.count({
        where: { createdAt: { gte: inicio, lte: fim }, whatsappClickedAt: { not: null } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: inicio, lte: fim }, status: { in: GANHOS } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: inicio, lte: fim }, status: { in: PERDIDOS } },
      }),
    ]);

    const motivos = await this.prisma.order.groupBy({
      by: ['lostReason'],
      where: { createdAt: { gte: inicio, lte: fim }, status: { in: PERDIDOS } },
      _count: { _all: true },
    });

    return {
      criados,
      whatsapp,
      fechados,
      perdidos,
      motivosDePerda: motivos
        .map((motivo) => ({
          motivo: motivo.lostReason ?? 'sem motivo registrado',
          pedidos: motivo._count._all,
        }))
        .sort((a, b) => b.pedidos - a.pedidos),
    };
  }

  /**
   * Curva ABC dos produtos.
   *
   * A receita sai das linhas dos pedidos ganhos. Quando a atendente fecha por
   * um valor diferente do estimado, o desconto fica no pedido e não é rateado
   * item a item — ratear inventaria um preço que ninguém negociou.
   */
  async curvaAbc({ inicio, fim }: Periodo) {
    const itens = await this.prisma.orderItem.findMany({
      where: { order: { createdAt: { gte: inicio, lte: fim }, status: { in: GANHOS } } },
      select: { productId: true, productSnapshot: true, qty: true, lineTotal: true },
    });

    const porProduto = new Map<
      string,
      { produto: string; sku: string | null; receita: number; quantidade: number; pedidos: number }
    >();

    for (const item of itens) {
      const foto = (item.productSnapshot ?? {}) as { name?: string; sku?: string | null };
      const chave = item.productId ?? `removido:${foto.name ?? 'sem nome'}`;
      const atual = porProduto.get(chave) ?? {
        produto: foto.name ?? 'Produto removido',
        sku: foto.sku ?? null,
        receita: 0,
        quantidade: 0,
        pedidos: 0,
      };

      atual.receita += toCents(item.lineTotal);
      atual.quantidade += Number(item.qty);
      atual.pedidos += 1;
      porProduto.set(chave, atual);
    }

    return classificarABC([...porProduto.values()]);
  }

  /** Sem estoque ou abaixo do limiar, com os favoritos como sinal de procura. */
  async ruptura() {
    return this.prisma.$queryRaw<
      Array<{
        produto: string;
        slug: string;
        variacao: string | null;
        qty: string;
        limiar: string;
        favoritos: number;
      }>
    >`
      SELECT p.name AS produto,
             p.slug,
             v.name AS variacao,
             i.qty::text AS qty,
             i.low_stock_threshold::text AS limiar,
             (SELECT count(*)::int FROM favorites f WHERE f.product_id = p.id) AS favoritos
        FROM inventory i
        JOIN products p ON p.id = i.product_id
        LEFT JOIN product_variants v ON v.id = i.variant_id
       WHERE p.status::text = 'ativo'
         AND i.qty <= i.low_stock_threshold
       ORDER BY i.qty ASC, favoritos DESC, p.name ASC
       LIMIT 200
    `;
  }

  /**
   * Buscas que não acharam nada.
   *
   * Agrupa pela forma normalizada — "tricolini" e "Tricolini " são a mesma
   * procura frustrada — e mostra um dos termos originais, que é como a pessoa
   * realmente escreveu.
   */
  async buscasSemResultado({ inicio, fim }: Periodo) {
    return this.prisma.$queryRaw<Array<{ termo: string; buscas: number; ultima: Date }>>`
      SELECT max(term) AS termo, count(*)::int AS buscas, max(created_at) AS ultima
        FROM search_queries
       WHERE results_count = 0
         AND created_at BETWEEN ${inicio} AND ${fim}
       GROUP BY normalized
       ORDER BY buscas DESC, ultima DESC
       LIMIT 200
    `;
  }

  /** Ativos na vitrine sem foto nenhuma — o que mais derruba conversão. */
  async produtosSemFoto() {
    const produtos = await this.prisma.product.findMany({
      where: { status: 'ativo', images: { none: {} } },
      select: {
        name: true,
        slug: true,
        price: true,
        createdAt: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return produtos.map((produto) => ({
      produto: produto.name,
      slug: produto.slug,
      categoria: produto.category?.name ?? null,
      preco: toCents(produto.price),
      criadoEm: produto.createdAt,
    }));
  }

  /**
   * Ativos que não venderam no período.
   *
   * Conta qualquer pedido, não só os ganhos: produto que entrou em pedido
   * perdido tem procura — o problema ali é outro, e não é este relatório.
   */
  async produtosSemVenda({ inicio, fim }: Periodo) {
    return this.prisma.$queryRaw<
      Array<{
        produto: string;
        slug: string;
        categoria: string | null;
        preco: string;
        favoritos: number;
      }>
    >`
      SELECT p.name AS produto,
             p.slug,
             c.name AS categoria,
             p.price::text AS preco,
             (SELECT count(*)::int FROM favorites f WHERE f.product_id = p.id) AS favoritos
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status::text = 'ativo'
         AND NOT EXISTS (
               SELECT 1
                 FROM order_items oi
                 JOIN orders o ON o.id = oi.order_id
                WHERE oi.product_id = p.id
                  AND o.created_at BETWEEN ${inicio} AND ${fim}
             )
       ORDER BY favoritos DESC, p.name ASC
       LIMIT 200
    `;
  }

  /**
   * Os números do topo do painel.
   *
   * São os do dia e os do período, juntos, porque a pergunta da manhã é "como
   * estamos hoje?" e a da segunda-feira é "como foi o mês?".
   */
  async resumo(periodo: Periodo) {
    const [vendas, funil, parados, semFoto] = await Promise.all([
      this.vendas(periodo),
      this.funil(periodo),
      this.prisma.order.count({
        where: {
          status: { in: ['novo', 'em_atendimento'] },
          createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.product.count({ where: { status: 'ativo', images: { none: {} } } }),
    ]);

    return { vendas: vendas.total, serie: vendas.serie, funil, paradosMaisDe24h: parados, semFoto };
  }
}
