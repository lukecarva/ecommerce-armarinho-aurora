import {
  applyCoupon,
  calculateTotals,
  defaultRulesFor,
  normalizeQuantity,
  resolvePrice,
  type Availability,
  type CouponRejection,
  type SaleUnit,
} from '@aurora/types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { toCents, toCentsOrNull, toQuantity } from '../common/decimal';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Carrinho.
 *
 * Duas decisões moldam tudo aqui:
 *
 * 1. **O carrinho guarda quantidade, não preço.** O valor é lido do catálogo
 *    a cada visita. Se a loja reajustar o tricoline, quem tinha o carrinho
 *    aberto vê o preço novo — que é o preço que a loja vai praticar no
 *    WhatsApp. O congelamento acontece no pedido, que é o documento da
 *    negociação.
 * 2. **Um item que sai do ar não some em silêncio.** Produto arquivado ou sem
 *    foto continua aparecendo, marcado como indisponível, e não entra no
 *    total. Apagar sozinho faria a cliente perder o item sem entender por quê.
 */

/** Trinta dias. Carrinho mais velho que isso é lixo com preço velho. */
const VALIDADE_DIAS = 30;

export interface ItemDoCarrinho {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  variantName: string | null;
  imageUrl: string | null;
  unit: SaleUnit;
  packSize: number | null;
  qty: number;
  unitPrice: number;
  compareAt: number | null;
  lineTotal: number;
  availability: Availability;
  /** Regras do seletor de quantidade, para a tela não inventar o passo. */
  quantidade: { step: number; min: number };
  /** Saiu do ar depois de entrar no carrinho: aparece, mas não soma. */
  indisponivel: boolean;
}

export interface CarrinhoResumo {
  items: ItemDoCarrinho[];
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  coupon: { code: string; discount: number } | null;
  couponError: { reason: CouponRejection; message: string } | null;
}

@Injectable()
export class CartService {
  private readonly env = loadEnv();

  constructor(private readonly prisma: PrismaService) {}

  /** Token novo para quem ainda não tem carrinho. */
  novoToken(): string {
    return randomBytes(32).toString('base64url');
  }

  get validadeMs(): number {
    return VALIDADE_DIAS * 24 * 60 * 60 * 1000;
  }

  /** Lê o carrinho do token, sem criar nada. Carrinho vazio é resposta válida. */
  async ler(token: string | undefined): Promise<CarrinhoResumo> {
    const carrinho = token
      ? await this.prisma.cart.findUnique({ where: { sessionToken: token }, include: ITENS })
      : null;

    if (!carrinho) return VAZIO;
    return this.montar(carrinho);
  }

