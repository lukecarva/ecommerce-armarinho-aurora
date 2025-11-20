import { formatBRL, formatCep, formatPhoneBR, ORDER_STATUS_LABELS } from '@aurora/types';
import { Badge, Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Field, Input, Pagination, Select, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';

/**
 * Clientes com conta.
 *
 * A ficha junta o que a atendente precisa para reconhecer quem está do outro
 * lado do WhatsApp — pedidos, endereços, grupo — e os dois direitos da LGPD
 * que a loja tem obrigação de atender: entregar os dados e apagá-los.
 */
export function CustomersListPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const busca = params.get('busca') ?? '';

  const clientes = useQuery({
    queryKey: ['clientes', { page, busca }],
    queryFn: () => api.clientes.lista({ page, perPage: 30, busca: busca || undefined }),
  });

  function ajustar(chave: string, valor: string) {
    const proximos = new URLSearchParams(params);
    if (valor) proximos.set(chave, valor);
    else proximos.delete(chave);
    if (chave !== 'page') proximos.delete('page');
    setParams(proximos);
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Quem criou conta na loja. Busque por nome, e-mail ou telefone."
      />

      <Card className="mb-4">
        <Input
          placeholder="Nome, e-mail ou telefone"
          defaultValue={busca}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') ajustar('busca', evento.currentTarget.value);
          }}
        />
      </Card>

      {clientes.isLoading ? (
        <Spinner />
      ) : clientes.data && clientes.data.items.length > 0 ? (
        <>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500 text-left text-xs uppercase">
                <tr>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">WhatsApp</th>
                  <th className="px-3 py-2">Grupo</th>
                  <th className="px-3 py-2 text-right">Pedidos</th>
                  <th className="px-3 py-2">Último pedido</th>
                  <th className="px-3 py-2">Desde</th>
                </tr>
              </thead>
              <tbody className="divide-ink-200 divide-y">
                {clientes.data.items.map((cliente) => (
                  <tr key={cliente.id} className="hover:bg-ink-50">
                    <td className="px-3 py-2">
                      <Link
                        to={`/clientes/${cliente.id}`}
                        className="text-brand-700 font-semibold hover:underline"
                      >
                        {cliente.name}
                      </Link>
                      {cliente.anonymized ? (
                        <Badge tone="neutral" className="ml-2">
                          anonimizado
                        </Badge>
                      ) : null}
                      <span className="text-ink-400 block text-xs">{cliente.email ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2">
                      {cliente.phone ? formatPhoneBR(cliente.phone) : '—'}
                    </td>
                    <td className="px-3 py-2">{cliente.grupo ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{cliente.pedidos}</td>
                    <td className="text-ink-500 px-3 py-2 text-xs">
                      {cliente.ultimoPedido ? formatDate(cliente.ultimoPedido) : '—'}
                    </td>
                    <td className="text-ink-500 px-3 py-2 text-xs">
                      {formatDate(cliente.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Pagination
            page={clientes.data.page}
            totalPages={clientes.data.totalPages}
            total={clientes.data.total}
            onChange={(proxima) => ajustar('page', String(proxima))}
          />
        </>
      ) : (
        <EmptyState title="Nenhum cliente encontrado." />
      )}
    </>
  );
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();

  const cliente = useQuery({ queryKey: ['clientes', id], queryFn: () => api.clientes.detalhe(id) });

  if (cliente.isLoading) return <Spinner />;
  if (!cliente.data) return <p className="text-ink-500">Cliente não encontrado.</p>;

  const dados = cliente.data;
  const termos = (dados.consent as { termos?: { versao?: string; aceitoEm?: string } }).termos;

  return (
    <>
      <PageHeader
        title={dados.name}
        description={
          dados.anonymizedAt
            ? `Anonimizado em ${formatDateTime(dados.anonymizedAt)}`
            : (dados.email ?? '')
        }
        actions={
          <Link to="/clientes" className="text-brand-700 text-sm font-semibold hover:underline">
            Voltar
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-4">
          <Card title={`Pedidos (${dados.totalPedidos})`}>
            {dados.pedidos.length === 0 ? (
              <p className="text-ink-500 text-sm">Nenhum pedido com esta conta.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-ink-200 divide-y">
                  {dados.pedidos.map((pedido) => (
                    <tr key={pedido.code}>
                      <td className="py-2">
                        <Link
                          to={`/pedidos/${pedido.code}`}
                          className="text-brand-700 font-semibold hover:underline"
                        >
                          {pedido.code}
                        </Link>
                      </td>
                      <td className="py-2">{ORDER_STATUS_LABELS[pedido.status]}</td>
                      <td className="text-ink-500 py-2 text-xs">{formatDate(pedido.createdAt)}</td>
                      <td className="py-2 text-right font-semibold">
                        {formatBRL(pedido.finalValue ?? pedido.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Endereços">
            {dados.addresses.length === 0 ? (
              <p className="text-ink-500 text-sm">Nenhum endereço cadastrado.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {dados.addresses.map((endereco) => (
                  <li key={endereco.id}>
                    <span className="font-semibold">{endereco.label ?? 'Endereço'}</span>
                    {endereco.isDefault ? <span className="text-ink-400"> · padrão</span> : null}
                    <span className="text-ink-600 block">
                      {endereco.street}, {endereco.number}
                      {endereco.complement ? ` (${endereco.complement})` : ''} — {endereco.district}
                      , {endereco.city}/{endereco.uf} · CEP {formatCep(endereco.cep)}
                    </span>
                    {endereco.reference ? (
                      <span className="text-ink-400 block text-xs">{endereco.reference}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Dados">
            <dl className="space-y-2 text-sm">
              <Linha rotulo="WhatsApp" valor={dados.phone ? formatPhoneBR(dados.phone) : '—'} />
              <Linha
                rotulo="E-mail"
                valor={dados.email ? `${dados.email}${dados.emailVerified ? ' ✓' : ''}` : '—'}
              />
              <Linha rotulo="Cadastro" valor={formatDate(dados.createdAt)} />
              <Linha
                rotulo="Último acesso"
                valor={dados.lastLoginAt ? formatDateTime(dados.lastLoginAt) : '—'}
              />
              <Linha rotulo="Sessões abertas" valor={String(dados.sessoesAtivas)} />
              <Linha rotulo="Favoritos" valor={String(dados.favoritos)} />
              <Linha rotulo="Aceita novidades" valor={dados.acceptsMarketing ? 'Sim' : 'Não'} />
              {termos ? (
                <Linha
                  rotulo="Termos"
                  valor={`v${termos.versao ?? '?'}${termos.aceitoEm ? ` em ${formatDate(termos.aceitoEm)}` : ''}`}
                />
              ) : null}
            </dl>
          </Card>

          {can('clientes:editar') && !dados.anonymizedAt ? (
            <Grupo id={id} atual={dados.grupo?.id ?? null} />
          ) : null}
          {can('clientes:lgpd') ? (
            <Lgpd id={id} nome={dados.name} anonimizado={Boolean(dados.anonymizedAt)} />
          ) : null}
        </div>
      </div>
    </>
  );
}

function Grupo({ id, atual }: { id: string; atual: string | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const grupos = useQuery({ queryKey: ['grupos-de-cliente'], queryFn: api.customerGroups });
  const [grupo, setGrupo] = useState(atual ?? '');

  const salvar = useMutation({
    mutationFn: () => api.clientes.mudarGrupo(id, grupo || null),
    onSuccess: () => {
      toast.success('Grupo alterado.');
      void queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  return (
    <Card title="Grupo de preço">
      <Field
        label="Grupo"
        hint="Na v1 a vitrine só mostra o varejo; o grupo passa a valer quando o atacado for ligado."
      >
        <Select value={grupo} onChange={(evento) => setGrupo(evento.target.value)}>
          <option value="">Sem grupo</option>
          {grupos.data?.map((opcao) => (
            <option key={opcao.id} value={opcao.id}>
              {opcao.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        className="mt-3"
        full
        variant="outline"
        onClick={() => salvar.mutate()}
        disabled={salvar.isPending}
      >
        Salvar grupo
      </Button>
    </Card>
  );
}

/**
 * Os dois direitos do titular.
 *
 * Exportar baixa tudo o que a loja guarda. Anonimizar apaga e não volta —
 * por isso pede a palavra digitada, e fica registrado na auditoria com quem
 * fez e quando.
 */
function Lgpd({ id, nome, anonimizado }: { id: string; nome: string; anonimizado: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmacao, setConfirmacao] = useState('');

  const exportar = useMutation({
    mutationFn: () => api.clientes.exportar(id),
    onSuccess: (dados) => {
      const arquivo = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dados-${nome.toLowerCase().replace(/\s+/g, '-')}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Arquivo gerado. A exportação ficou registrada na auditoria.');
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const anonimizar = useMutation({
    mutationFn: () => api.clientes.anonimizar(id),
    onSuccess: (resultado) => {
      toast.success(`Dados apagados. ${resultado.pedidosAnonimizados} pedido(s) ficaram sem nome.`);
      setConfirmacao('');
      void queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  return (
    <Card title="Dados pessoais (LGPD)">
      <Button
        full
        variant="outline"
        icon={<Download className="size-4" aria-hidden />}
        onClick={() => exportar.mutate()}
        disabled={exportar.isPending}
      >
        Exportar todos os dados
      </Button>

      {!anonimizado ? (
        <div className="border-price-200 bg-price-50 mt-4 space-y-2 rounded-md border p-3">
          <p className="text-price-700 flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4" aria-hidden />
            Anonimizar
          </p>
          <p className="text-ink-600 text-xs">
            Apaga nome, e-mail, telefone, endereços, favoritos, sessões e avisos. Os pedidos ficam —
            são registro de venda —, mas sem dizer de quem eram.{' '}
            <strong>Não dá para desfazer.</strong>
          </p>
          <Input
            value={confirmacao}
            onChange={(evento) => setConfirmacao(evento.target.value)}
            placeholder="Digite ANONIMIZAR"
          />
          <Button
            full
            variant="danger"
            disabled={confirmacao !== 'ANONIMIZAR' || anonimizar.isPending}
            onClick={() => anonimizar.mutate()}
          >
            Apagar os dados pessoais
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500 shrink-0">{rotulo}</dt>
      <dd className="text-ink-800 text-right font-medium break-all">{valor}</dd>
    </div>
  );
}
