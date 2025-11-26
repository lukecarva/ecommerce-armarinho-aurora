import {
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUSES,
  formatBRL,
  formatPhoneBR,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  SEAT_STATUS_LABELS,
  type EnrollmentStatus,
  type PaymentMethod,
} from '@aurora/types';
import { Badge, Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Field, Input, Modal, Select, Spinner } from '../components/ui';
import { api, type InscricaoAdmin, type TurmaAdmin, type TurmaDetalheAdmin } from '../lib/api';
import { useAuth } from '../lib/auth';
import { centsToPriceInput, formatDate, priceInputToCents } from '../lib/format';
import { useToast } from '../lib/toast';

// ─────────────────────────────── Badges helpers ──────────────────────────────

function BadgePagamento({
  paidAmount,
  totalAmount,
}: {
  paidAmount: number | null;
  totalAmount: number | null;
}) {
  if (!totalAmount) return null;
  const pago = paidAmount ?? 0;
  if (pago >= totalAmount) return <Badge tone="stock">Pago</Badge>;
  if (pago > 0) return <Badge tone="warning">Entrada</Badge>;
  return <Badge tone="neutral">Não pago</Badge>;
}

function BadgeProf({ pago, total }: { pago: number; total: number }) {
  if (total > 0 && pago >= total) return <Badge tone="stock">Prof pago</Badge>;
  if (pago > 0) return <Badge tone="warning">Prof parcial</Badge>;
  return <Badge tone="neutral">Prof a pagar</Badge>;
}

// ──────────────────────────────── Lista de cursos ─────────────────────────────

