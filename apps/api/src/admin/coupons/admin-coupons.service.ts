import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { fromCents, fromCentsOrNull, toCents, toCentsOrNull } from '../../common/decimal';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Cupons no painel.
 *
 * O valor atravessa a API em centavos, como todo dinheiro — menos o
 * percentual, que é um número de 1 a 100. A conversão para o `Decimal` do
 * banco acontece aqui e só aqui.
 */

export interface DadosDoCupom {
  code: string;
  type: 'percent' | 'fixed';
  /** Percentual (1–100) ou centavos, conforme o `type`. */
  value: number;
  minSubtotal?: number | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  active: boolean;
  listed: boolean;
  description: string | null;
}

@Injectable()
export class AdminCouponsService {
  private readonly logger = new Logger(AdminCouponsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly avisos: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async listar() {
    const [cupons, usos] = await Promise.all([
      this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.$queryRaw<Array<{ coupon_id: string; usos: number; desconto: string }>>`
        SELECT cr.coupon_id, COUNT(*)::int AS usos, COALESCE(SUM(o.discount), 0)::text AS desconto
          FROM coupon_redemptions cr
          JOIN orders o ON o.id = cr.order_id
         GROUP BY cr.coupon_id
      `,
    ]);

    const porCupom = new Map(usos.map((linha) => [linha.coupon_id, linha]));

    return cupons.map((cupom) => ({
      ...this.paraTela(cupom),
      usos: porCupom.get(cupom.id)?.usos ?? 0,
      descontoConcedido: Math.round(Number(porCupom.get(cupom.id)?.desconto ?? 0) * 100),
    }));
  }

  /**
   * O cupom e o relatório de uso.
   *
   * Três números, nessa ordem de importância: quantas vezes foi usado, quanto
   * de desconto a loja deu, e quanto vendeu **de fato** nos pedidos que o
   * usaram — o valor fechado pela atendente, não a estimativa do site.
   */
  async obter(id: string) {
    const cupom = await this.prisma.coupon.findUnique({ where: { id } });
    if (!cupom) throw new NotFoundException('Cupom não encontrado.');

    const usos = await this.prisma.couponRedemption.findMany({
      where: { couponId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            code: true,
            createdAt: true,
            guestName: true,
            status: true,
            discount: true,
            totalEstimate: true,
            finalValue: true,
          },
        },
      },
    });

    const pedidos = usos.map((uso) => ({
      code: uso.order.code,
      createdAt: uso.order.createdAt,
      cliente: uso.order.guestName,
      status: uso.order.status,
      desconto: toCents(uso.order.discount),
      total: toCents(uso.order.totalEstimate),
      finalValue: toCentsOrNull(uso.order.finalValue),
    }));

