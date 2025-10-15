import { ANONYMIZED_NAME } from '@aurora/types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { toCents, toCentsOrNull, toQuantity } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Clientes no painel, com os dois direitos da LGPD que a loja tem de atender:
 * acesso aos dados (exportar) e eliminação (anonimizar).
 *
 * Anonimizar, e não apagar: o pedido é registro de venda, com obrigação
 * fiscal de guarda. O que some é tudo que diz **quem** comprou — nome,
 * e-mail, telefone, endereços, favoritos, sessões e avisos. O código do
 * pedido, os itens e os valores ficam, sem dono.
 */

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listar(entrada: { busca?: string; page: number; perPage: number }) {
    const where: Prisma.CustomerWhereInput = {};

    if (entrada.busca) {
      const termo = entrada.busca.trim();
      const digitos = termo.replace(/\D/g, '');

      where.OR = [
        { name: { contains: termo, mode: 'insensitive' } },
        { email: { contains: termo, mode: 'insensitive' } },
        ...(digitos.length >= 4 ? [{ phoneE164: { contains: digitos } }] : []),
      ];
    }

    const [clientes, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (entrada.page - 1) * entrada.perPage,
        take: entrada.perPage,
        include: {
          group: { select: { name: true } },
          _count: { select: { orders: true } },
          orders: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      items: clientes.map((cliente) => ({
        id: cliente.id,
        name: cliente.name,
        email: cliente.email,
        phone: cliente.phoneE164,
        grupo: cliente.group?.name ?? null,
        pedidos: cliente._count.orders,
        ultimoPedido: cliente.orders[0]?.createdAt ?? null,
        emailVerified: cliente.emailVerifiedAt !== null,
        anonymized: cliente.anonymizedAt !== null,
        createdAt: cliente.createdAt,
      })),
      page: entrada.page,
      perPage: entrada.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / entrada.perPage)),
    };
  }

  async detalhe(id: string) {
    const cliente = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        group: { select: { id: true, name: true } },
        addresses: { orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            code: true,
            status: true,
            createdAt: true,
            totalEstimate: true,
            finalValue: true,
          },
        },
        _count: { select: { favorites: true, orders: true } },
      },
    });

    if (!cliente) throw new NotFoundException('Cliente não encontrado.');

    const sessoesAtivas = await this.prisma.customerSession.count({
      where: { customerId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    return {
      id: cliente.id,
      name: cliente.name,
      email: cliente.email,
      phone: cliente.phoneE164,
      grupo: cliente.group,
      emailVerified: cliente.emailVerifiedAt !== null,
      acceptsMarketing: cliente.acceptsMarketing,
      consent: cliente.consent,
      lastLoginAt: cliente.lastLoginAt,
      anonymizedAt: cliente.anonymizedAt,
      createdAt: cliente.createdAt,
      addresses: cliente.addresses,
      favoritos: cliente._count.favorites,
      totalPedidos: cliente._count.orders,
      sessoesAtivas,
      pedidos: cliente.orders.map((pedido) => ({
        code: pedido.code,
        status: pedido.status,
        createdAt: pedido.createdAt,
        total: toCents(pedido.totalEstimate),
        finalValue: toCentsOrNull(pedido.finalValue),
      })),
    };
  }

  /**
   * Muda o grupo de preço. Na v1 só existe o varejo na vitrine, mas o grupo
   * já vale para quando o atacado for ligado.
   */
  async mudarGrupo(id: string, groupId: string | null, actorId: string, ip: string | null) {
    const cliente = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, groupId: true, anonymizedAt: true },
    });

    if (!cliente) throw new NotFoundException('Cliente não encontrado.');
    if (cliente.anonymizedAt) throw new BadRequestException('Cliente anonimizado não se altera.');

    if (groupId) {
      const grupo = await this.prisma.customerGroup.findUnique({ where: { id: groupId } });
      if (!grupo) throw new BadRequestException('Grupo inexistente.');
    }

    await this.prisma.customer.update({ where: { id }, data: { groupId } });

    await this.audit.record({
      actorId,
      entity: 'cliente',
      entityId: id,
      action: 'editar',
      before: { groupId: cliente.groupId },
      after: { groupId },
      ip,
    });

    return this.detalhe(id);
  }

  /**
   * Tudo o que a loja guarda sobre a pessoa, em JSON.
   *
   * É a resposta ao pedido de acesso da LGPD (art. 18). Inclui o que a loja
   * sabe de fora da conta também: sessões com IP e navegador, e o histórico
   * de consentimento — não só o que aparece na tela "Meus dados".
   */
  async exportar(id: string, actorId: string, ip: string | null) {
    const cliente = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        group: { select: { name: true } },
        addresses: true,
        favorites: { include: { product: { select: { name: true } } } },
        notifications: { orderBy: { createdAt: 'desc' } },
        sessions: { orderBy: { createdAt: 'desc' } },
        orders: { orderBy: { createdAt: 'desc' }, include: { items: true } },
      },
    });

    if (!cliente) throw new NotFoundException('Cliente não encontrado.');

    await this.audit.record({
      actorId,
      entity: 'cliente',
      entityId: id,
      action: 'exportar',
      ip,
    });

    return {
      geradoEm: new Date().toISOString(),
      titular: {
        nome: cliente.name,
        email: cliente.email,
        telefone: cliente.phoneE164,
        grupo: cliente.group?.name ?? null,
        criadoEm: cliente.createdAt,
        ultimoAcesso: cliente.lastLoginAt,
        emailConfirmadoEm: cliente.emailVerifiedAt,
        aceitaNovidades: cliente.acceptsMarketing,
        anonimizadoEm: cliente.anonymizedAt,
      },
      consentimentos: cliente.consent,
      enderecos: cliente.addresses.map((endereco) => ({
        apelido: endereco.label,
        cep: endereco.cep,
        rua: endereco.street,
        numero: endereco.number,
        complemento: endereco.complement,
        bairro: endereco.district,
        cidade: endereco.city,
        uf: endereco.uf,
        referencia: endereco.reference,
        padrao: endereco.isDefault,
      })),
      pedidos: cliente.orders.map((pedido) => ({
        codigo: pedido.code,
        criadoEm: pedido.createdAt,
        status: pedido.status,
        entrega: pedido.deliveryLabel,
        observacaoEntrega: pedido.deliveryNote,
        observacao: pedido.notesCustomer,
        cupom: pedido.couponCode,
        subtotal: reais(pedido.subtotal),
        desconto: reais(pedido.discount),
        totalEstimado: reais(pedido.totalEstimate),
        valorFechado: pedido.finalValue ? reais(pedido.finalValue) : null,
        itens: pedido.items.map((item) => {
          const snapshot = item.productSnapshot as {
            name: string;
            unit: string;
            variantName?: string;
          };
          return {
            produto: snapshot.name,
            variacao: snapshot.variantName ?? null,
            quantidade: toQuantity(item.qty),
            unidade: snapshot.unit,
            precoUnitario: reais(item.unitPrice),
            total: reais(item.lineTotal),
          };
        }),
      })),
      favoritos: cliente.favorites.map((favorito) => ({
        produto: favorito.product.name,
        desde: favorito.createdAt,
      })),
      avisos: cliente.notifications.map((aviso) => ({
        titulo: aviso.title,
        texto: aviso.body,
        em: aviso.createdAt,
        lidoEm: aviso.readAt,
      })),
      sessoes: cliente.sessions.map((sessao) => ({
        inicio: sessao.createdAt,
        ultimoUso: sessao.lastUsedAt,
        ip: sessao.ip,
        navegador: sessao.userAgent,
        encerradaEm: sessao.revokedAt,
      })),
    };
  }

  /**
   * Apaga os dados pessoais e mantém o registro de venda.
   *
   * Irreversível, e por isso auditado com quem fez e de onde. Os pedidos
   * alcançados são os ligados à conta e os feitos como convidado com o mesmo
   * e-mail — o e-mail é da pessoa. Pedidos de convidado que só batem pelo
   * telefone ficam de fora: telefone é compartilhado em família com
   * frequência, e anonimizar a compra de outra pessoa também seria errado.
   */
  async anonimizar(id: string, actorId: string, ip: string | null) {
    const cliente = await this.prisma.customer.findUnique({ where: { id } });

    if (!cliente) throw new NotFoundException('Cliente não encontrado.');
    if (cliente.anonymizedAt) throw new BadRequestException('Este cliente já foi anonimizado.');

    const pedidos = await this.prisma.order.findMany({
      where: {
        OR: [
          { customerId: id },
          ...(cliente.email
            ? [{ guestEmail: { equals: cliente.email, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      select: { id: true },
    });
    const idsDosPedidos = pedidos.map((pedido) => pedido.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.customerSession.deleteMany({ where: { customerId: id } });
      await tx.customerToken.deleteMany({ where: { customerId: id } });
      await tx.address.deleteMany({ where: { customerId: id } });
      await tx.favorite.deleteMany({ where: { customerId: id } });
      await tx.notification.deleteMany({ where: { customerId: id } });
      await tx.cart.deleteMany({ where: { customerId: id } });

      if (idsDosPedidos.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: idsDosPedidos } },
          data: {
            guestName: ANONYMIZED_NAME,
            guestPhone: '',
            guestEmail: null,
            deliveryNote: null,
            notesCustomer: null,
          },
        });

        // O IP de quem fez o pedido fica no evento de criação. Sai também.
        await tx.$executeRaw`
          UPDATE order_events
             SET payload = payload - 'ip'
           WHERE order_id = ANY(${idsDosPedidos}::text[])
             AND payload->>'ip' IS NOT NULL
        `;
      }

      await tx.customer.update({
        where: { id },
        data: {
          name: ANONYMIZED_NAME,
          email: null,
          phoneE164: '',
          passwordHash: null,
          emailVerifiedAt: null,
          acceptsMarketing: false,
          // Fica só o registro de que houve eliminação, e quando.
          consent: { anonimizadoEm: new Date().toISOString() },
          anonymizedAt: new Date(),
        },
      });
    });

    await this.audit.record({
      actorId,
      entity: 'cliente',
      entityId: id,
      action: 'anonimizar',
      after: { pedidosAnonimizados: idsDosPedidos.length },
      ip,
    });

    return { ok: true, pedidosAnonimizados: idsDosPedidos.length };
  }
}

function reais(valor: Prisma.Decimal): string {
  return Number(valor).toFixed(2);
}
