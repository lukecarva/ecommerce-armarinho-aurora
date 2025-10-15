import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { clientIp, CurrentUser, type AuthenticatedUser } from '../../common/current-user';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminCustomersService } from './admin-customers.service';

const listaSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
});

const grupoSchema = z.object({
  groupId: z.string().uuid().nullable(),
});

/**
 * Anonimizar exige digitar a palavra. Um clique errado não pode apagar os
 * dados de alguém — e não há como desfazer.
 */
const anonimizarSchema = z.object({
  confirmacao: z.literal('ANONIMIZAR', {
    errorMap: () => ({ message: 'Digite ANONIMIZAR para confirmar.' }),
  }),
});

@ApiTags('Admin — Clientes')
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly clientes: AdminCustomersService) {}

  @Get()
  @RequirePermissions('clientes:ver')
  @ApiOkResponse({ description: 'Clientes com conta, com busca por nome, e-mail ou telefone.' })
  listar(@Query(new ZodValidationPipe(listaSchema)) query: z.infer<typeof listaSchema>) {
    return this.clientes.listar(query);
  }

  @Get(':id')
  @RequirePermissions('clientes:ver')
  detalhe(@Param('id') id: string) {
    return this.clientes.detalhe(id);
  }

  @Patch(':id/group')
  @RequirePermissions('clientes:editar')
  mudarGrupo(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(grupoSchema)) corpo: z.infer<typeof grupoSchema>,
    @CurrentUser() usuario: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.clientes.mudarGrupo(id, corpo.groupId, usuario.id, clientIp(request));
  }

  @Get(':id/export')
  @RequirePermissions('clientes:lgpd')
  @Header('Content-Disposition', 'attachment; filename="dados-do-cliente.json"')
  @ApiOkResponse({ description: 'Todos os dados do titular (LGPD, art. 18). Fica na auditoria.' })
  exportar(
    @Param('id') id: string,
    @CurrentUser() usuario: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.clientes.exportar(id, usuario.id, clientIp(request));
  }

  @Post(':id/anonymize')
  @RequirePermissions('clientes:lgpd')
  @ApiOkResponse({
    description: 'Apaga os dados pessoais e mantém o registro de venda. Irreversível.',
  })
  anonimizar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(anonimizarSchema)) _corpo: z.infer<typeof anonimizarSchema>,
    @CurrentUser() usuario: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.clientes.anonimizar(id, usuario.id, clientIp(request));
  }
}
