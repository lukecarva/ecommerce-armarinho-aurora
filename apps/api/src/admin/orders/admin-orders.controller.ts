import { ORDER_STATUSES } from '@aurora/types';
import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type AuthenticatedUser } from '../../common/current-user';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminOrdersService } from './admin-orders.service';

const statusEnum = z.enum(ORDER_STATUSES);

const listaSchema = z.object({
  // Aqui a vírgula é segura: os valores são identificadores do enum.
  status: z
    .string()
    .optional()
    .transform((valor) =>
      valor
        ? valor
            .split(',')
            .map((item) => item.trim())
            .filter((item): item is (typeof ORDER_STATUSES)[number] =>
              (ORDER_STATUSES as readonly string[]).includes(item),
            )
        : undefined,
    ),
  busca: z.string().trim().max(120).optional(),
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  recuperacao: z
    .string()
    .optional()
    .transform((valor) => valor === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
});

const statusSchema = z.object({
  status: statusEnum,
  lostReason: z.string().trim().max(300).optional().nullable(),
  /** Centavos inteiros, como todo dinheiro que atravessa a API. */
  finalValue: z.coerce.number().int().min(0).optional().nullable(),
});

const notaSchema = z.object({
  texto: z.string().trim().min(1).max(2000),
});

const periodoSchema = z.object({
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
});

@ApiTags('Admin — Pedidos')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly pedidos: AdminOrdersService) {}

  @Get()
  @RequirePermissions('pedidos:ver')
  @ApiOkResponse({ description: 'Lista de pedidos com filtro por status, período e busca.' })
  async listar(@Query(new ZodValidationPipe(listaSchema)) query: z.infer<typeof listaSchema>) {
    return this.pedidos.listar(query);
  }

  @Get('kanban')
  @RequirePermissions('pedidos:ver')
  @ApiOkResponse({
    description:
      'O quadro inteiro. O painel repete a chamada em intervalo curto para acompanhar em tempo real.',
  })
  async kanban() {
    return this.pedidos.kanban();
  }

  @Get('recuperacao')
  @RequirePermissions('pedidos:ver')
  @ApiOkResponse({ description: 'Pedidos novos parados há mais de 24 h.' })
  async recuperacao() {
    return this.pedidos.recuperacao();
  }

  @Get('relatorio')
  @RequirePermissions('relatorios:ver')
  @ApiOkResponse({ description: 'Estimado × vendido, por status, no período.' })
  async relatorio(
    @Query(new ZodValidationPipe(periodoSchema)) query: z.infer<typeof periodoSchema>,
  ) {
    // Sem período, os últimos 30 dias — que é o que a loja olha no dia a dia.
    const ate = query.ate ?? new Date();
    const de = query.de ?? new Date(ate.getTime() - 30 * 24 * 60 * 60 * 1000);

    return this.pedidos.relatorio(de, ate);
  }

  @Get('export.csv')
  @RequirePermissions('pedidos:ver')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pedidos.csv"')
  @ApiOkResponse({ description: 'Exportação em CSV, pronta para abrir no Excel.' })
  async exportar(@Query(new ZodValidationPipe(listaSchema)) query: z.infer<typeof listaSchema>) {
    return this.pedidos.exportarCsv(query);
  }

  @Get(':code')
  @RequirePermissions('pedidos:ver')
  @ApiOkResponse({ description: 'Pedido completo, com itens e linha do tempo.' })
  async detalhe(@Param('code') code: string) {
    return this.pedidos.detalhe(code);
  }

  @Patch(':code/status')
  @RequirePermissions('pedidos:editar')
  @ApiOkResponse({
    description:
      'Move o pedido. Perda e cancelamento exigem motivo; o valor fechado só a partir de "pago".',
  })
  async mudarStatus(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(statusSchema)) corpo: z.infer<typeof statusSchema>,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.pedidos.mudarStatus(code, corpo, usuario.id);
  }

  @Post(':code/notes')
  @RequirePermissions('pedidos:editar')
  @ApiOkResponse({ description: 'Anota na linha do tempo. O cliente não vê.' })
  async anotar(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(notaSchema)) corpo: z.infer<typeof notaSchema>,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    return this.pedidos.anotar(code, corpo.texto, usuario.id);
  }
}
