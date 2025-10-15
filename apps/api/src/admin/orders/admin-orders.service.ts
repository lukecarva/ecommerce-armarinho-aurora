import {
  acceptsFinalValue,
  KANBAN_COLUMNS,
  isClosedStatus,
  requiresLostReason,
  type OrderStatus,
  ORDER_STATUS_LABELS,
} from '@aurora/types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { fromCentsOrNull, toCents, toCentsOrNull, toQuantity } from '../../common/decimal';
import { loadEnv } from '../../config/env';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Pedidos no painel.
 *
 * O que a atendente precisa é simples de dizer e fácil de errar: ver o que
 * chegou, saber o que está parado, e nunca perder o registro de por que uma
 * venda não aconteceu. Por isso toda mudança vira evento na linha do tempo, e
 * "perdido" sem motivo é recusado.
 */

export interface ListarPedidos {
  status?: OrderStatus[];
  busca?: string;
  de?: Date;
  ate?: Date;
  /** Só os que estão parados há mais de um dia sem ninguém atender. */
  recuperacao?: boolean;
  page: number;
  perPage: number;
}

/** Horas sem atendimento até o pedido virar caso de recuperação. */
const RECUPERACAO_HORAS = 24;

@Injectable()
export class AdminOrdersService {
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly avisos: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async listar(entrada: ListarPedidos) {
    const where = this.montarWhere(entrada);

    const [linhas, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (entrada.page - 1) * entrada.perPage,
        take: entrada.perPage,
        include: { items: { select: { id: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: linhas.map((pedido) => this.paraCard(pedido)),
      page: entrada.page,
      perPage: entrada.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / entrada.perPage)),
    };
  }

  /**
   * O quadro inteiro em uma consulta.
   *
   * Traz os pedidos abertos e os encerrados recentes: um kanban que mostra
   * todo o histórico vira scroll infinito de cards mortos, e a coluna
   * "Concluído" de dois anos atrás não ajuda ninguém a trabalhar hoje.
   */
  async kanban(dias = 30) {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    const pedidos = await this.prisma.order.findMany({
      where: {
        OR: [
          { status: { notIn: [...FECHADOS] } },
          { status: { in: [...FECHADOS] }, createdAt: { gte: desde } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { items: { select: { id: true } } },
      take: 400,
    });

    const cards = pedidos.map((pedido) => this.paraCard(pedido));

    return {
      colunas: KANBAN_COLUMNS.map((coluna) => ({
        key: coluna.key,
        label: coluna.label,
        statuses: coluna.statuses,
        items: cards.filter((card) =>
          (coluna.statuses as readonly OrderStatus[]).includes(card.status),
        ),
      })),
      /** Muda a cada alteração — é assim que o painel sabe que algo chegou. */
      atualizadoEm: new Date().toISOString(),
    };
  }

  async detalhe(code: string) {
    const pedido = await this.prisma.order.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: {
        items: true,
        events: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, name: true } } },
        },
        deliveryMethod: { select: { label: true, type: true } },
      },
    });

    if (!pedido) throw new NotFoundException('Pedido não encontrado.');

    return {
      ...this.paraCard(pedido),
      email: pedido.guestEmail,
      deliveryNote: pedido.deliveryNote,
      couponCode: pedido.couponCode,
      notesCustomer: pedido.notesCustomer,
      notesInternal: pedido.notesInternal,
      lostReason: pedido.lostReason,
      whatsappClickedAt: pedido.whatsappClickedAt,
      closedAt: pedido.closedAt,
      publicToken: pedido.publicToken,
      items: pedido.items.map((item) => ({
        ...(item.productSnapshot as Record<string, unknown>),
        qty: toQuantity(item.qty),
        unitPrice: toCents(item.unitPrice),
        lineTotal: toCents(item.lineTotal),
      })),
      timeline: pedido.events.map((evento) => ({
        id: evento.id,
        type: evento.type,
        payload: evento.payload,
        actor: evento.actor?.name ?? null,
        createdAt: evento.createdAt,
      })),
    };
  }

  /**
   * Move o card e registra por quê.
   *
   * As duas travas aqui existem para o relatório fazer sentido depois:
   * perda exige motivo, e o valor fechado só entra quando já houve venda.
   */
  async mudarStatus(
    code: string,
    entrada: { status: OrderStatus; lostReason?: string | null; finalValue?: number | null },
    actorId: string,
  ) {
    const pedido = await this.prisma.order.findUnique({
      where: { code: code.trim().toUpperCase() },
      select: { id: true, status: true },
    });

    if (!pedido) throw new NotFoundException('Pedido não encontrado.');

    if (requiresLostReason(entrada.status) && !entrada.lostReason?.trim()) {
      throw new BadRequestException(
        'Diga o motivo. Sem ele, o relatório não explica por que a venda não aconteceu.',
      );
    }

    if (entrada.finalValue != null && !acceptsFinalValue(entrada.status)) {
      throw new BadRequestException('O valor fechado só vale a partir de "pago".');
    }

    const eventos: Prisma.OrderEventCreateWithoutOrderInput[] = [
      {
        type: 'status_alterado',
        payload: { de: pedido.status, para: entrada.status, motivo: entrada.lostReason ?? null },
        actor: { connect: { id: actorId } },
      },
    ];

    if (entrada.finalValue != null) {
      eventos.push({
        type: 'valor_fechado',
        payload: { valor: entrada.finalValue },
        actor: { connect: { id: actorId } },
      });
    }

    const atualizado = await this.prisma.order.update({
      where: { id: pedido.id },
      data: {
        status: entrada.status,
        lostReason: requiresLostReason(entrada.status) ? (entrada.lostReason ?? null) : null,
        ...(entrada.finalValue != null ? { finalValue: fromCentsOrNull(entrada.finalValue) } : {}),
        // `closedAt` marca quando a negociação terminou — é o que mede o tempo
        // de atendimento no relatório. Reabrir um pedido limpa a marca.
        closedAt: isClosedStatus(entrada.status) ? new Date() : null,
        events: { create: eventos },
      },
      include: { items: { select: { id: true } } },
    });

    if (atualizado.customerId && entrada.status !== pedido.status) {
      void this.avisarCliente(atualizado.customerId, atualizado.code, entrada.status);
    }

    return this.paraCard(atualizado);
  }

  /**
   * Conta ao cliente com conta que o pedido andou — na área dele e por
   * e-mail, que é transacional e dispensa aceite de marketing.
   *
   * "Perdido" e a volta para "novo" não geram aviso: são classificações do
   * atendimento, não notícias para quem comprou.
   */
  private async avisarCliente(customerId: string, code: string, status: OrderStatus) {
    const mensagem = MENSAGEM_AO_CLIENTE[status];
    if (!mensagem) return;

    const link = `/conta/pedidos/${code}`;

    await this.avisos.criar(customerId, {
      type: 'status_alterado',
      title: `Pedido ${code}: ${ORDER_STATUS_LABELS[status]}`,
      body: mensagem,
      link,
    });

    const cliente = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, name: true, anonymizedAt: true },
    });

    if (cliente?.email && !cliente.anonymizedAt) {
      await this.mail
        .pedidoAtualizado(
          { email: cliente.email, nome: cliente.name },
          { code, status: ORDER_STATUS_LABELS[status], link: `${this.env.SITE_URL}${link}` },
        )
        .catch(() => undefined);
    }
  }

  /** Nota interna: some da vista do cliente, fica na linha do tempo. */
  async anotar(code: string, texto: string, actorId: string) {
    const pedido = await this.prisma.order.findUnique({
      where: { code: code.trim().toUpperCase() },
      select: { id: true },
    });

    if (!pedido) throw new NotFoundException('Pedido não encontrado.');

    await this.prisma.order.update({
      where: { id: pedido.id },
      data: {
        notesInternal: texto,
        events: {
          create: { type: 'nota_interna', payload: { texto }, actor: { connect: { id: actorId } } },
        },
      },
    });

    return this.detalhe(code);
  }

  /**
   * Fila de recuperação: pedidos novos parados há mais de um dia.
   *
   * É a lista que impede uma venda de morrer por esquecimento — o cliente
   * mandou o pedido, ninguém respondeu, e sem esta tela ninguém descobre.
   */
  async recuperacao() {
    const limite = new Date(Date.now() - RECUPERACAO_HORAS * 60 * 60 * 1000);

    const pedidos = await this.prisma.order.findMany({
      where: { status: 'novo', createdAt: { lte: limite } },
      orderBy: { createdAt: 'asc' },
      include: { items: { select: { id: true } } },
      take: 100,
    });

    return { horas: RECUPERACAO_HORAS, items: pedidos.map((pedido) => this.paraCard(pedido)) };
  }

  /**
   * Relatório de vendas.
   *
   * Dois números que nunca devem ser confundidos: o que o site estimou e o que
   * a loja realmente vendeu. `finalValue` é a verdade — a estimativa não
   * sobrevive à negociação no WhatsApp.
   */
  async relatorio(de: Date, ate: Date) {
    const [porStatus, fechados, cliques, total] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: de, lte: ate } },
        _count: { _all: true },
        _sum: { totalEstimate: true },
      }),
      this.prisma.order.aggregate({
        where: { createdAt: { gte: de, lte: ate }, finalValue: { not: null } },
        _sum: { finalValue: true },
        _count: { _all: true },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: de, lte: ate }, whatsappClickedAt: { not: null } },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: de, lte: ate } } }),
    ]);

    return {
      periodo: { de, ate },
      total,
      porStatus: porStatus.map((linha) => ({
        status: linha.status,
        quantidade: linha._count._all,
        estimado: toCents(linha._sum.totalEstimate),
      })),
      vendido: toCents(fechados._sum.finalValue),
      pedidosFechados: fechados._count._all,
      /** Quantos realmente abriram o WhatsApp — mede o funil, não a vontade. */
      cliquesWhatsApp: cliques,
    };
  }

  /** Exportação para quem prefere planilha à tela. */
  async exportarCsv(entrada: Omit<ListarPedidos, 'page' | 'perPage'>): Promise<string> {
    const pedidos = await this.prisma.order.findMany({
      where: this.montarWhere({ ...entrada, page: 1, perPage: 1 }),
      orderBy: { createdAt: 'desc' },
      include: { items: { select: { id: true } } },
      take: 5000,
    });

    const cabecalho = [
      'codigo',
      'criado_em',
      'status',
      'cliente',
      'telefone',
      'email',
      'entrega',
      'observacao_entrega',
      'itens',
      'subtotal',
      'desconto',
      'total_estimado',
      'valor_fechado',
      'motivo_perda',
      'abriu_whatsapp_em',
    ];

    const linhas = pedidos.map((pedido) =>
      [
        pedido.code,
        pedido.createdAt.toISOString(),
        pedido.status,
        pedido.guestName,
        pedido.guestPhone,
        pedido.guestEmail ?? '',
        pedido.deliveryLabel,
        pedido.deliveryNote ?? '',
        String(pedido.items.length),
        reais(pedido.subtotal),
        reais(pedido.discount),
        reais(pedido.totalEstimate),
        pedido.finalValue ? reais(pedido.finalValue) : '',
        pedido.lostReason ?? '',
        pedido.whatsappClickedAt?.toISOString() ?? '',
      ].map(celulaCsv),
    );

    // Ponto e vírgula e BOM: é o que o Excel em português abre sem pedir nada.
    return (
      String.fromCharCode(0xfeff) +
      [cabecalho.join(';'), ...linhas.map((linha) => linha.join(';'))].join('\r\n')
    );
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  private montarWhere(entrada: ListarPedidos): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};

    if (entrada.status?.length) where.status = { in: entrada.status };

    if (entrada.de || entrada.ate) {
      where.createdAt = {
        ...(entrada.de ? { gte: entrada.de } : {}),
        ...(entrada.ate ? { lte: entrada.ate } : {}),
      };
    }

    if (entrada.recuperacao) {
      where.status = 'novo';
      where.createdAt = { lte: new Date(Date.now() - RECUPERACAO_HORAS * 60 * 60 * 1000) };
    }

    if (entrada.busca) {
      const termo = entrada.busca.trim();
      // A atendente busca pelo que tem na mão: o código que a cliente mandou,
      // o nome, ou o telefone que apareceu no WhatsApp.
      where.OR = [
        { code: { contains: termo, mode: 'insensitive' } },
        { guestName: { contains: termo, mode: 'insensitive' } },
        { guestPhone: { contains: termo.replace(/\D/g, '') || termo } },
      ];
    }

    return where;
  }

  private paraCard(pedido: PedidoComItens) {
    return {
      code: pedido.code,
      status: pedido.status,
      createdAt: pedido.createdAt,
      name: pedido.guestName,
      phone: pedido.guestPhone,
      deliveryLabel: pedido.deliveryLabel,
      itemCount: pedido.items.length,
      subtotal: toCents(pedido.subtotal),
      discount: toCents(pedido.discount),
      total: toCents(pedido.totalEstimate),
      finalValue: toCentsOrNull(pedido.finalValue),
      whatsappClickedAt: pedido.whatsappClickedAt,
      /** Parado há mais de um dia sem ninguém atender. */
      atrasado:
        pedido.status === 'novo' &&
        Date.now() - pedido.createdAt.getTime() >= RECUPERACAO_HORAS * 60 * 60 * 1000,
    };
  }
}