  async adicionar(
    token: string,
    entrada: { productId: string; variantId?: string | null; qty: number },
  ): Promise<CarrinhoResumo> {
    const produto = await this.produtoVendavel(entrada.productId, entrada.variantId ?? null);
    const regras = this.regrasDe(produto);
    const carrinho = await this.garantir(token);

    const existente = await this.prisma.cartItem.findFirst({
      where: {
        cartId: carrinho.id,
        productId: entrada.productId,
        variantId: entrada.variantId ?? null,
      },
    });

    // Adicionar o mesmo produto de novo soma à quantidade, em vez de criar uma
    // segunda linha igual — é o que a pessoa espera ao voltar na página e
    // clicar outra vez.
    const desejada = existente ? toQuantity(existente.qty) + entrada.qty : entrada.qty;
    const qty = normalizeQuantity(desejada, regras);

    if (existente) {
      await this.prisma.cartItem.update({ where: { id: existente.id }, data: { qty } });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: carrinho.id,
          productId: entrada.productId,
          variantId: entrada.variantId ?? null,
          qty,
        },
      });
    }

    return this.recarregar(carrinho.id);
  }

  async alterarQuantidade(token: string, itemId: string, qty: number): Promise<CarrinhoResumo> {
    const item = await this.itemDoCarrinho(token, itemId);
    const produto = await this.produtoVendavel(item.productId, item.variantId);

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { qty: normalizeQuantity(qty, this.regrasDe(produto)) },
    });

    return this.recarregar(item.cartId);
  }

  async remover(token: string, itemId: string): Promise<CarrinhoResumo> {
    const item = await this.itemDoCarrinho(token, itemId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });

    return this.recarregar(item.cartId);
  }

  async esvaziar(token: string): Promise<CarrinhoResumo> {
    const carrinho = await this.prisma.cart.findUnique({ where: { sessionToken: token } });
    if (!carrinho) return VAZIO;

    await this.prisma.cartItem.deleteMany({ where: { cartId: carrinho.id } });
    await this.prisma.cart.update({ where: { id: carrinho.id }, data: { couponCode: null } });

    return this.recarregar(carrinho.id);
  }

  /**
   * Guarda o cupom no carrinho.
   *
   * Aceita mesmo quando ainda não vale — o subtotal muda a cada item que
   * entra, e um cupom "acima de R$ 100" recusado agora passa a valer daqui a
   * dois cliques. A tela mostra o motivo enquanto não valer; quem decide de
   * verdade é a criação do pedido.
   */
  async aplicarCupom(token: string, code: string): Promise<CarrinhoResumo> {
    const carrinho = await this.garantir(token);
    await this.prisma.cart.update({
      where: { id: carrinho.id },
      data: { couponCode: code.trim().toUpperCase() || null },
    });

    return this.recarregar(carrinho.id);
  }

  async removerCupom(token: string): Promise<CarrinhoResumo> {
    const carrinho = await this.prisma.cart.findUnique({ where: { sessionToken: token } });
    if (!carrinho) return VAZIO;

    await this.prisma.cart.update({ where: { id: carrinho.id }, data: { couponCode: null } });
    return this.recarregar(carrinho.id);
  }

  /**
   * Junta o carrinho deste navegador ao carrinho da conta.
   *
   * Chamado ao entrar na conta e a cada visita logada. Devolve o token que o
   * cookie deve passar a ter, ou `null` se o navegador deve ficar sem
   * carrinho. Os casos:
   *
   * - Só o navegador tem carrinho: ele passa a ser da conta.
   * - Só a conta tem: o navegador passa a apontar para ele — é o carrinho
   *   montado no celular aparecendo no computador.
   * - Os dois têm: os itens do navegador entram no da conta, somando
   *   quantidade quando o produto se repete, e o do navegador é apagado.
   * - O carrinho do navegador é de **outra** conta: é ignorado. Quem entra
   *   num computador compartilhado não herda a sacola de quem usou antes.
   *
   * Com `criar`, a conta sem carrinho nenhum ganha um vazio — usado pelo
   * "pedir de novo", que precisa de onde pôr os itens.
   */
  async adotar(
    tokenAtual: string | undefined,
    customerId: string,
    opcoes: { criar?: boolean } = {},
  ): Promise<string | null> {
    const agora = new Date();
    const expiresAt = new Date(Date.now() + this.validadeMs);

    const doNavegador = tokenAtual
      ? await this.prisma.cart.findUnique({
          where: { sessionToken: tokenAtual },
          include: { items: true },
        })
      : null;

    const alheio = doNavegador?.customerId && doNavegador.customerId !== customerId;
    const convidado = doNavegador && !alheio && doNavegador.expiresAt > agora ? doNavegador : null;

    const daConta = await this.prisma.cart.findFirst({
      where: { customerId, expiresAt: { gt: agora } },
      orderBy: { updatedAt: 'desc' },
      include: { items: true },
    });

    if (convidado && (!daConta || daConta.id === convidado.id)) {
      await this.prisma.cart.update({
        where: { id: convidado.id },
        data: { customerId, expiresAt },
      });
      return convidado.sessionToken;
    }

    if (!convidado && daConta) return daConta.sessionToken;

    if (convidado && daConta) {
      await this.prisma.$transaction(async (tx) => {
        for (const item of convidado.items) {
          const igual = daConta.items.find(
            (existente) =>
              existente.productId === item.productId && existente.variantId === item.variantId,
          );

          if (igual) {
            // Soma de dois múltiplos do passo continua múltiplo do passo: não
            // precisa normalizar de novo.
            await tx.cartItem.update({
              where: { id: igual.id },
              data: { qty: toQuantity(igual.qty) + toQuantity(item.qty) },
            });
            await tx.cartItem.delete({ where: { id: item.id } });
          } else {
            await tx.cartItem.update({ where: { id: item.id }, data: { cartId: daConta.id } });
          }
        }

        await tx.cart.update({
          where: { id: daConta.id },
          data: { expiresAt, couponCode: daConta.couponCode ?? convidado.couponCode },
        });
        await tx.cart.delete({ where: { id: convidado.id } });
      });

      return daConta.sessionToken;
    }

    if (!opcoes.criar) return null;

    const novo = await this.prisma.cart.create({
      data: { sessionToken: this.novoToken(), customerId, expiresAt },
    });

    return novo.sessionToken;
  }

  /** O carrinho do token, criado se ainda não existir. */
  async garantir(token: string) {
    const expiresAt = new Date(Date.now() + this.validadeMs);

    return this.prisma.cart.upsert({
      where: { sessionToken: token },
      create: { sessionToken: token, expiresAt },
      // Cada mexida renova a validade: carrinho em uso não expira debaixo de
      // quem está usando.
      update: { expiresAt },
    });
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  private async recarregar(cartId: string): Promise<CarrinhoResumo> {
    const carrinho = await this.prisma.cart.findUnique({ where: { id: cartId }, include: ITENS });
    return carrinho ? this.montar(carrinho) : VAZIO;
  }

  private async montar(carrinho: CarrinhoComItens): Promise<CarrinhoResumo> {
    const items = carrinho.items.map((item) => this.paraItem(item));
    const vendaveis = items.filter((item) => !item.indisponivel);

    const semDesconto = calculateTotals(
      vendaveis.map((item) => ({ quantity: item.qty, unitPrice: item.unitPrice })),
    );

    const cupom = carrinho.couponCode ? await this.buscarCupom(carrinho.couponCode) : null;
    const resultado = carrinho.couponCode
      ? applyCoupon(semDesconto.subtotal, cupom)
      : ({ valid: true, discount: 0 } as const);

    const desconto = resultado.valid ? resultado.discount : 0;
    const totais = calculateTotals(
      vendaveis.map((item) => ({ quantity: item.qty, unitPrice: item.unitPrice })),
      desconto,
    );

    return {
      items,
      itemCount: totais.itemCount,
      subtotal: totais.subtotal,
      discount: totais.discount,
      total: totais.total,
      coupon:
        carrinho.couponCode && resultado.valid
          ? { code: carrinho.couponCode, discount: desconto }
          : null,
      couponError: resultado.valid
        ? null
        : { reason: resultado.reason, message: resultado.message },
    };
  }

  private paraItem(item: ItemComProduto): ItemDoCarrinho {
    const produto = item.product;
    const variacao = item.variant;

    const preco = resolvePrice(
      {
        price: toCents(produto.price),
        promoPrice: toCentsOrNull(produto.promoPrice),
        promoStartsAt: produto.promoStartsAt,
        promoEndsAt: produto.promoEndsAt,
      },
      { wholesaleEnabled: this.env.WHOLESALE_ENABLED },
    );

    const unitPrice = preco.unitPrice + (variacao ? toCents(variacao.priceDelta) : 0);
    const qty = toQuantity(item.qty);

    const estoque = produto.inventory.find((linha) => linha.variantId === (variacao?.id ?? null));
    const availability = estoque?.availability ?? 'sob_consulta';

    // O mesmo filtro da vitrine: o que não pode ser vendido lá não pode ser
    // vendido aqui. Fora do ar, esgotado, ou sem foto — não entra no total.
    const indisponivel =
      produto.status !== 'ativo' || produto.needsContent || availability === 'esgotado';

    return {
      id: item.id,
      productId: produto.id,
      variantId: variacao?.id ?? null,
      name: produto.name,
      slug: produto.slug,
      variantName: variacao?.name ?? null,
      imageUrl: variacao?.images[0]?.media.url ?? produto.images[0]?.media.url ?? null,
      unit: produto.unit,
      packSize: produto.packSize,
      qty,
      unitPrice,
      compareAt: preco.compareAt,
      lineTotal: Math.round(unitPrice * qty),
      availability,
      quantidade: {
        step: toQuantity(produto.saleStep) || 1,
        min: toQuantity(produto.minQty) || 1,
      },
      indisponivel,
    };
  }

  private async buscarCupom(code: string) {
    const cupom = await this.prisma.coupon.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
    });

    if (!cupom) return null;

    return {
      code: cupom.code,
      type: cupom.type,
      // Percentual é número puro; valor fixo vira centavo, como todo dinheiro
      // que sai do banco.
      value: cupom.type === 'percent' ? Number(cupom.value) : toCents(cupom.value),
      minSubtotal: toCentsOrNull(cupom.minSubtotal),
      usageLimit: cupom.usageLimit,
      usedCount: cupom.usedCount,
      startsAt: cupom.startsAt,
      endsAt: cupom.endsAt,
      active: cupom.active,
    };
  }

  private async itemDoCarrinho(token: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { sessionToken: token } },
    });

    // Buscar pelo token junto com o id é o que impede alguém de alterar o
    // carrinho de outra pessoa chutando ids.
    if (!item) throw new NotFoundException('Item não encontrado neste carrinho.');
    return item;
  }

  private async produtoVendavel(productId: string, variantId: string | null) {
    const produto = await this.prisma.product.findFirst({
      where: { id: productId, status: 'ativo', needsContent: false },
      select: { id: true, unit: true, saleStep: true, minQty: true },
    });

    if (!produto) throw new NotFoundException('Produto indisponível.');

    if (variantId) {
      const variacao = await this.prisma.productVariant.findFirst({
        where: { id: variantId, productId },
        select: { id: true },
      });

      if (!variacao) throw new BadRequestException('Variação não pertence a este produto.');
    }

    return produto;
  }

  private regrasDe(produto: { unit: SaleUnit; saleStep: Prisma.Decimal; minQty: Prisma.Decimal }) {
    const padrao = defaultRulesFor(produto.unit);

    return {
      step: toQuantity(produto.saleStep) || padrao.step,
      min: toQuantity(produto.minQty) || padrao.min,
    };
  }
}

const ITENS = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      product: {
        include: {
          images: {
            orderBy: { position: 'asc' as const },
            take: 1,
            include: { media: { select: { url: true } } },
          },
          inventory: true,
        },
      },
      variant: {
        include: {
          images: {
            orderBy: { position: 'asc' as const },
            take: 1,
            include: { media: { select: { url: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CarrinhoComItens = Prisma.CartGetPayload<{ include: typeof ITENS }>;
type ItemComProduto = CarrinhoComItens['items'][number];

const VAZIO: CarrinhoResumo = {
  items: [],
  itemCount: 0,
  subtotal: 0,
  discount: 0,
  total: 0,
  coupon: null,
  couponError: null,
};