    return {
      ...this.paraTela(cupom),
      relatorio: {
        usos: pedidos.length,
        descontoConcedido: pedidos.reduce((soma, pedido) => soma + pedido.desconto, 0),
        vendido: pedidos.reduce((soma, pedido) => soma + (pedido.finalValue ?? 0), 0),
        pedidosFechados: pedidos.filter((pedido) => pedido.finalValue !== null).length,
        pedidos,
      },
    };
  }

  async criar(dados: DadosDoCupom, actorId: string, ip: string | null) {
    await this.exigirCodigoLivre(dados.code);

    const cupom = await this.prisma.coupon.create({ data: this.paraBanco(dados) });

    await this.audit.record({
      actorId,
      entity: 'cupom',
      entityId: cupom.id,
      action: 'criar',
      after: { code: cupom.code, listed: cupom.listed, active: cupom.active },
      ip,
    });

    if (cupom.listed && cupom.active) void this.anunciar(cupom);

    return this.obter(cupom.id);
  }

  async atualizar(id: string, dados: DadosDoCupom, actorId: string, ip: string | null) {
    const antes = await this.prisma.coupon.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('Cupom não encontrado.');

    if (dados.code.toUpperCase() !== antes.code.toUpperCase()) {
      await this.exigirCodigoLivre(dados.code);
    }

    const depois = await this.prisma.coupon.update({ where: { id }, data: this.paraBanco(dados) });

    await this.audit.record({
      actorId,
      entity: 'cupom',
      entityId: id,
      action: 'editar',
      before: { code: antes.code, listed: antes.listed, active: antes.active },
      after: { code: depois.code, listed: depois.listed, active: depois.active },
      ip,
    });

    // Anúncio só na passagem para "no ar e listado". Editar a descrição de um
    // cupom que já estava no ar não pode disparar outro aviso para todo mundo.
    const estavaNoAr = antes.listed && antes.active;
    if (!estavaNoAr && depois.listed && depois.active) void this.anunciar(depois);

    return this.obter(id);
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  /**
   * Avisa todo mundo do cupom novo.
   *
   * Dentro da conta, para todos. Por e-mail, **só** para quem aceitou receber
   * novidades: e-mail de promoção sem aceite é o que a LGPD proíbe. Roda
   * depois da resposta — a atendente não espera o disparo terminar.
   */
  private async anunciar(cupom: { code: string; description: string | null }): Promise<void> {
    try {
      const avisados = await this.avisos.paraTodos({
        type: 'cupom_novo',
        title: `Cupom novo: ${cupom.code}`,
        body: cupom.description ?? 'Tem cupom novo esperando por você. Use no carrinho.',
        link: '/conta/cupons',
      });

      const inscritos = await this.prisma.customer.findMany({
        where: { acceptsMarketing: true, anonymizedAt: null, email: { not: null } },
        select: { email: true, name: true },
      });

      for (const inscrito of inscritos) {
        await this.mail
          .cupomNovo({ email: inscrito.email!, nome: inscrito.name }, cupom)
          .catch((erro: unknown) =>
            this.logger.warn(`Cupom não chegou a um inscrito: ${String(erro)}`),
          );
      }

      this.logger.log(
        `Cupom ${cupom.code} anunciado: ${avisados} aviso(s) na conta, ${inscritos.length} e-mail(s).`,
      );
    } catch (erro) {
      this.logger.warn(`Anúncio do cupom ${cupom.code} falhou: ${String(erro)}`);
    }
  }

  /** O código é único sem distinguir caixa — a cliente digita como quiser. */
  private async exigirCodigoLivre(code: string): Promise<void> {
    const existente = await this.prisma.coupon.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existente) throw new ConflictException('Já existe um cupom com este código.');
  }

  private paraBanco(dados: DadosDoCupom) {
    return {
      code: dados.code.toUpperCase(),
      type: dados.type,
      value:
        dados.type === 'percent'
          ? new Prisma.Decimal(dados.value)
          : fromCents(Math.round(dados.value)),
      minSubtotal: fromCentsOrNull(dados.minSubtotal ?? null),
      usageLimit: dados.usageLimit ?? null,
      perCustomerLimit: dados.perCustomerLimit ?? null,
      startsAt: dados.startsAt ?? null,
      endsAt: dados.endsAt ?? null,
      active: dados.active,
      listed: dados.listed,
      description: dados.description,
    };
  }

  private paraTela(cupom: Prisma.CouponGetPayload<object>) {
    return {
      id: cupom.id,
      code: cupom.code,
      type: cupom.type,
      value: cupom.type === 'percent' ? Number(cupom.value) : toCents(cupom.value),
      minSubtotal: toCentsOrNull(cupom.minSubtotal),
      usageLimit: cupom.usageLimit,
      usedCount: cupom.usedCount,
      perCustomerLimit: cupom.perCustomerLimit,
      startsAt: cupom.startsAt,
      endsAt: cupom.endsAt,
      active: cupom.active,
      listed: cupom.listed,
      description: cupom.description,
      createdAt: cupom.createdAt,
    };
  }
}
