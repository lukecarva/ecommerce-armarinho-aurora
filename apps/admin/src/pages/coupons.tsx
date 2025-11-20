import { formatBRL, ORDER_STATUS_LABELS } from '@aurora/types';
import { Badge, Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Field, Input, Select, Spinner, Textarea } from '../components/ui';
import { api, type CouponRow } from '../lib/api';
import { useAuth } from '../lib/auth';
import { centsToPriceInput, formatDate, priceInputToCents, toDateInput } from '../lib/format';
import { useToast } from '../lib/toast';

/**
 * Cupons.
 *
 * O relatório de cada cupom mostra o que interessa para decidir se ele deu
 * certo: quanto a loja deu de desconto e quanto vendeu de fato nos pedidos
 * que o usaram — o valor fechado, não a estimativa do site.
 */

function regra(cupom: Pick<CouponRow, 'type' | 'value' | 'minSubtotal'>): string {
  const desconto = cupom.type === 'percent' ? `${cupom.value}%` : formatBRL(cupom.value);
  return cupom.minSubtotal ? `${desconto} acima de ${formatBRL(cupom.minSubtotal)}` : desconto;
}

export function CouponsPage() {
  const { can } = useAuth();
  const cupons = useQuery({ queryKey: ['cupons'], queryFn: api.cupons.lista });

  return (
    <>
      <PageHeader
        title="Cupons"
        description="Listados aparecem na conta do cliente; os demais valem só para quem recebeu o código."
        actions={
          can('cupons:editar') ? (
            <Link to="/cupons/novo">
              <Button size="sm" icon={<Plus className="size-4" aria-hidden />}>
                Novo cupom
              </Button>
            </Link>
          ) : null
        }
      />

      {cupons.isLoading ? (
        <Spinner />
      ) : cupons.data && cupons.data.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500 text-left text-xs uppercase">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Regra</th>
                <th className="px-3 py-2 text-right">Usos</th>
                <th className="px-3 py-2 text-right">Desconto dado</th>
                <th className="px-3 py-2">Validade</th>
                <th className="px-3 py-2">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-ink-200 divide-y">
              {cupons.data.map((cupom) => (
                <tr key={cupom.id} className="hover:bg-ink-50">
                  <td className="px-3 py-2">
                    <Link
                      to={`/cupons/${cupom.id}`}
                      className="text-brand-700 font-mono font-semibold hover:underline"
                    >
                      {cupom.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{regra(cupom)}</td>
                  <td className="px-3 py-2 text-right">
                    {cupom.usedCount}
                    {cupom.usageLimit ? ` / ${cupom.usageLimit}` : ''}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatBRL(cupom.descontoConcedido ?? 0)}
                  </td>
                  <td className="text-ink-500 px-3 py-2 text-xs">
                    {cupom.endsAt ? `até ${formatDate(cupom.endsAt)}` : 'sem prazo'}
                  </td>
                  <td className="space-x-1 px-3 py-2">
                    <Badge tone={cupom.active ? 'stock' : 'neutral'}>
                      {cupom.active ? 'ativo' : 'desligado'}
                    </Badge>
                    {cupom.listed ? <Badge tone="brand">listado</Badge> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState title="Nenhum cupom ainda." />
      )}
    </>
  );
}

interface Formulario {
  code: string;
  type: 'percent' | 'fixed';
  valor: string;
  minimo: string;
  usageLimit: string;
  perCustomerLimit: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  listed: boolean;
  description: string;
}

const NOVO: Formulario = {
  code: '',
  type: 'percent',
  valor: '10',
  minimo: '',
  usageLimit: '',
  perCustomerLimit: '1',
  startsAt: '',
  endsAt: '',
  active: true,
  listed: false,
  description: '',
};

export function CouponFormPage() {
  const { id = 'novo' } = useParams();
  const novo = id === 'novo';
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const cupom = useQuery({
    queryKey: ['cupons', id],
    queryFn: () => api.cupons.obter(id),
    enabled: !novo,
  });

  const [form, setForm] = useState<Formulario>(NOVO);

  useEffect(() => {
    if (!cupom.data) return;
    const dados = cupom.data;

    setForm({
      code: dados.code,
      type: dados.type,
      valor: dados.type === 'percent' ? String(dados.value) : centsToPriceInput(dados.value),
      minimo: dados.minSubtotal ? centsToPriceInput(dados.minSubtotal) : '',
      usageLimit: dados.usageLimit ? String(dados.usageLimit) : '',
      perCustomerLimit: dados.perCustomerLimit ? String(dados.perCustomerLimit) : '',
      startsAt: toDateInput(dados.startsAt),
      endsAt: toDateInput(dados.endsAt),
      active: dados.active,
      listed: dados.listed,
      description: dados.description ?? '',
    });
  }, [cupom.data]);

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        code: form.code,
        type: form.type,
        // Percentual é número; valor fixo atravessa a API em centavos.
        value:
          form.type === 'percent'
            ? Number(form.valor.replace(',', '.'))
            : priceInputToCents(form.valor),
        minSubtotal: form.minimo ? priceInputToCents(form.minimo) : null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : null,
        // Fim do dia no fuso da loja: "válido até 30/09" inclui o dia 30 inteiro.
        startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00-03:00`).toISOString() : null,
        endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59-03:00`).toISOString() : null,
        active: form.active,
        listed: form.listed,
        description: form.description,
      };

      return novo ? api.cupons.criar(corpo) : api.cupons.atualizar(id, corpo);
    },
    onSuccess: (salvo) => {
      toast.success(
        form.listed && form.active
          ? 'Cupom salvo. Os clientes com conta vão ser avisados.'
          : 'Cupom salvo.',
      );
      void queryClient.invalidateQueries({ queryKey: ['cupons'] });
      if (novo) navigate(`/cupons/${salvo.id}`, { replace: true });
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  if (!novo && cupom.isLoading) return <Spinner />;

  function campo<K extends keyof Formulario>(chave: K, valor: Formulario[K]) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
  }

  const podeEditar = can('cupons:editar');

  return (
    <>
      <PageHeader
        title={novo ? 'Novo cupom' : form.code}
        actions={
          <Link to="/cupons" className="text-brand-700 text-sm font-semibold hover:underline">
            Voltar
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr] lg:items-start">
        <Card title="Regras">
          <form
            className="space-y-3"
            onSubmit={(evento) => {
              evento.preventDefault();
              salvar.mutate();
            }}
          >
            <Field
              label="Código"
              hint="O que a cliente digita. Maiúsculas e minúsculas valem igual."
            >
              <Input
                value={form.code}
                onChange={(evento) => campo('code', evento.target.value.toUpperCase())}
                className="font-mono"
                required
                disabled={!podeEditar}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <Select
                  value={form.type}
                  onChange={(evento) => campo('type', evento.target.value as Formulario['type'])}
                  disabled={!podeEditar}
                >
                  <option value="percent">Percentual</option>
                  <option value="fixed">Valor fixo</option>
                </Select>
              </Field>
              <Field label={form.type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}>
                <Input
                  inputMode="decimal"
                  value={form.valor}
                  onChange={(evento) => campo('valor', evento.target.value)}
                  required
                  disabled={!podeEditar}
                />
              </Field>
            </div>

            <Field label="Pedido mínimo (R$)" hint="Vazio: vale para qualquer valor.">
              <Input
                inputMode="decimal"
                value={form.minimo}
                onChange={(evento) => campo('minimo', evento.target.value)}
                disabled={!podeEditar}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Usos no total" hint="Vazio: sem limite.">
                <Input
                  inputMode="numeric"
                  value={form.usageLimit}
                  onChange={(evento) => campo('usageLimit', evento.target.value)}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Por cliente" hint="Vale só para quem tem conta.">
                <Input
                  inputMode="numeric"
                  value={form.perCustomerLimit}
                  onChange={(evento) => campo('perCustomerLimit', evento.target.value)}
                  disabled={!podeEditar}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Começa em">
                <Input
                  type="date"
                  value={form.startsAt}
                  onChange={(evento) => campo('startsAt', evento.target.value)}
                  disabled={!podeEditar}
                />
              </Field>
              <Field label="Termina em">
                <Input
                  type="date"
                  value={form.endsAt}
                  onChange={(evento) => campo('endsAt', evento.target.value)}
                  disabled={!podeEditar}
                />
              </Field>
            </div>

            <Field label="Texto para o cliente" hint="Aparece na conta e no aviso de cupom novo.">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(evento) => campo('description', evento.target.value)}
                disabled={!podeEditar}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(evento) => campo('active', evento.target.checked)}
                disabled={!podeEditar}
              />
              Ativo
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.listed}
                onChange={(evento) => campo('listed', evento.target.checked)}
                className="mt-1"
                disabled={!podeEditar}
              />
              <span>
                Listar na conta do cliente
                <span className="text-ink-500 block text-xs">
                  Ao ficar ativo e listado, todos com conta recebem um aviso — por e-mail, só quem
                  aceitou receber novidades.
                </span>
              </span>
            </label>

            {podeEditar ? (
              <Button type="submit" full disabled={salvar.isPending}>
                {salvar.isPending ? 'Salvando…' : 'Salvar cupom'}
              </Button>
            ) : null}
          </form>
        </Card>

        {cupom.data ? (
          <Card title="Relatório de uso">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Numero rotulo="Usos" valor={String(cupom.data.relatorio.usos)} />
              <Numero
                rotulo="Desconto dado"
                valor={formatBRL(cupom.data.relatorio.descontoConcedido)}
              />
              <Numero
                rotulo="Pedidos fechados"
                valor={String(cupom.data.relatorio.pedidosFechados)}
              />
              <Numero rotulo="Vendido" valor={formatBRL(cupom.data.relatorio.vendido)} />
            </div>

            {cupom.data.relatorio.pedidos.length === 0 ? (
              <p className="text-ink-500 text-sm">Nenhum pedido usou este cupom ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-ink-500 text-left text-xs uppercase">
                  <tr>
                    <th className="py-1">Pedido</th>
                    <th className="py-1">Cliente</th>
                    <th className="py-1">Status</th>
                    <th className="py-1 text-right">Desconto</th>
                    <th className="py-1 text-right">Fechado</th>
                  </tr>
                </thead>
                <tbody className="divide-ink-200 divide-y">
                  {cupom.data.relatorio.pedidos.map((pedido) => (
                    <tr key={pedido.code}>
                      <td className="py-2">
                        <Link
                          to={`/pedidos/${pedido.code}`}
                          className="text-brand-700 font-semibold hover:underline"
                        >
                          {pedido.code}
                        </Link>
                      </td>
                      <td className="py-2">{pedido.cliente}</td>
                      <td className="py-2">{ORDER_STATUS_LABELS[pedido.status]}</td>
                      <td className="py-2 text-right">{formatBRL(pedido.desconto)}</td>
                      <td className="py-2 text-right">
                        {pedido.finalValue === null ? '—' : formatBRL(pedido.finalValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-ink-50 rounded-md p-3">
      <p className="text-ink-500 text-xs">{rotulo}</p>
      <p className="text-ink-900 text-lg font-bold">{valor}</p>
    </div>
  );
}
