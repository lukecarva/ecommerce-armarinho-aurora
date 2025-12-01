import { TASK_KANBAN_COLUMNS, type TaskPriority, type TaskStatus } from '@aurora/types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface DadosDaTarefa {
  title: string;
  description: string | null;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: Date | null;
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { alta: 0, normal: 1, baixa: 2 };

@Injectable()
export class AdminTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async kanban() {
    const tarefas = await this.prisma.task.findMany({
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: { assignee: { select: { id: true, name: true } } },
    });

    const agora = new Date();

    const colunas = TASK_KANBAN_COLUMNS.map(({ key, label }) => {
      const items = tarefas
        .filter((t) => t.status === key)
        .sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority])
        .map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: t.status,
          assigneeId: t.assigneeId,
          assigneeName: t.assignee?.name ?? null,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
          atrasada: t.dueDate !== null && t.dueDate < agora && t.status !== 'concluido',
          createdAt: t.createdAt.toISOString(),
        }));
      return { key, label, items };
    });

    return { colunas, atualizadoEm: agora.toISOString() };
  }

  async criar(dados: DadosDaTarefa, createdById: string) {
    await this.prisma.task.create({
      data: { ...dados, createdById },
    });
    return this.kanban();
  }

  async mover(id: string, status: TaskStatus) {
    const tarefa = await this.prisma.task.findUnique({ where: { id } });
    if (!tarefa) throw new NotFoundException('Tarefa não encontrada.');
    await this.prisma.task.update({ where: { id }, data: { status } });
    return this.kanban();
  }

  async atualizar(id: string, dados: Partial<DadosDaTarefa>) {
    const tarefa = await this.prisma.task.findUnique({ where: { id } });
    if (!tarefa) throw new NotFoundException('Tarefa não encontrada.');
    await this.prisma.task.update({ where: { id }, data: dados });
    return this.kanban();
  }

  async remover(id: string) {
    const tarefa = await this.prisma.task.findUnique({ where: { id } });
    if (!tarefa) throw new NotFoundException('Tarefa não encontrada.');
    await this.prisma.task.delete({ where: { id } });
    return this.kanban();
  }

  membros() {
    return this.prisma.adminUser.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
