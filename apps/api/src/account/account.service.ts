import {
  buildContactUrl,
  MAX_FAVORITES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
  type SaleUnit,
} from '@aurora/types';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { toCents, toCentsOrNull, toQuantity } from '../common/decimal';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A área do cliente: dados, pedidos, favoritos e cupons.
 *
 * Tudo aqui é filtrado pelo `customerId` da sessão — nunca por um id que
 * venha da URL sozinho. É o que impede alguém de ver o pedido de outra pessoa
 * trocando o código no endereço.
 */

/**
 * Eventos da linha do tempo que o cliente pode ver.
 *
 * Nota interna, motivo de perda e IP ficam de fora: são registros da loja
 * sobre o atendimento, não do cliente.
 */
const EVENTOS_VISIVEIS = ['criado', 'status_alterado'] as const;

@Injectable()
export class AccountService {
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly carrinho: CartService,
  ) {}

  async perfil(customerId: string) {
    const cliente = await this.prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { group: { select: { name: true } } },
    });

    return {
      id: cliente.id,
      name: cliente.name,
      email: cliente.email,
      phone: cliente.phoneE164,
      emailVerified: cliente.emailVerifiedAt !== null,
      temSenha: cliente.passwordHash !== null,
      acceptsMarketing: cliente.acceptsMarketing,
      grupo: cliente.group?.name ?? null,
      createdAt: cliente.createdAt,
    };
  }

  /**
   * Atualiza nome, telefone e o aceite de novidades.
   *
   * O e-mail não muda por aqui: trocar o e-mail de uma conta é trocar a porta
   * de entrada dela, e isso exige confirmar a caixa nova — fica para quando o
   * envio de e-mail estiver de pé.
   *
   * Mudar o aceite de marketing grava um novo registro de consentimento, com
   * data e IP: a LGPD pede para provar tanto o sim quanto o não.
   */
  async atualizarPerfil(
    customerId: string,
    dados: { nome: string; telefone: string; aceitaMarketing: boolean },
    ip: string | null,
  ) {
    const atual = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const consentimento = (atual.consent ?? {}) as Record<string, unknown>;

    const mudouMarketing = atual.acceptsMarketing !== dados.aceitaMarketing;

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        name: dados.nome,
        phoneE164: dados.telefone,
        acceptsMarketing: dados.aceitaMarketing,
        ...(mudouMarketing
          ? {
              consent: {
                ...consentimento,
                marketing: { aceito: dados.aceitaMarketing, em: new Date().toISOString(), ip },
              } as Prisma.InputJsonValue,
            }
          : {}),
      },
    });

    return this.perfil(customerId);
  }

  async pedidos(customerId: string, page = 1, perPage = 20) {
    const where = { customerId };

    const [pedidos, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { items: { orderBy: { id: 'asc' } } },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: pedidos.map((pedido) => ({
        code: pedido.code,
        status: pedido.status,
        statusLabel: ORDER_STATUS_LABELS[pedido.status as OrderStatus],
        createdAt: pedido.createdAt,
        itemCount: pedido.items.length,
        total: toCents(pedido.totalEstimate),
        finalValue: toCentsOrNull(pedido.finalValue),
        // Três miniaturas bastam para a pessoa reconhecer o pedido na lista.
        preview: pedido.items.slice(0, 3).map((item) => {
          const snapshot = item.productSnapshot as { name: string; imageUrl: string | null };
          return { name: snapshot.name, imageUrl: snapshot.imageUrl };
        }),
      })),
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  async pedido(customerId: string, code: string) {
    const pedido = await this.prisma.order.findFirst({
      where: { code: code.trim().toUpperCase(), customerId },
      include: {
        items: { orderBy: { id: 'asc' } },
        events: {
          where: { type: { in: [...EVENTOS_VISIVEIS] } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!pedido) throw new NotFoundException('Pedido não encontrado.');

    const loja = await this.prisma.setting.findUnique({ where: { key: 'store.info' } });
    const whatsapp =
      (loja?.value as { whatsapp?: string } | null)?.whatsapp ?? this.env.STORE_WHATSAPP;

    return {
      code: pedido.code,
      status: pedido.status,
      statusLabel: ORDER_STATUS_LABELS[pedido.status as OrderStatus],
      createdAt: pedido.createdAt,
      delivery: { label: pedido.deliveryLabel, note: pedido.deliveryNote },
      couponCode: pedido.couponCode,
      subtotal: toCents(pedido.subtotal),
      discount: toCents(pedido.discount),
      total: toCents(pedido.totalEstimate),
      finalValue: toCentsOrNull(pedido.finalValue),
      items: pedido.items.map((item) => ({
        ...(item.productSnapshot as Record<string, unknown>),
        productId: item.productId,
        qty: toQuantity(item.qty),
        unitPrice: toCents(item.unitPrice),
        lineTotal: toCents(item.lineTotal),
      })),
      historico: pedido.events.map((evento) => {
        const dados = (evento.payload ?? {}) as { para?: OrderStatus };
        return {
          createdAt: evento.createdAt,
          label:
            evento.type === 'criado'
              ? 'Pedido feito'
              : (ORDER_STATUS_LABELS[dados.para as OrderStatus] ?? 'Atualizado'),
        };
      }),
      // Conversa sobre o pedido, não a mensagem de fechamento: o pedido já foi
      // enviado, agora é "quero falar sobre o CP-2026-0001".
      whatsappUrl: buildContactUrl(whatsapp, `Olá! Quero falar sobre meu pedido *${pedido.code}*.`),
    };
  }

  /**
   * "Pedir de novo": põe no carrinho tudo que ainda está à venda.
   *
   * Com o preço de hoje, não o do pedido antigo — o carrinho sempre lê o
   * catálogo, e é esse o valor que a loja vai praticar. O que saiu do ar é
   * pulado e informado pelo nome, para a pessoa não achar que esquecemos.
   */
  async pedirDeNovo(customerId: string, code: string, tokenDoCarrinho: string) {
    const pedido = await this.prisma.order.findFirst({
      where: { code: code.trim().toUpperCase(), customerId },
      include: { items: { orderBy: { id: 'asc' } } },
    });

    if (!pedido) throw new NotFoundException('Pedido não encontrado.');

    const indisponiveis: string[] = [];
    let adicionados = 0;

    for (const item of pedido.items) {
      const snapshot = item.productSnapshot as { name: string; unit: SaleUnit };

      if (!item.productId) {
        indisponiveis.push(snapshot.name);
        continue;
      }

      try {
        await this.carrinho.adicionar(tokenDoCarrinho, {
          productId: item.productId,
          variantId: item.variantId,
          qty: toQuantity(item.qty),
        });
        adicionados += 1;
      } catch {
        // Fora do ar, arquivado ou variação removida: o carrinho recusa, e a
        // recusa aqui vira "não está mais disponível" para a pessoa.
        indisponiveis.push(snapshot.name);
      }
    }

    return { adicionados, indisponiveis, carrinho: await this.carrinho.ler(tokenDoCarrinho) };
  }

  async favoritos(customerId: string): Promise<string[]> {
    const linhas = await this.prisma.favorite.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
      take: MAX_FAVORITES,
    });

    return linhas.map((linha) => linha.productId);
  }

  /**
   * Substitui a lista inteira.
   *
   * A vitrine já faz a união entre o que estava no navegador e o que estava
   * na conta; aqui só gravamos o resultado. Ids de produto que não existem são
   * descartados em silêncio — sobra de uma versão antiga do site, não erro de
   * quem está usando.
   */
  async salvarFavoritos(customerId: string, ids: string[]): Promise<string[]> {
    const unicos = [...new Set(ids)].slice(0, MAX_FAVORITES);

    const existentes = await this.prisma.product.findMany({
      where: { id: { in: unicos } },
      select: { id: true },
    });
    const validos = new Set(existentes.map((produto) => produto.id));
    const lista = unicos.filter((id) => validos.has(id));

    const agora = Date.now();

    await this.prisma.$transaction([
      this.prisma.favorite.deleteMany({ where: { customerId, productId: { notIn: lista } } }),
      // O primeiro da lista é o mais recente: a data decrescente preserva a
      // ordem que a pessoa vê, sem uma coluna de posição só para isso.
      this.prisma.favorite.createMany({
        data: lista.map((productId, indice) => ({
          customerId,
          productId,
          createdAt: new Date(agora - indice),
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.favoritos(customerId);
  }

  /**
   * Cupons listados na área do cliente, com o que ainda vale para esta pessoa.
   *
   * Mostra também os que ela já esgotou — sumir com eles faria a pessoa
   * procurar um cupom que usou e não achar explicação.
   */
  async cupons(customerId: string) {
    const agora = new Date();

    const cupons = await this.prisma.coupon.findMany({
      where: {
        listed: true,
        active: true,
        OR: [{ startsAt: null }, { startsAt: { lte: agora } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: agora } }] }],
      },
      orderBy: { createdAt: 'desc' },
      include: { redemptions: { where: { customerId }, select: { id: true } } },
    });

    return cupons.map((cupom) => {
      const usadosPorVoce = cupom.redemptions.length;
      const esgotadoGeral = cupom.usageLimit !== null && cupom.usedCount >= cupom.usageLimit;
      const esgotadoParaVoce =
        cupom.perCustomerLimit !== null && usadosPorVoce >= cupom.perCustomerLimit;

      return {
        code: cupom.code,
        description: cupom.description,
        type: cupom.type,
        value: cupom.type === 'percent' ? Number(cupom.value) : toCents(cupom.value),
        minSubtotal: toCentsOrNull(cupom.minSubtotal),
        endsAt: cupom.endsAt,
        usadosPorVoce,
        disponivel: !esgotadoGeral && !esgotadoParaVoce,
      };
    });
  }
}
