import {
  TASK_KANBAN_COLUMNS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from '@aurora/types';
import { Button, cn } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeader } from '../components/layout';
import { EmptyState, Field, Input, Modal, Select, Spinner, Textarea } from '../components/ui';
import { api, type TarefaCard } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';

const INTERVALO_MS = 30_000;
const MAX_CARDS_COLAPSADO = 5;

export function TarefasPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const quadro = useQuery({
    queryKey: ['tarefas', 'kanban'],
    queryFn: api.tarefas.kanban,
    refetchInterval: INTERVALO_MS,
    refetchOnWindowFocus: true,
  });

  const membros = useQuery({
    queryKey: ['tarefas', 'membros'],
    queryFn: api.tarefas.membros,
    staleTime: 5 * 60 * 1000,
  });

  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [colunasExpandidas, setColunasExpandidas] = useState<Set<string>>(new Set());
  const [modalAberto, setModalAberto] = useState<TarefaCard | 'nova' | null>(null);

  function toggleColuna(key: string) {
    setColunasExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollDrag = useRef({ ativo: false, startX: 0, scrollLeft: 0 });
  const [scrollDragAtivo, setScrollDragAtivo] = useState(false);

  function iniciarScrollDrag(e: React.MouseEvent<HTMLDivElement>) {
    if (arrastando) return;
    const el = scrollRef.current;
    if (!el) return;
    scrollDrag.current = { ativo: true, startX: e.pageX, scrollLeft: el.scrollLeft };
    setScrollDragAtivo(true);
  }
  function moverScrollDrag(e: React.MouseEvent<HTMLDivElement>) {
    if (!scrollDrag.current.ativo) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = scrollDrag.current.scrollLeft - (e.pageX - scrollDrag.current.startX);
  }
  function encerrarScrollDrag() {
    scrollDrag.current.ativo = false;
    setScrollDragAtivo(false);
  }

  const mover = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api.tarefas.mover(id, status),
    onSuccess: (data) => {
      void queryClient.setQueryData(['tarefas', 'kanban'], data);
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ['tarefas', 'kanban'] });

  function handleDrop(colunaKey: string) {
    setColunaAlvo(null);
    if (!arrastando) return;
    mover.mutate({ id: arrastando, status: colunaKey as TaskStatus });
    setArrastando(null);
  }

  return (
    <>
      <PageHeader
        title="Tarefas"
        description="Kanban da equipe. Arraste para mover, clique para editar."
        actions={
          can('tarefas:editar') ? (
            <Button
              size="sm"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setModalAberto('nova')}
            >
              Nova tarefa
            </Button>
          ) : null
        }
      />

      {quadro.isLoading ? (
        <Spinner label="Carregando o quadro…" />
      ) : quadro.data ? (
        <>
          <div
            ref={scrollRef}
            className={cn(
              'flex gap-3 overflow-x-auto pb-4 select-none',
              scrollDragAtivo ? 'cursor-grabbing' : 'cursor-grab',
            )}
            onMouseDown={iniciarScrollDrag}
            onMouseMove={moverScrollDrag}
            onMouseUp={encerrarScrollDrag}
            onMouseLeave={encerrarScrollDrag}
          >
            {quadro.data.colunas.map((coluna) => {
              const expandida = colunasExpandidas.has(coluna.key);
              const itensVisiveis = expandida
                ? coluna.items
                : coluna.items.slice(0, MAX_CARDS_COLAPSADO);
              const temMais = coluna.items.length > MAX_CARDS_COLAPSADO;

              return (
                <section
                  key={coluna.key}
                  className={cn(
                    'w-72 shrink-0 rounded-lg transition-colors duration-150',
                    arrastando && colunaAlvo === coluna.key && 'bg-brand-50 ring-brand-400 ring-2',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (arrastando) setColunaAlvo(coluna.key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setColunaAlvo(null);
                    }
                  }}
                  onDrop={() => handleDrop(coluna.key)}
                >
                  <header className="mb-2 flex items-center justify-between px-1">
                    <h2 className="text-ink-800 text-sm font-bold">{coluna.label}</h2>
                    <span className="bg-ink-200 text-ink-700 rounded-full px-2 py-0.5 text-xs font-semibold">
                      {coluna.items.length}
                    </span>
                  </header>

                  <div className="space-y-2">
                    {coluna.items.length === 0 ? (
                      <p
                        className={cn(
                          'border-ink-300 text-ink-400 rounded-lg border border-dashed px-3 py-6 text-center text-xs transition-colors',
                          arrastando &&
                            colunaAlvo === coluna.key &&
                            'border-brand-400 text-brand-500',
                        )}
                      >
                        Solte aqui
                      </p>
                    ) : (
                      itensVisiveis.map((tarefa) => (
                        <CardDaTarefa
                          key={tarefa.id}
                          tarefa={tarefa}
                          dragging={arrastando === tarefa.id}
                          podeEditar={can('tarefas:editar')}
                          onDragStart={() => setArrastando(tarefa.id)}
                          onDragEnd={() => {
                            setArrastando(null);
                            setColunaAlvo(null);
                          }}
                          onClick={() => setModalAberto(tarefa)}
                        />
                      ))
                    )}

                    {temMais ? (
                      <button
                        type="button"
                        onClick={() => toggleColuna(coluna.key)}
                        className="border-ink-300 text-ink-500 hover:border-brand-400 hover:text-brand-600 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors"
                      >
                        {expandida ? (
                          <>
                            <ChevronUp className="size-3" aria-hidden />
                            Ver menos
                          </>
                        ) : (
                          <>
                            <ChevronDown className="size-3" aria-hidden />+{' '}
                            {coluna.items.length - MAX_CARDS_COLAPSADO} mais
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>

          <p className="text-ink-400 flex items-center gap-1.5 text-xs">
            <RefreshCw
              className={quadro.isFetching ? 'size-3 animate-spin' : 'size-3'}
              aria-hidden
            />
            Atualiza a cada {INTERVALO_MS / 1000}s
            {quadro.data ? ` · última leitura ${formatDateTime(quadro.data.atualizadoEm)}` : ''}
          </p>
        </>
      ) : (
        <EmptyState title="Nenhuma tarefa ainda." />
      )}

      <ModalDaTarefa
        key={modalAberto === null ? 'fechado' : modalAberto === 'nova' ? 'nova' : modalAberto.id}
        tarefa={modalAberto === 'nova' ? null : modalAberto}
        nova={modalAberto === 'nova'}
        membros={membros.data ?? []}
        onFechar={() => setModalAberto(null)}
        onSalvo={invalidar}
        podeEditar={can('tarefas:editar')}
        podeExcluir={can('tarefas:excluir')}
      />
    </>
  );
}

function CardDaTarefa({
  tarefa,
  dragging,
  podeEditar,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  tarefa: TarefaCard;
  dragging: boolean;
  podeEditar: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  return (
    <div
      draggable={podeEditar}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onMouseDown={(e) => e.stopPropagation()}
      className={cn('cursor-grab active:cursor-grabbing', dragging && 'opacity-40')}
    >
      <button
        type="button"
        onClick={onClick}
        draggable={false}
        className="border-ink-200 hover:border-brand-500 block w-full rounded-lg border bg-white p-3 text-left shadow-sm transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-ink-900 text-sm leading-snug font-semibold">{tarefa.title}</span>
          <PrioridadeBadge priority={tarefa.priority} />
        </div>

        {tarefa.assigneeName ? (
          <p className="text-ink-500 mt-1 text-xs">{tarefa.assigneeName}</p>
        ) : null}

        {tarefa.dueDate ? (
          <p
            className={cn(
              'mt-1 text-xs',
              tarefa.atrasada ? 'font-semibold text-red-600' : 'text-ink-400',
            )}
          >
            {tarefa.atrasada ? 'Atrasada · ' : ''}
            {new Date(tarefa.dueDate).toLocaleDateString('pt-BR')}
          </p>
        ) : null}
      </button>
    </div>
  );
}

function PrioridadeBadge({ priority }: { priority: TaskPriority }) {
  const cores: Record<TaskPriority, string> = {
    alta: 'bg-red-100 text-red-700',
    normal: 'bg-blue-100 text-blue-700',
    baixa: 'bg-ink-100 text-ink-600',
  };
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold',
        cores[priority],
      )}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </span>
  );
}

function ModalDaTarefa({
  tarefa,
  nova,
  membros,
  onFechar,
  onSalvo,
  podeEditar,
  podeExcluir,
}: {
  tarefa: TarefaCard | null;
  nova: boolean;
  membros: Array<{ id: string; name: string }>;
  onFechar: () => void;
  onSalvo: () => void;
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [titulo, setTitulo] = useState(tarefa?.title ?? '');
  const [descricao, setDescricao] = useState(tarefa?.description ?? '');
  const [prioridade, setPrioridade] = useState<TaskPriority>(tarefa?.priority ?? 'normal');
  const [responsavelId, setResponsavelId] = useState(tarefa?.assigneeId ?? '');
  const [prazo, setPrazo] = useState(tarefa?.dueDate ? tarefa.dueDate.split('T')[0] : '');
  const [status, setStatus] = useState<TaskStatus>(tarefa?.status ?? 'a_fazer');

  const aberto = nova || tarefa !== null;

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        title: titulo,
        description: descricao || null,
        priority: prioridade,
        assigneeId: responsavelId || null,
        dueDate: prazo || null,
        ...(tarefa ? { status } : {}),
      };
      return tarefa ? api.tarefas.atualizar(tarefa.id, corpo) : api.tarefas.criar(corpo);
    },
    onSuccess: (data) => {
      toast.success(tarefa ? 'Tarefa atualizada.' : 'Tarefa criada.');
      void queryClient.setQueryData(['tarefas', 'kanban'], data);
      onFechar();
      onSalvo();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const remover = useMutation({
    mutationFn: () => api.tarefas.remover(tarefa!.id),
    onSuccess: (data) => {
      toast.success('Tarefa removida.');
      void queryClient.setQueryData(['tarefas', 'kanban'], data);
      onFechar();
      onSalvo();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title={nova ? 'Nova tarefa' : (tarefa?.title ?? '')}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {!nova && tarefa && podeExcluir ? (
            <Button variant="outline" disabled={remover.isPending} onClick={() => remover.mutate()}>
              {remover.isPending ? 'Removendo…' : 'Remover'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            {podeEditar ? (
              <Button disabled={salvar.isPending || !titulo.trim()} onClick={() => salvar.mutate()}>
                {salvar.isPending ? 'Salvando…' : nova ? 'Criar tarefa' : 'Salvar'}
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Título" required>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            disabled={!podeEditar}
            autoFocus={nova}
          />
        </Field>

        <Field label="Descrição">
          <Textarea
            rows={3}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={!podeEditar}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Prioridade">
            <Select
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as TaskPriority)}
              disabled={!podeEditar}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prazo">
            <Input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              disabled={!podeEditar}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Responsável">
            <Select
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
              disabled={!podeEditar}
            >
              <option value="">Sem responsável</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>

          {!nova ? (
            <Field label="Status">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                disabled={!podeEditar}
              >
                {TASK_KANBAN_COLUMNS.map((col) => (
                  <option key={col.key} value={col.key}>
                    {TASK_STATUS_LABELS[col.key]}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
