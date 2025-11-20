import { formatBRL, ORDER_STATUS_LABELS } from '@aurora/types';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Input, Pagination, Select, Spinner } from '../components/ui';
import { api, type OrderCard } from '../lib/api';
import { formatDateTime } from '../lib/format';

/**
 * Kanban de pedidos.
 *
 * **Por que atualização por intervalo, e não por conexão aberta.** O quadro
 * precisa mostrar o pedido que acabou de chegar sem ninguém recarregar a
 * página. SSE ou WebSocket dariam isso, mas o painel autentica com um token
 * no cabeçalho `Authorization`, e o `EventSource` do navegador não envia
 * cabeçalho — a saída seria pôr o token na URL, onde ele vaza para log de
 * proxy e histórico. Somando isso ao servidor de 1 vCPU compartilhado com
 * outros seis sites, uma consulta a cada dez segundos com duas atendentes
 * abertas é mais barata e muito mais simples do que manter conexões vivas.
 */
const INTERVALO_MS = 10_000;

export function OrdersBoardPage() {
  const quadro = useQuery({
    queryKey: ['pedidos', 'kanban'],
    queryFn: api.pedidos.kanban,
    refetchInterval: INTERVALO_MS,
    // Voltar para a aba deve mostrar o estado de agora, não o de vinte
    // minutos atrás.
    refetchOnWindowFocus: true,
  });

  const recuperacao = useQuery({
    queryKey: ['pedidos', 'recuperacao'],
    queryFn: api.pedidos.recuperacao,
    refetchInterval: INTERVALO_MS * 6,
  });

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Cada card é uma conversa que precisa acontecer no WhatsApp."
        actions={
          <Link
            to="/pedidos/lista"
            className="text-brand-700 text-sm font-semibold hover:underline"
          >
            Ver como lista
          </Link>
        }
      />

      {recuperacao.data && recuperacao.data.items.length > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">
              {recuperacao.data.items.length} pedido(s) sem resposta há mais de{' '}
              {recuperacao.data.horas} h
            </p>
            <p className="mt-0.5 text-amber-800">
              {recuperacao.data.items
                .slice(0, 5)
                .map((pedido) => pedido.code)
                .join(', ')}
              {recuperacao.data.items.length > 5 ? '…' : ''}
            </p>
          </div>
        </div>
      ) : null}

      {quadro.isLoading ? (
        <Spinner label="Carregando o quadro…" />
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {quadro.data?.colunas.map((coluna) => (
              <section key={coluna.key} className="w-72 shrink-0">
                <header className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-ink-800 text-sm font-bold">{coluna.label}</h2>
                  <span className="bg-ink-200 text-ink-700 rounded-full px-2 py-0.5 text-xs font-semibold">
                    {coluna.items.length}
                  </span>
                </header>

                <div className="space-y-2">
                  {coluna.items.length === 0 ? (
                    <p className="border-ink-300 text-ink-400 rounded-lg border border-dashed px-3 py-6 text-center text-xs">
                      Vazio
                    </p>
                  ) : (
                    coluna.items.map((pedido) => <CardDoPedido key={pedido.code} pedido={pedido} />)
                  )}
                </div>
              </section>
            ))}
          </div>

          <p className="text-ink-400 flex items-center gap-1.5 text-xs">
            <RefreshCw
              className={quadro.isFetching ? 'size-3 animate-spin' : 'size-3'}
              aria-hidden
            />
            Atualiza sozinho a cada {INTERVALO_MS / 1000} segundos
            {quadro.data ? ` · última leitura ${formatDateTime(quadro.data.atualizadoEm)}` : ''}
          </p>
        </>
      )}
    </>
  );
}

