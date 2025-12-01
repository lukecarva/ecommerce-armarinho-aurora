import { TASK_PRIORITIES, TASK_STATUSES } from '@aurora/types';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { textoOpcional } from '../../common/br-schemas';
import { CurrentUser, type AuthenticatedUser } from '../../common/current-user';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminTasksService } from './admin-tasks.service';

const tarefaSchema = z.object({
  title: z.string().trim().min(1, 'Informe o título.').max(200),
  description: textoOpcional(2000),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  assigneeId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  dueDate: z.coerce
    .date()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

const statusSchema = z.object({
  status: z.enum(TASK_STATUSES),
});

@ApiTags('Admin — Tarefas')
@Controller('admin/tasks')
export class AdminTasksController {
  constructor(private readonly tarefas: AdminTasksService) {}

  @Get('kanban')
  @RequirePermissions('tarefas:ver')
  @ApiOkResponse({ description: 'Kanban de tarefas da equipe.' })
  kanban() {
    return this.tarefas.kanban();
  }

  @Get('membros')
  @RequirePermissions('tarefas:ver')
  @ApiOkResponse({ description: 'Membros ativos para o select de responsável.' })
  membros() {
    return this.tarefas.membros();
  }

  @Post()
  @RequirePermissions('tarefas:editar')
  criar(
    @Body(new ZodValidationPipe(tarefaSchema)) corpo: z.infer<typeof tarefaSchema>,
    @CurrentUser() ator: AuthenticatedUser,
  ) {
    return this.tarefas.criar(corpo, ator.id);
  }

  @Patch(':id/status')
  @RequirePermissions('tarefas:editar')
  @ApiOkResponse({ description: 'Move a tarefa para outra coluna do Kanban.' })
  mover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(statusSchema)) corpo: z.infer<typeof statusSchema>,
  ) {
    return this.tarefas.mover(id, corpo.status);
  }

  @Patch(':id')
  @RequirePermissions('tarefas:editar')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(tarefaSchema.partial()))
    corpo: z.infer<ReturnType<typeof tarefaSchema.partial>>,
  ) {
    return this.tarefas.atualizar(id, corpo);
  }

  @Delete(':id')
  @RequirePermissions('tarefas:excluir')
  remover(@Param('id', ParseUUIDPipe) id: string) {
    return this.tarefas.remover(id);
  }
}