const FECHADOS = ['entregue', 'retirado', 'cancelado', 'perdido'] as const;

/** O que o cliente lê quando o pedido muda. Sem texto, não há aviso. */
const MENSAGEM_AO_CLIENTE: Partial<Record<OrderStatus, string>> = {
  em_atendimento: 'Estamos cuidando do seu pedido.',
  aguardando_pagamento: 'Aguardando a confirmação do pagamento.',
  pago: 'Pagamento confirmado. Obrigada!',
  separado: 'Seu pedido foi separado e está pronto.',
  entregue: 'Pedido entregue. Bom trabalho com o material!',
  retirado: 'Pedido retirado na loja. Obrigada pela visita!',
  cancelado: 'Seu pedido foi cancelado. Se tiver dúvida, fale com a gente pelo WhatsApp.',
};

type PedidoComItens = Prisma.OrderGetPayload<{ include: { items: { select: { id: true } } } }>;

function reais(valor: Prisma.Decimal): string {
  // Vírgula decimal: é como o Excel em português lê número.
  return Number(valor).toFixed(2).replace('.', ',');
}

/**
 * Escapa a célula e neutraliza fórmula.
 *
 * Um nome de cliente começando com `=` viraria fórmula ao abrir a planilha —
 * a mesma injeção já tratada na exportação de produtos.
 */
function celulaCsv(valor: string): string {
  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return `"${seguro.replace(/"/g, '""')}"`;
}
