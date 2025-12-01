/**
 * Tarefas internas da equipe da loja.
 *
 * Não são pedidos nem inscrições: são atividades do dia a dia que a equipe
 * precisa acompanhar — reposição, ligações, tarefas de loja.
 */

export const TASK_STATUSES = ['a_fazer', 'em_andamento', 'aguardando', 'concluido'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluído',
};

export const TASK_PRIORITIES = ['alta', 'normal', 'baixa'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
};

export const TASK_KANBAN_COLUMNS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'a_fazer', label: 'A fazer' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'aguardando', label: 'Aguardando' },
  { key: 'concluido', label: 'Concluído' },
];
