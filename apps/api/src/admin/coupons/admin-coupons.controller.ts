import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { textoOpcional } from '../../common/br-schemas';
import { clientIp, CurrentUser, type AuthenticatedUser } from '../../common/current-user';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminCouponsService } from './admin-coupons.service';

const limite = z.coerce.number().int().min(1).nullable().optional();
const data = z.coerce.date().nullable().optional();

const cupomSchema = z
  .object({
    code: z
      .string()
      .trim()
      .transform((valor) => valor.toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[A-Z0-9_-]{3,40}$/, 'Use de 3 a 40 letras, números, hífen ou sublinhado.'),
      ),
    type: z.enum(['percent', 'fixed']),
    /** Percentual (1–100) ou centavos. */
    value: z.coerce.number().positive('O valor precisa ser maior que zero.'),
    minSubtotal: z.coerce.number().int().min(0).nullable().optional(),
    usageLimit: limite,
    perCustomerLimit: limite,
    startsAt: data,
    endsAt: data,
    active: z.boolean().default(true),
    listed: z.boolean().default(false),
    description: textoOpcional(200),
  })
  .refine((cupom) => cupom.type !== 'percent' || cupom.value <= 100, {
    message: 'Percentual vai até 100.',
    path: ['value'],
  })
  .refine((cupom) => !cupom.startsAt || !cupom.endsAt || cupom.startsAt < cupom.endsAt, {
    message: 'O fim precisa ser depois do início.',
    path: ['endsAt'],
  });

@ApiTags('Admin — Cupons')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(private readonly cupons: AdminCouponsService) {}

  @Get()
  @RequirePermissions('cupons:ver')
  @ApiOkResponse({ description: 'Cupons com quantas vezes cada um foi usado.' })
  listar() {
    return this.cupons.listar();
  }

  @Get(':id')
  @RequirePermissions('cupons:ver')
  @ApiOkResponse({ description: 'Cupom com relatório de uso: desconto dado e valor vendido.' })
  obter(@Param('id') id: string) {
    return this.cupons.obter(id);
  }

  @Post()
  @RequirePermissions('cupons:editar')
  @ApiOkResponse({
    description: 'Cria o cupom. Listado e ativo, avisa os clientes — por e-mail, só quem aceitou.',
  })
  criar(
    @Body(new ZodValidationPipe(cupomSchema)) corpo: z.infer<typeof cupomSchema>,
    @CurrentUser() usuario: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.cupons.criar(corpo, usuario.id, clientIp(request));
  }

  @Put(':id')
  @RequirePermissions('cupons:editar')
  atualizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cupomSchema)) corpo: z.infer<typeof cupomSchema>,
    @CurrentUser() usuario: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.cupons.atualizar(id, corpo, usuario.id, clientIp(request));
  }
}