export function CoursesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cursos = useQuery({ queryKey: ['cursos'], queryFn: api.cursos.lista });

  const excluir = useMutation({
    mutationFn: (id: string) => api.cursos.remover(id),
    onSuccess: () => {
      toast.success('Curso excluído.');
      queryClient.invalidateQueries({ queryKey: ['cursos'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function confirmarExclusao(id: string, titulo: string) {
    if (!window.confirm(`Excluir "${titulo}"? Esta ação não pode ser desfeita.`)) return;
    excluir.mutate(id);
  }

  return (
    <>
      <PageHeader
        title="Cursos e workshops"
        description="Controle interno de turmas, alunos e pagamentos."
        actions={
          can('cursos:editar') ? (
            <Link to="/cursos/novo">
              <Button size="sm" icon={<Plus className="size-4" aria-hidden />}>
                Novo curso
              </Button>
            </Link>
          ) : null
        }
      />

      {cursos.isLoading ? (
        <Spinner />
      ) : cursos.data && cursos.data.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500 text-left text-xs uppercase">
              <tr>
                <th className="px-4 py-2">Curso</th>
                <th className="px-4 py-2 text-center whitespace-nowrap">Preço ref.</th>
                <th className="px-4 py-2 whitespace-nowrap">Próxima turma</th>
                <th className="px-4 py-2 text-center whitespace-nowrap">Turmas abertas</th>
                <th className="px-4 py-2 text-center whitespace-nowrap">Inscrições</th>
                {can('cursos:editar') && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-ink-200 divide-y">
              {cursos.data.map((curso) => (
                <tr key={curso.id} className="hover:bg-ink-50">
                  <td className="px-4 py-2">
                    <Link
                      to={`/cursos/${curso.id}`}
                      className="text-brand-700 font-semibold hover:underline"
                    >
                      {curso.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {curso.price > 0 ? formatBRL(curso.price) : 'Gratuito'}
                  </td>
                  <td className="text-ink-600 px-4 py-2 text-xs">{curso.proximaTurma ?? '—'}</td>
                  <td className="px-4 py-2 text-center">{curso.proximasTurmas}</td>
                  <td className="px-4 py-2 text-center">{curso.totalInscricoes}</td>
                  {can('cursos:editar') && (
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        className="cursor-pointer text-xs text-red-600 hover:underline disabled:opacity-40"
                        disabled={excluir.isPending}
                        onClick={() => confirmarExclusao(curso.id, curso.title)}
                      >
                        Excluir
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState title="Nenhum curso cadastrado." />
      )}
    </>
  );
}

// ───────────────────────────── Detalhe do curso ───────────────────────────────

interface FormularioDoCurso {
  title: string;
  summary: string;
  preco: string;
  active: boolean;
}

const CURSO_NOVO: FormularioDoCurso = { title: '', summary: '', preco: '0,00', active: true };

export function CourseDetailPage() {
  const { id = 'novo' } = useParams();
  const novo = id === 'novo';
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const curso = useQuery({
    queryKey: ['cursos', id],
    queryFn: () => api.cursos.obter(id),
    enabled: !novo,
  });
  const [form, setForm] = useState<FormularioDoCurso>(CURSO_NOVO);
  const [novaTurma, setNovaTurma] = useState(false);

  useEffect(() => {
    if (!curso.data) return;
    setForm({
      title: curso.data.title,
      summary: curso.data.summary ?? '',
      preco: centsToPriceInput(curso.data.price),
      active: curso.data.active,
    });
  }, [curso.data]);

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        title: form.title,
        slug: null,
        summary: form.summary || null,
        description: null,
        coverUrl: null,
        price: priceInputToCents(form.preco),
        durationMinutes: null,
        level: 'todos' as const,
        materials: null,
        active: form.active,
      };
      return novo ? api.cursos.criar(corpo) : api.cursos.atualizar(id, corpo);
    },
    onSuccess: (salvo) => {
      toast.success('Curso salvo.');
      void queryClient.invalidateQueries({ queryKey: ['cursos'] });
      if (novo) navigate(`/cursos/${salvo.id}`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarTurma = useMutation({
    mutationFn: (dados: Record<string, unknown>) => api.cursos.criarTurma(id, dados),
    onSuccess: () => {
      toast.success('Turma aberta.');
      setNovaTurma(false);
      void queryClient.invalidateQueries({ queryKey: ['cursos', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!novo && curso.isLoading) return <Spinner />;

  const podeEditar = can('cursos:editar');
  const c = <K extends keyof FormularioDoCurso>(k: K, v: FormularioDoCurso[K]) =>
    setForm((a) => ({ ...a, [k]: v }));

  return (
    <>
      <PageHeader
        title={novo ? 'Novo curso' : form.title}
        actions={
          <Link to="/cursos" className="text-brand-700 text-sm font-semibold hover:underline">
            ← Cursos
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* Card do curso */}
        <Card title="Dados do curso">
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              salvar.mutate();
            }}
          >
            <Field label="Nome" required>
              <Input
                value={form.title}
                onChange={(e) => c('title', e.target.value)}
                required
                disabled={!podeEditar}
              />
            </Field>
            <Field label="Resumo" hint="Aparece na agenda.">
              <Input
                value={form.summary}
                onChange={(e) => c('summary', e.target.value)}
                disabled={!podeEditar}
              />
            </Field>
            <Field label="Preço de referência (R$)" hint="Pode ser ajustado por aluno.">
              <Input
                inputMode="decimal"
                value={form.preco}
                onChange={(e) => c('preco', e.target.value)}
                disabled={!podeEditar}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => c('active', e.target.checked)}
                disabled={!podeEditar}
              />
              Ativo
            </label>
            {podeEditar && (
              <Button type="submit" full disabled={salvar.isPending}>
                {salvar.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
            )}
          </form>
        </Card>

        {/* Lista de turmas */}
        {!novo && curso.data && (
          <div className="space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-ink-800 font-semibold">Turmas</h2>
              {podeEditar && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<CalendarPlus className="size-4" aria-hidden />}
                  onClick={() => setNovaTurma(!novaTurma)}
                >
                  Abrir turma
                </Button>
              )}
            </div>

            {novaTurma && (
              <Card>
                <FormularioDaTurma
                  salvando={criarTurma.isPending}
                  onSalvar={(d) => criarTurma.mutate(d)}
                  onCancelar={() => setNovaTurma(false)}
                />
              </Card>
            )}

            {curso.data.sessions.length === 0 && !novaTurma ? (
              <p className="text-ink-500 text-sm">Nenhuma turma ainda.</p>
            ) : (
              curso.data.sessions.map((turma) => (
                <CardTurmaResumo key={turma.id} cursoId={id} turma={turma} />
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

function CardTurmaResumo({ cursoId, turma }: { cursoId: string; turma: TurmaAdmin }) {
  const total =
    turma.inscricoes.confirmada + turma.inscricoes.pendente + turma.inscricoes.lista_de_espera;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-ink-900 font-semibold">{turma.dataTexto}</p>
          <p className="text-ink-500 text-xs">
            {[turma.instructor, turma.room].filter(Boolean).join(' · ') || 'Sem professor ou sala'}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-600">
              {turma.inscricoes.confirmada}/{turma.seatsTotal} confirmadas
              {turma.inscricoes.pendente > 0 ? ` · ${turma.inscricoes.pendente} pendentes` : ''}
              {turma.inscricoes.lista_de_espera > 0
                ? ` · ${turma.inscricoes.lista_de_espera} espera`
                : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 pt-0.5">
            <Badge
              tone={
                turma.cancelledAt ? 'neutral' : turma.situacao === 'lotada' ? 'warning' : 'stock'
              }
            >
              {turma.cancelledAt ? 'cancelada' : SEAT_STATUS_LABELS[turma.situacao]}
            </Badge>
            {turma.instructorFee !== null && (
              <BadgeProf pago={turma.instructorPaidAmount ?? 0} total={turma.instructorFee} />
            )}
            {total > 0 && (
              <Badge tone="neutral">
                {total} aluno{total !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
        <Link to={`/cursos/${cursoId}/turma/${turma.id}`}>
          <Button size="sm">Ver turma</Button>
        </Link>
      </div>
    </Card>
  );
}

// ──────────────────────────────── Página da Turma ────────────────────────────

export function TurmaPage() {
  const { id, sid } = useParams<{ id: string; sid: string }>();
  const { can } = useAuth();
  const podeEditar = can('cursos:editar');

  const dados = useQuery({
    queryKey: ['inscricoes', sid],
    queryFn: () => api.cursos.inscricoes(sid!),
  });

  if (dados.isLoading) return <Spinner />;
  if (!dados.data) return null;

  const { turma, inscricoes } = dados.data;

  return (
    <>
      <PageHeader
        title={turma.dataTexto}
        description={turma.curso.title}
        actions={
          <Link
            to={`/cursos/${id}`}
            className="text-brand-700 text-sm font-semibold hover:underline"
          >
            ← {turma.curso.title}
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        {/* Coluna esquerda: turma info + professor */}
        <div className="space-y-4">
          <CardInfoTurma turma={turma} />
          <CardProfessor turma={turma} podeEditar={podeEditar} sid={sid!} />
        </div>

        {/* Coluna principal: alunos */}
        <div className="lg:col-span-2">
          <CardAlunos turma={turma} inscricoes={inscricoes} podeEditar={podeEditar} sid={sid!} />
        </div>
      </div>
    </>
  );
}

function CardInfoTurma({ turma }: { turma: TurmaDetalheAdmin }) {
  return (
    <Card title="Turma">
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-ink-400 text-xs">Data</dt>
          <dd className="text-ink-800 font-medium">{turma.dataTexto}</dd>
        </div>
        {turma.room && (
          <div>
            <dt className="text-ink-400 text-xs">Sala</dt>
            <dd className="text-ink-700">{turma.room}</dd>
          </div>
        )}
        <div>
          <dt className="text-ink-400 text-xs">Vagas</dt>
          <dd className="text-ink-700">{turma.seatsTotal} no total</dd>
        </div>
        {turma.notes && (
          <div>
            <dt className="text-ink-400 text-xs">Obs.</dt>
            <dd className="text-ink-600 text-xs">{turma.notes}</dd>
          </div>
        )}
        {turma.cancelada && (
          <div className="pt-1">
            <Badge tone="neutral">Turma cancelada</Badge>
          </div>
        )}
      </dl>
    </Card>
  );
}

function CardProfessor({
  turma,
  podeEditar,
  sid,
}: {
  turma: TurmaDetalheAdmin;
  podeEditar: boolean;
  sid: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(false);

  const salvar = useMutation({
    mutationFn: (body: unknown) => api.cursos.registrarPagamentoProfessor(sid, body),
    onSuccess: () => {
      toast.success('Pagamento do professor atualizado.');
      setModal(false);
      void queryClient.invalidateQueries({ queryKey: ['inscricoes', sid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cache = turma.cacheCalculado ?? null;
  const pago = turma.instructorPaidAmount ?? 0;
  const saldo = cache !== null ? cache - pago : null;

  return (
    <Card
      title="Professor(a)"
      actions={
        podeEditar && turma.instructor ? (
          <Button size="sm" variant="outline" onClick={() => setModal(true)}>
            Registrar pgto
          </Button>
        ) : undefined
      }
    >
      {!turma.instructor ? (
        <p className="text-ink-400 text-sm">Nenhum professor cadastrado nesta turma.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-ink-900 font-medium">{turma.instructor}</p>
            {turma.instructorPhone && (
              <a
                href={`https://wa.me/55${turma.instructorPhone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 text-xs hover:underline"
              >
                {formatPhoneBR(turma.instructorPhone)}
              </a>
            )}
          </div>

          {turma.instructorFee !== null && (
            <div className="space-y-1 text-sm">
              {turma.instructorFeeType === 'porcentagem' ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-ink-500">Porcentagem combinada</span>
                    <span className="text-ink-700 font-semibold">{turma.instructorFee}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">Calculado (total pago)</span>
                    <span className="text-ink-700 font-medium">
                      {cache !== null ? formatBRL(cache) : '—'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-ink-500">Cachê combinado</span>
                  <span className="text-ink-700 font-medium">
                    {cache !== null ? formatBRL(cache) : '—'}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ink-500">Pago</span>
                <span className={`font-medium ${pago > 0 ? 'text-emerald-700' : 'text-ink-400'}`}>
                  {formatBRL(pago)}
                </span>
              </div>
              <div className="border-ink-100 flex justify-between border-t pt-1">
                <span className="text-ink-500">Saldo</span>
                <span
                  className={`font-semibold ${saldo !== null && saldo > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                >
                  {saldo !== null ? formatBRL(saldo) : '—'}
                </span>
              </div>
              {turma.instructorPaidAt && (
                <p className="text-ink-400 text-xs">Pago em {formatDate(turma.instructorPaidAt)}</p>
              )}
              <div className="pt-1">
                {cache !== null && <BadgeProf pago={pago} total={cache} />}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={`Pagamento — ${turma.instructor}`}
        footer={
          <Button variant="outline" onClick={() => setModal(false)}>
            Fechar
          </Button>
        }
      >
        <ModalPagamentoProf
          valorCombinado={turma.cacheCalculado ?? null}
          valorPagoAtual={turma.instructorPaidAmount}
          dataPagaAtual={turma.instructorPaidAt}
          salvando={salvar.isPending}
          onSalvar={(d) => salvar.mutate(d)}
        />
      </Modal>
    </Card>
  );
}

function CardAlunos({
  turma,
  inscricoes,
  podeEditar,
  sid,
}: {
  turma: TurmaDetalheAdmin;
  inscricoes: InscricaoAdmin[];
  podeEditar: boolean;
  sid: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [modalAluno, setModalAluno] = useState<InscricaoAdmin | 'novo' | null>(null);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['inscricoes', sid] });

  const criar = useMutation({
    mutationFn: (body: unknown) => api.cursos.criarInscricao(sid, body),
    onSuccess: () => {
      toast.success('Aluno cadastrado.');
      setModalAluno(null);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizar = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api.cursos.atualizarInscricao(id, body),
    onSuccess: () => {
      toast.success('Aluno atualizado.');
      setModalAluno(null);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ativas = inscricoes.filter((i) => i.status !== 'cancelada');
  const totalEsperado = ativas
    .filter((i) => i.status === 'confirmada')
    .reduce((s, i) => s + (i.totalAmount ?? 0), 0);
  const totalPago = ativas.reduce((s, i) => s + (i.paidAmount ?? 0), 0);
  const totalPendente = totalEsperado - totalPago;

  function exportarCsv() {
    const cab = [
      'Nome',
      'Telefone',
      'Status inscr.',
      'Total',
      'Pago',
      'Saldo',
      'Forma',
      'Pgto. status',
    ];
    const linhas = inscricoes.map((i) => {
      const saldo = (i.totalAmount ?? 0) - (i.paidAmount ?? 0);
      const pgtoStatus = !i.totalAmount
        ? ''
        : (i.paidAmount ?? 0) >= i.totalAmount
          ? 'Pago'
          : (i.paidAmount ?? 0) > 0
            ? 'Entrada'
            : 'Não pago';
      return [
        i.name,
        i.phone,
        ENROLLMENT_STATUS_LABELS[i.status],
        i.totalAmount !== null ? formatBRL(i.totalAmount) : '',
        i.paidAmount !== null ? formatBRL(i.paidAmount) : '',
        i.totalAmount !== null ? formatBRL(saldo) : '',
        i.paymentMethod ? PAYMENT_METHOD_LABELS[i.paymentMethod] : '',
        pgtoStatus,
      ];
    });
    const csv = [cab, ...linhas]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alunos-${turma.dataTexto.replace(/[^\w]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Card
        title="Alunos"
        actions={
          podeEditar ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={exportarCsv}
                disabled={inscricoes.length === 0}
              >
                Exportar CSV
              </Button>
              <Button
                size="sm"
                icon={<Plus className="size-4" aria-hidden />}
                onClick={() => setModalAluno('novo')}
              >
                Adicionar aluno
              </Button>
            </div>
          ) : undefined
        }
      >
        {inscricoes.length === 0 ? (
          <p className="text-ink-400 text-sm">
            Nenhum aluno cadastrado. Clique em "Adicionar aluno" para começar.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-ink-400 border-ink-100 border-b text-left text-xs">
                    <th className="pr-3 pb-2 font-medium">Aluno</th>
                    <th className="px-3 pb-2 text-right font-medium">Total</th>
                    <th className="px-3 pb-2 text-right font-medium">Pago</th>
                    <th className="px-3 pb-2 text-right font-medium">Saldo</th>
                    <th className="px-3 pb-2 font-medium">Pgto.</th>
                    <th className="px-3 pb-2 font-medium">Inscrição</th>
                    <th className="pb-2 pl-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-ink-100 divide-y">
                  {inscricoes.map((i) => {
                    const saldo = (i.totalAmount ?? 0) - (i.paidAmount ?? 0);
                    return (
                      <tr key={i.id} className="hover:bg-ink-50">
                        <td className="py-2 pr-3">
                          <span className="text-ink-800 font-medium">{i.name}</span>
                          <a
                            href={`https://wa.me/55${i.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ink-400 block text-xs hover:underline"
                          >
                            {formatPhoneBR(i.phone)}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {i.status !== 'cancelada' && i.totalAmount !== null ? (
                            <span className="text-ink-700 text-xs">{formatBRL(i.totalAmount)}</span>
                          ) : (
                            <span className="text-ink-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {i.status !== 'cancelada' && (i.paidAmount ?? 0) > 0 ? (
                            <span className="text-xs font-medium text-emerald-700">
                              {formatBRL(i.paidAmount!)}
                            </span>
                          ) : (
                            <span className="text-ink-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {i.status !== 'cancelada' && i.totalAmount !== null ? (
                            <span
                              className={`text-xs font-medium ${saldo > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                            >
                              {formatBRL(saldo)}
                            </span>
                          ) : (
                            <span className="text-ink-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="text-ink-500 px-3 py-2 text-xs">
                          {i.paymentMethod ? PAYMENT_METHOD_LABELS[i.paymentMethod] : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={
                              i.status === 'confirmada'
                                ? 'stock'
                                : i.status === 'cancelada'
                                  ? 'neutral'
                                  : 'warning'
                            }
                          >
                            {ENROLLMENT_STATUS_LABELS[i.status]}
                          </Badge>
                        </td>
                        <td className="py-2 pl-3">
                          {podeEditar && (
                            <button
                              type="button"
                              className="text-brand-700 cursor-pointer text-xs font-medium hover:underline"
                              onClick={() => setModalAluno(i)}
                            >
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Resumo financeiro */}
            <div className="border-ink-200 mt-4 grid grid-cols-3 gap-3 rounded-lg border p-3 text-center">
              <div>
                <p className="text-ink-400 text-xs">Esperado</p>
                <p className="text-ink-800 text-sm font-semibold">{formatBRL(totalEsperado)}</p>
              </div>
              <div>
                <p className="text-ink-400 text-xs">Recebido</p>
                <p className="text-sm font-semibold text-emerald-700">{formatBRL(totalPago)}</p>
              </div>
              <div>
                <p className="text-ink-400 text-xs">Pendente</p>
                <p
                  className={`text-sm font-semibold ${totalPendente > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                >
                  {formatBRL(totalPendente)}
                </p>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Modal aluno */}
      <Modal
        open={modalAluno !== null}
        onClose={() => setModalAluno(null)}
        title={
          modalAluno === 'novo' ? 'Novo aluno' : `Editar — ${(modalAluno as InscricaoAdmin)?.name}`
        }
        footer={
          <Button variant="outline" onClick={() => setModalAluno(null)}>
            Fechar
          </Button>
        }
      >
        {modalAluno !== null && (
          <ModalAluno
            inscricao={modalAluno === 'novo' ? null : (modalAluno as InscricaoAdmin)}
            precoReferencia={Math.round(Number(turma.curso.price) * 100)}
            salvando={criar.isPending || atualizar.isPending}
            onSalvar={(body) => {
              if (modalAluno === 'novo') {
                criar.mutate(body);
              } else {
                atualizar.mutate({ id: (modalAluno as InscricaoAdmin).id, body });
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}

// ─────────────────────────── Modal Aluno (add/edit) ──────────────────────────

function ModalAluno({
  inscricao,
  precoReferencia,
  salvando,
  onSalvar,
}: {
  inscricao: InscricaoAdmin | null;
  precoReferencia?: number;
  salvando: boolean;
  onSalvar: (body: unknown) => void;
}) {
  const [nome, setNome] = useState(inscricao?.name ?? '');
  const [telefone, setTelefone] = useState(inscricao?.phone ? formatPhoneBR(inscricao.phone) : '');
  const totalInicial =
    inscricao?.totalAmount != null
      ? centsToPriceInput(inscricao.totalAmount)
      : precoReferencia != null
        ? centsToPriceInput(precoReferencia)
        : '';
  const [total, setTotal] = useState(totalInicial);
  const [pago, setPago] = useState(
    inscricao?.paidAmount != null ? centsToPriceInput(inscricao.paidAmount) : '',
  );
  const [metodo, setMetodo] = useState<PaymentMethod>(inscricao?.paymentMethod ?? 'pix');
  const [dataPgto, setDataPgto] = useState(
    inscricao?.paidAt ? inscricao.paidAt.split('T')[0] : new Date().toISOString().split('T')[0],
  );
  const [status, setStatus] = useState<EnrollmentStatus>(inscricao?.status ?? 'confirmada');
  const [notas, setNotas] = useState(inscricao?.notes ?? '');

  const totalCents = total.trim() ? priceInputToCents(total) : null;
  const pagoCents = pago.trim() ? priceInputToCents(pago) : null;
  const saldo = totalCents !== null ? totalCents - (pagoCents ?? 0) : null;

  function handleSalvar() {
    onSalvar({
      name: nome,
      phone: telefone.replace(/\D/g, ''),
      email: null,
      status,
      notes: notas || null,
      totalAmount: totalCents,
      paidAmount: pagoCents,
      paidAt:
        pagoCents !== null && pagoCents > 0
          ? new Date(`${dataPgto}T12:00:00-03:00`).toISOString()
          : null,
      paymentMethod: pagoCents !== null && pagoCents > 0 ? metodo : null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome *">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Field>
        <Field label="WhatsApp *" hint="Com DDD">
          <Input
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            placeholder="(11) 99999-9999"
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor do curso (R$) *">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={total}
            readOnly={inscricao !== null || precoReferencia != null}
            className={
              inscricao !== null || precoReferencia != null
                ? 'bg-surface-100 cursor-not-allowed'
                : ''
            }
            onChange={(e) => {
              if (inscricao !== null || precoReferencia != null) return;
              setTotal(e.target.value);
            }}
            required
          />
        </Field>
        <Field label="Quanto já pagou (R$)">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={pago}
            onChange={(e) => setPago(e.target.value)}
          />
        </Field>
      </div>

      {totalCents !== null && (
        <div className="flex items-center gap-3">
          <span className="text-ink-500 text-sm">Saldo:</span>
          <span
            className={`text-sm font-semibold ${saldo! > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
          >
            {formatBRL(saldo!)}
          </span>
          <BadgePagamento paidAmount={pagoCents} totalAmount={totalCents} />
        </div>
      )}

      {pagoCents !== null && pagoCents > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Forma de pagamento">
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data do pagamento">
            <Input type="date" value={dataPgto} onChange={(e) => setDataPgto(e.target.value)} />
          </Field>
        </div>
      )}

      <Field label="Status da inscrição">
        <Select value={status} onChange={(e) => setStatus(e.target.value as EnrollmentStatus)}>
          {ENROLLMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ENROLLMENT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Notas internas">
        <Input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Observações sobre este aluno…"
        />
      </Field>

      <Button
        full
        disabled={salvando || !nome.trim() || !telefone.trim() || !total.trim()}
        onClick={handleSalvar}
      >
        {salvando ? 'Salvando…' : 'Salvar'}
      </Button>
    </div>
  );
}

// ─────────────────────── Modal Pagamento Professor ────────────────────────────

function ModalPagamentoProf({
  valorCombinado,
  valorPagoAtual,
  dataPagaAtual,
  salvando,
  onSalvar,
}: {
  valorCombinado: number | null;
  valorPagoAtual: number | null;
  dataPagaAtual: string | null;
  salvando: boolean;
  onSalvar: (d: { instructorPaidAmount: number | null; instructorPaidAt: string | null }) => void;
}) {
  const [valorPago, setValorPago] = useState(
    valorPagoAtual != null && valorPagoAtual > 0 ? centsToPriceInput(valorPagoAtual) : '',
  );
  const [data, setData] = useState(
    dataPagaAtual ? dataPagaAtual.split('T')[0] : new Date().toISOString().split('T')[0],
  );

  const pagoCents = valorPago.trim() ? priceInputToCents(valorPago) : null;
  const saldo = valorCombinado !== null && pagoCents !== null ? valorCombinado - pagoCents : null;

  return (
    <div className="space-y-4">
      {valorCombinado !== null && (
        <p className="text-ink-600 text-sm">
          Cachê: <span className="font-semibold">{formatBRL(valorCombinado)}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor pago (R$)">
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={valorPago}
            onChange={(e) => setValorPago(e.target.value)}
          />
        </Field>
        <Field label="Data do pagamento">
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
      </div>
      {saldo !== null && (
        <p className={`text-sm font-medium ${saldo > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
          Saldo: {formatBRL(saldo)}
        </p>
      )}
      <Button
        full
        disabled={salvando}
        onClick={() =>
          onSalvar({
            instructorPaidAmount: pagoCents,
            instructorPaidAt:
              pagoCents !== null && pagoCents > 0
                ? new Date(`${data}T12:00:00-03:00`).toISOString()
                : null,
          })
        }
      >
        {salvando ? 'Salvando…' : 'Salvar'}
      </Button>
    </div>
  );
}

// ──────────────────── Formulário para criar nova turma ────────────────────────

function mascaraTelefone(valor: string): string {
  const nums = valor.replace(/\D/g, '').slice(0, 11);
  if (nums.length <= 2) return nums.length ? `(${nums}` : '';
  if (nums.length <= 6) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
  if (nums.length <= 10) return `(${nums.slice(0, 2)}) ${nums.slice(2, 6)}-${nums.slice(6)}`;
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
}

const hoje = new Date().toISOString().split('T')[0];

function FormularioDaTurma({
  salvando,
  onSalvar,
  onCancelar,
}: {
  salvando: boolean;
  onSalvar: (dados: Record<string, unknown>) => void;
  onCancelar: () => void;
}) {
  const [dia, setDia] = useState('');
  const [inicio, setInicio] = useState('14:00');
  const [fim, setFim] = useState('17:00');
  const [room, setRoom] = useState('');
  const [instructor, setInstructor] = useState('');
  const [instructorPhone, setInstructorPhone] = useState('');
  const [feeType, setFeeType] = useState<'fixo' | 'porcentagem'>('fixo');
  const [fee, setFee] = useState('');
  const [seatsTotal, setSeatsTotal] = useState('10');
  const [notes, setNotes] = useState('');

  const podeSalvar = instructor.trim() && fee.trim() && dia;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSalvar({
          startsAt: new Date(`${dia}T${inicio}:00-03:00`).toISOString(),
          endsAt: new Date(`${dia}T${fim}:00-03:00`).toISOString(),
          room: room || null,
          instructor: instructor || null,
          instructorPhone: instructorPhone.replace(/\D/g, '') || null,
          instructorFeeType: feeType,
          instructorFee: feeType === 'porcentagem' ? Number(fee) : priceInputToCents(fee),
          seatsTotal: Number(seatsTotal),
          notes: notes || null,
        });
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="Dia *">
          <Input
            type="date"
            value={dia}
            min={hoje}
            onChange={(e) => setDia(e.target.value)}
            required
          />
        </Field>
        <Field label="Começa">
          <Input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
        </Field>
        <Field label="Termina">
          <Input type="time" value={fim} onChange={(e) => setFim(e.target.value)} required />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Professor(a) *">
          <Input
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
            required
            placeholder="Nome completo"
          />
        </Field>
        <Field label="WhatsApp do prof">
          <Input
            value={instructorPhone}
            onChange={(e) => setInstructorPhone(mascaraTelefone(e.target.value))}
            placeholder="(XX) XXXXX-XXXX"
            inputMode="tel"
          />
        </Field>
        <Field label="Tipo de cachê *">
          <Select
            value={feeType}
            onChange={(e) => setFeeType(e.target.value as 'fixo' | 'porcentagem')}
          >
            <option value="fixo">Valor fixo (R$)</option>
            <option value="porcentagem">% do total pago</option>
          </Select>
        </Field>
        <Field label={feeType === 'porcentagem' ? 'Porcentagem (%) *' : 'Cachê (R$) *'}>
          <Input
            inputMode="decimal"
            placeholder={feeType === 'porcentagem' ? 'Ex: 30' : '0,00'}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Sala">
          <Input value={room} onChange={(e) => setRoom(e.target.value)} />
        </Field>
        <Field label="Vagas *">
          <Input
            inputMode="numeric"
            value={seatsTotal}
            onChange={(e) => setSeatsTotal(e.target.value)}
            required
          />
        </Field>
        <Field label="Obs. internas">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={salvando || !podeSalvar}>
          {salvando ? 'Abrindo…' : 'Abrir turma'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
