import {
  applyCoupon,
  buildOrderWhatsAppLink,
  calculateTotals,
  formatOrderCode,
  type CouponResult,
  type CouponRules,
  type SaleUnit,
  type WhatsAppOrderItem,
} from '@aurora/types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { fromCents, toCents, toQuantity } from '../common/decimal';
import { loadEnv } from '../config/env';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StoreService } from '../store/store.service';
import { CartService } from '../cart/cart.service';

/**
 * Pedidos.
 *
 * O pedido desta loja é um orçamento com número. Ele existe para três coisas:
 * dar um código que cliente e atendente falam em voz alta, congelar o que foi
 * pedido e por qual preço, e virar a mensagem que abre a conversa no WhatsApp.
 *
 * Nada aqui cobra, reserva estoque ou promete prazo — a venda acontece na
 * conversa. É por isso que o pedido guarda `totalEstimate` (o que o site
 * calculou) separado de `finalValue` (o que a loja vendeu de fato).
 */

/** A página pública `/p/:code` vive 30 dias. Não é arquivo, é conveniência. */
const PAGINA_PUBLICA_DIAS = 30;

export interface CriarPedido {
  nome: string;
  telefone: string;
  email?: string | null;
  deliveryMethodId: string;
  deliveryNote?: string | null;
  observacao?: string | null;
  ip?: string | null;
  /** Cliente logado, quando houver: o pedido aparece em "Meus pedidos". */
  customerId?: string | null;
}