function CardDoPedido({ pedido }: { pedido: OrderCard }) {
  return (
    <Link
      to={`/pedidos/${pedido.code}`}
      className="border-ink-200 hover:border-brand-500 block rounded-lg border bg-white p-3 shadow-sm transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-ink-900 text-sm font-bold">{pedido.code}</span>
        {pedido.atrasado ? (
          <span
            title="Sem resposta há mais de 24 h"
            className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.625rem] font-bold text-amber-800"
          >
            parado
          </span>
        ) : null}
      </div>

      <p className="text-ink-700 mt-1 truncate text-sm">{pedido.name}</p>
      <p className="text-ink-400 text-xs">{pedido.deliveryLabel}</p>

      <div className="mt-2 flex items-end justify-between">
        <span className="text-ink-900 font-bold">
          {formatBRL(pedido.finalValue ?? pedido.total)}
          {pedido.finalValue !== null ? (
            <span className="text-ink-400 ml-1 text-xs font-normal">fechado</span>
          ) : null}
        </span>

        {pedido.whatsappClickedAt ? (
          <MessageCircle className="size-4 text-emerald-600" aria-label="Abriu o WhatsApp" />
        ) : null}
      </div>

      <p className="text-ink-400 mt-1 text-[0.625rem]">{formatDateTime(pedido.createdAt)}</p>
    </Link>
  );
}

/** A mesma informação em lista, para quem prefere filtrar e buscar. */
export function OrdersListPage() {
  const [params, setParams] = useSearchParams();

  const page = Number(params.get('page') ?? 1);
  const busca = params.get('busca') ?? '';
  const status = params.get('status') ?? '';

  const pedidos = useQuery({
    queryKey: ['pedidos', 'lista', { page, busca, status }],
    queryFn: () =>
      api.pedidos.lista({
        page,
        perPage: 30,
        busca: busca || undefined,
        status: status || undefined,
      }),
  });

  function ajustar(chave: string, valor: string) {
    const proximos = new URLSearchParams(params);
    if (valor) proximos.set(chave, valor);
    else proximos.delete(chave);
    // Mudar filtro volta para a primeira página: a página 4 do filtro
    // anterior quase nunca existe no novo.
    proximos.delete('page');
    setParams(proximos);
  }

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Busque por código, nome ou telefone."
        actions={
          <Link to="/pedidos" className="text-brand-700 text-sm font-semibold hover:underline">
            Ver como quadro
          </Link>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Código, nome ou telefone"
            defaultValue={busca}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') ajustar('busca', evento.currentTarget.value);
            }}
          />

          <Select value={status} onChange={(evento) => ajustar('status', evento.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {pedidos.isLoading ? (
        <Spinner />
      ) : pedidos.data && pedidos.data.items.length > 0 ? (
        <>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-ink-500 text-left text-xs uppercase">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Entrega</th>
                  <th className="px-3 py-2 text-right">Estimado</th>
                  <th className="px-3 py-2 text-right">Fechado</th>
                  <th className="px-3 py-2">Criado</th>
                </tr>
              </thead>
              <tbody className="divide-ink-200 divide-y">
                {pedidos.data.items.map((pedido) => (
                  <tr key={pedido.code} className="hover:bg-ink-50">
                    <td className="px-3 py-2 font-semibold">
                      <Link
                        to={`/pedidos/${pedido.code}`}
                        className="text-brand-700 hover:underline"
                      >
                        {pedido.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {pedido.name}
                      <span className="text-ink-400 block text-xs">{pedido.phone}</span>
                    </td>
                    <td className="px-3 py-2">{ORDER_STATUS_LABELS[pedido.status]}</td>
                    <td className="px-3 py-2">{pedido.deliveryLabel}</td>
                    <td className="px-3 py-2 text-right">{formatBRL(pedido.total)}</td>
                    <td className="px-3 py-2 text-right">
                      {pedido.finalValue === null ? '—' : formatBRL(pedido.finalValue)}
                    </td>
                    <td className="text-ink-500 px-3 py-2 text-xs">
                      {formatDateTime(pedido.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Pagination
            page={pedidos.data.page}
            totalPages={pedidos.data.totalPages}
            total={pedidos.data.total}
            onChange={(proxima) => ajustar('page', String(proxima))}
          />
        </>
      ) : (
        <EmptyState title="Nenhum pedido com esses filtros." />
      )}
    </>
  );
}
