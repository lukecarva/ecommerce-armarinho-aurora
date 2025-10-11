import type { NotificationType } from '@aurora/types';
import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Avisos dentro da conta do cliente.
 *
 * Um aviso nunca derruba a ação que o gerou: mudar o status de um pedido não
 * pode falhar porque a notificação não foi gravada. Por isso todo método de
 * escrita aqui engole o próprio erro e só registra no log.
 */

export interface Aviso {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}

/** Tamanho do lote na notificação para todos. */
const LOTE = 500;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async criar(customerId: string, aviso: Aviso): Promise<void> {
    try {
      await this.prisma.notification.create({ data: { customerId, ...aviso } });
    } catch (erro) {
      this.logger.warn(`Aviso para ${customerId} não foi gravado: ${String(erro)}`);
    }
  }

  /**
   * O mesmo aviso para todos os clientes com conta ativa.
   *
   * Uma linha por pessoa — é o que deixa cada uma marcar como lido sem uma
   * tabela de leitura à parte. Anonimizados ficam de fora: não há mais pessoa
   * do outro lado.
   */
  async paraTodos(aviso: Aviso): Promise<number> {
    let total = 0;
    let cursor: string | undefined;

    try {
      for (;;) {
        const clientes = await this.prisma.customer.findMany({
          where: { anonymizedAt: null },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: LOTE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });

        if (clientes.length === 0) break;

        await this.prisma.notification.createMany({
          data: clientes.map((cliente) => ({ customerId: cliente.id, ...aviso })),
        });

        total += clientes.length;
        cursor = clientes[clientes.length - 1]!.id;
      }
    } catch (erro) {
      this.logger.warn(`Aviso geral parou em ${total} clientes: ${String(erro)}`);
    }

    return total;
  }

  async listar(customerId: string, page = 1, perPage = 30) {
    const [items, total, naoLidas] = await Promise.all([
      this.prisma.notification.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.notification.count({ where: { customerId } }),
      this.contarNaoLidas(customerId),
    ]);

    return { items, total, naoLidas, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
  }

  contarNaoLidas(customerId: string): Promise<number> {
    return this.prisma.notification.count({ where: { customerId, readAt: null } });
  }

  /**
   * Marca como lidas. Sem ids, marca todas.
   *
   * O `customerId` vai sempre no filtro: é o que impede alguém de marcar
   * avisos de outra pessoa chutando ids.
   */
  async marcarLidas(customerId: string, ids?: string[]): Promise<number> {
    const resultado = await this.prisma.notification.updateMany({
      where: { customerId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });

    return resultado.count;
  }
}

/** Global: pedidos, painel e conta do cliente geram avisos. */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