@Injectable()
export class OrdersService {
  private readonly env = loadEnv();
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly carrinho: CartService,
    private readonly loja: StoreService,
    private readonly mail: MailService,
    private readonly avisos: NotificationsService,
  ) {}

  /**
   * Cria o pedido a partir do carrinho.
   *
   * Tudo que decide valor é recalculado aqui, do banco: preço, disponibilidade
   * e cupom. O que o navegador manda é apenas quem é a pessoa e como quer
   * receber. Confiar no total enviado pelo cliente seria deixar o desconto na
   * mão de quem abre o DevTools.
   */
  async criar(token: string | undefined, entrada: CriarPedido) {
    if (!token) throw new BadRequestException('Seu carrinho está vazio.');

    await this.checarRitmo(entrada.ip);

    const carrinho = await this.carrinho.ler(token);
    const vendaveis = carrinho.items.filter((item) => !item.indisponivel);

    if (vendaveis.length === 0) {
      throw new BadRequestException('Seu carrinho está vazio ou os itens saíram do ar.');
    }

    const entrega = await this.prisma.deliveryMethod.findFirst({
      where: { id: entrada.deliveryMethodId, active: true },
    });

    if (!entrega) throw new BadRequestException('Escolha uma forma de receber.');

    const semDesconto = calculateTotals(
      vendaveis.map((item) => ({ quantity: item.qty, unitPrice: item.unitPrice })),
    );

    // O cupom é revalidado agora: pode ter esgotado ou expirado entre o clique
    // que o aplicou e o clique que finalizou.
    const cupom = carrinho.coupon ? await this.cupomValido(carrinho.coupon.code) : null;
    const resultado = cupom
      ? await this.aplicarCupom(semDesconto.subtotal, cupom, entrada.customerId ?? null)
      : ({ valid: true, discount: 0 } as const);
    const desconto = resultado.valid ? resultado.discount : 0;

    const totais = calculateTotals(
      vendaveis.map((item) => ({ quantity: item.qty, unitPrice: item.unitPrice })),
      desconto,
    );

    const pedido = await this.prisma.$transaction(async (tx) => {
      const code = await this.proximoCodigo(tx);

      const criado = await tx.order.create({
        data: {
          code,
          publicToken: randomBytes(24).toString('base64url'),
          publicUntil: new Date(Date.now() + PAGINA_PUBLICA_DIAS * 24 * 60 * 60 * 1000),
          guestName: entrada.nome,
          guestPhone: entrada.telefone,
          guestEmail: entrada.email ?? null,
          customerId: entrada.customerId ?? null,
          subtotal: fromCents(totais.subtotal),
          discount: fromCents(totais.discount),
          totalEstimate: fromCents(totais.total),
          deliveryMethodId: entrega.id,
          deliveryLabel: entrega.label,
          deliveryNote: entrada.deliveryNote ?? null,
          couponCode: cupom && resultado.valid ? cupom.code : null,
          notesCustomer: entrada.observacao ?? null,
          items: {
            create: vendaveis.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              productSnapshot: {
                name: item.name,
                slug: item.slug,
                unit: item.unit,
                packSize: item.packSize,
                imageUrl: item.imageUrl,
                variantName: item.variantName,
              },
              qty: item.qty,
              unitPrice: fromCents(item.unitPrice),
              lineTotal: fromCents(item.lineTotal),
            })),
          },
          // O IP fica no evento, e não numa coluna do pedido: serve só para
          // medir ritmo de criação e some junto com o pedido, sem virar um
          // cadastro paralelo de quem visitou a loja.
          events: {
            create: {
              type: 'criado',
              payload: { itens: vendaveis.length, ip: entrada.ip ?? null },
            },
          },
        },
        include: PEDIDO_COMPLETO,
      });

      if (cupom && resultado.valid) {
        await tx.coupon.update({
          where: { id: cupom.id },
          data: { usedCount: { increment: 1 } },
        });
        await tx.couponRedemption.create({
          data: { couponId: cupom.id, orderId: criado.id, customerId: entrada.customerId ?? null },
        });
      }

      return criado;
    });

    // Do carrinho para o pedido: o que foi pedido não pode continuar na
    // sacola, ou a pessoa manda o mesmo pedido duas vezes.
    await this.carrinho.esvaziar(token);

    // E-mail não segura a resposta. Se o SMTP estiver fora, o pedido está
    // gravado e a mensagem do WhatsApp continua sendo o caminho principal.
    void this.avisar(pedido.code);

    if (entrada.customerId) {
      void this.avisos.criar(entrada.customerId, {
        type: 'pedido_recebido',
        title: `Pedido ${pedido.code} recebido`,
        body: 'Agora é com a gente: continue a conversa pelo WhatsApp para combinar pagamento e entrega.',
        link: `/conta/pedidos/${pedido.code}`,
      });
    }

    return this.paraResposta(pedido);
  }

  /** Página pública do pedido, aberta pelo link da mensagem. */
  async publico(code: string, token: string) {
    const pedido = await this.prisma.order.findFirst({
      where: { code: code.trim().toUpperCase() },
      include: PEDIDO_COMPLETO,
    });

    // Código inexistente, token errado e link expirado respondem o mesmo 404.
    //
    // O código sozinho não abre nada: sem o token, "CP-2026-0001" e um laço de
    // repetição dariam o nome e o telefone de todo mundo. E como os códigos são
    // sequenciais, responder 403 para "existe mas o token está errado" contaria
    // quantos pedidos a loja já recebeu — um número que não é da conta de quem
    // está do lado de fora.
    if (!pedido || pedido.publicToken !== token || pedido.publicUntil < new Date()) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    return this.paraResposta(pedido);
  }

  /**
   * Registra que a pessoa realmente abriu o WhatsApp.
   *
   * É a métrica que separa "fez o pedido" de "foi conversar": sem ela não dá
   * para saber se o funil quebra antes ou depois do botão.
   */
  async registrarClique(code: string, token: string): Promise<{ ok: true }> {
    const pedido = await this.prisma.order.findFirst({
      where: { code: code.trim().toUpperCase(), publicToken: token },
      select: { id: true, whatsappClickedAt: true },
    });

    if (!pedido) throw new NotFoundException('Pedido não encontrado.');

    // Só o primeiro clique conta — recarregar a página não reescreve a hora.
    if (!pedido.whatsappClickedAt) {
      await this.prisma.order.update({
        where: { id: pedido.id },
        data: {
          whatsappClickedAt: new Date(),
          events: { create: { type: 'whatsapp_aberto' } },
        },
      });
    }

    return { ok: true };
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  /**
   * Próximo código do ano, dentro da transação do pedido.
   *
   * O `UPDATE ... RETURNING` sobre a linha do ano trava aquela linha até o
   * commit: dois pedidos simultâneos entram em fila e recebem números
   * diferentes. Um `MAX(code) + 1` daria o mesmo número para ambos.
   */
  private async proximoCodigo(tx: TransacaoPrisma): Promise<string> {
    const ano = new Date().getFullYear();

    await tx.orderCounter.upsert({
      where: { year: ano },
      create: { year: ano, lastValue: 0 },
      update: {},
    });

    const contador = await tx.orderCounter.update({
      where: { year: ano },
      data: { lastValue: { increment: 1 } },
    });

    return formatOrderCode(ano, contador.lastValue);
  }

  private async cupomValido(code: string) {
    const cupom = await this.prisma.coupon.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
    });

    if (!cupom) return null;

    return {
      id: cupom.id,
      code: cupom.code,
      type: cupom.type,
      value: cupom.type === 'percent' ? Number(cupom.value) : toCents(cupom.value),
      minSubtotal: cupom.minSubtotal ? toCents(cupom.minSubtotal) : null,
      usageLimit: cupom.usageLimit,
      usedCount: cupom.usedCount,
      startsAt: cupom.startsAt,
      endsAt: cupom.endsAt,
      active: cupom.active,
      perCustomerLimit: cupom.perCustomerLimit,
    };
  }

  /**
   * Aplica o cupom e, com cliente logado, confere o limite por pessoa.
   *
   * Convidado não tem como ser contado — o mesmo telefone pode ser de uma
   * família inteira, e o e-mail é opcional. O limite por cliente vale para
   * quem tem conta; para os demais, vale o limite geral de usos.
   */
  private async aplicarCupom(
    subtotal: number,
    cupom: CouponRules & { id: string; perCustomerLimit: number | null },
    customerId: string | null,
  ): Promise<CouponResult> {
    const resultado = applyCoupon(subtotal, cupom);
    if (!resultado.valid || !customerId || cupom.perCustomerLimit === null) return resultado;

    const usados = await this.prisma.couponRedemption.count({
      where: { couponId: cupom.id, customerId },
    });

    if (usados >= cupom.perCustomerLimit) {
      return {
        valid: false,
        reason: 'esgotado',
        message: 'Você já usou este cupom o máximo de vezes.',
      };
    }

    return resultado;
  }

  /**
   * Teto de pedidos por IP.
   *
   * Sem pagamento no site, criar pedido não custa nada para quem quiser encher
   * o kanban de lixo. Isto não substitui o reCAPTCHA previsto no plano — que
   * depende de chaves ainda não fornecidas —, mas barra o script ingênuo sem
   * atrapalhar a família que faz três pedidos do mesmo Wi-Fi.
   */
  private async checarRitmo(ip: string | null | undefined): Promise<void> {
    if (!ip) return;

    const desde = new Date(Date.now() - 60 * 60 * 1000);
    const quantos = await this.prisma.orderEvent.count({
      where: { type: 'criado', createdAt: { gte: desde }, payload: { path: ['ip'], equals: ip } },
    });

    if (quantos >= this.env.ORDER_RATE_LIMIT_PER_HOUR) {
      throw new BadRequestException(
        'Muitos pedidos em pouco tempo. Fale com a gente pelo WhatsApp que a gente resolve.',
      );
    }
  }

  private async paraResposta(pedido: PedidoCompleto) {
    const loja = await this.loja.getStore();
    const status = loja.status;

    const itens: WhatsAppOrderItem[] = pedido.items.map((item) => {
      const snapshot = item.productSnapshot as {
        name: string;
        unit: SaleUnit;
        packSize: number | null;
        variantName: string | null;
        imageUrl: string | null;
      };

      return {
        name: snapshot.name,
        variantName: snapshot.variantName,
        quantity: toQuantity(item.qty),
        unit: snapshot.unit,
        unitPrice: toCents(item.unitPrice),
        lineTotal: toCents(item.lineTotal),
        packSize: snapshot.packSize,
      };
    });

    const orderUrl = `${this.env.SITE_URL}/p/${pedido.code}?t=${pedido.publicToken}`;

    const mensagem = buildOrderWhatsAppLink(loja.info.whatsapp, {
      code: pedido.code,
      items: itens,
      subtotal: toCents(pedido.subtotal),
      discount: toCents(pedido.discount),
      total: toCents(pedido.totalEstimate),
      deliveryLabel: pedido.deliveryLabel,
      deliveryNote: pedido.deliveryNote,
      orderUrl,
      customerName: pedido.guestName,
      // Fora do horário o botão continua funcionando — a mensagem espera na
      // fila do WhatsApp. O aviso evita a frustração de esperar resposta
      // imediata às 23h de um sábado.
      closedNotice: status.isOpen ? null : status.message,
    });

    return {
      code: pedido.code,
      publicToken: pedido.publicToken,
      status: pedido.status,
      createdAt: pedido.createdAt,
      customer: {
        name: pedido.guestName,
        phone: pedido.guestPhone,
        email: pedido.guestEmail,
      },
      delivery: { label: pedido.deliveryLabel, note: pedido.deliveryNote },
      couponCode: pedido.couponCode,
      subtotal: toCents(pedido.subtotal),
      discount: toCents(pedido.discount),
      total: toCents(pedido.totalEstimate),
      items: pedido.items.map((item) => ({
        ...(item.productSnapshot as Record<string, unknown>),
        qty: toQuantity(item.qty),
        unitPrice: toCents(item.unitPrice),
        lineTotal: toCents(item.lineTotal),
      })),
      orderUrl,
      whatsappUrl: mensagem.url,
      /** `true` quando a mensagem virou resumo por causa do limite de URL. */
      whatsappCompact: mensagem.compact,
      storeOpen: status.isOpen,
      storeStatusLabel: status.label,
      storeStatusMessage: status.message,
    };
  }

  /** E-mail de confirmação e aviso para a equipe. Nunca derruba o pedido. */
  private async avisar(code: string): Promise<void> {
    try {
      const pedido = await this.prisma.order.findUnique({
        where: { code },
        include: PEDIDO_COMPLETO,
      });

      if (!pedido) return;

      const dados = await this.paraResposta(pedido);
      const enviados = await this.mail.pedidoCriado(dados);

      // Sem destinatário não houve envio, e a linha do tempo não deve dizer
      // que houve — a atendente usa isso para saber se precisa avisar à mão.
      if (enviados.length > 0) {
        await this.prisma.orderEvent.create({
          data: {
            orderId: pedido.id,
            type: 'email_enviado',
            payload: { para: enviados.join(', ') },
          },
        });
      }
    } catch (erro) {
      this.logger.warn(`Aviso do pedido ${code} não saiu: ${String(erro)}`);
    }
  }
}

const PEDIDO_COMPLETO = {
  items: { orderBy: { id: 'asc' as const } },
} satisfies Prisma.OrderInclude;

type PedidoCompleto = Prisma.OrderGetPayload<{ include: typeof PEDIDO_COMPLETO }>;

/** O cliente de dentro de uma transação, como o próprio Prisma o define. */
type TransacaoPrisma = Prisma.TransactionClient;
