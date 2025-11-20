import {
  acceptsFinalValue,
  formatBRL,
  formatQuantity,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  requiresLostReason,
  type OrderStatus,
} from '@aurora/types';
import { Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '../components/layout';
import { Card, Field, Input, Select, Spinner, Textarea } from '../components/ui';
import { api, type OrderEventDto } from '../lib/api';
import { useAuth } from '../lib/auth';
import { centsToPriceInput, formatDateTime, priceInputToCents } from '../lib/format';
import { useToast } from '../lib/toast';

/**
 * Detalhe do pedido.
 *
 * A tela existe para a atendente fazer três coisas sem sair dela: entender o
 * que a cliente pediu, registrar o que combinou, e fechar com o valor real.
 * A linha do tempo é o que permite outra pessoa assumir o atendimento no dia
 * seguinte sem precisar perguntar nada a ninguém.
 */
export function OrderDetailPage() {
  const { code = '' } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const pedido = useQuery({
    queryKey: ['pedidos', code],
    queryFn: () => api.pedidos.detalhe(code),
  });

  const [nota, setNota] = useState('');

  const anotar = useMutation({
    mutationFn: (texto: string) => api.pedidos.anotar(code, texto),
    onSuccess: () => {
      setNota('');
      toast.success('Anotado.');
      void queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  if (pedido.isLoading) return <Spinner />;
  if (!pedido.data) return <p className="text-ink-500">Pedido não encontrado.</p>;

  const dados = pedido.data;
  const podeEditar = can('pedidos:editar');

  return (
    <>
      <PageHeader
        title={dados.code}
        description={`${dados.name} · ${dados.phone}`}
        actions={
          <Link to="/pedidos" className="text-brand-700 text-sm font-semibold hover:underline">
            Voltar ao quadro
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-4">
          <Card title="Itens">
            <table className="w-full text-sm">
              <tbody className="divide-ink-200 divide-y">
                {dados.items.map((item, indice) => (
                  <tr key={indice}>
                    <td className="py-2">
                      <span className="text-ink-800 font-medium">{item.name}</span>
                      {item.variantName ? (
                        <span className="text-ink-400 block text-xs">{item.variantName}</span>
                      ) : null}
                    </td>
                    <td className="text-ink-500 py-2 text-right text-xs whitespace-nowrap">
                      {formatQuantity(item.qty, item.unit)} × {formatBRL(item.unitPrice)}
                    </td>
                    <td className="py-2 text-right font-semibold">{formatBRL(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-ink-300 border-t-2">
                <tr>
                  <td colSpan={2} className="text-ink-600 py-2">
                    Subtotal
                  </td>
                  <td className="py-2 text-right">{formatBRL(dados.subtotal)}</td>
                </tr>
                {dados.discount > 0 ? (
                  <tr>
                    <td colSpan={2} className="py-2 text-emerald-700">
                      Desconto {dados.couponCode ? `(${dados.couponCode})` : ''}
                    </td>
                    <td className="py-2 text-right text-emerald-700">
                      −{formatBRL(dados.discount)}
                    </td>
                  </tr>
                ) : null}
                <tr className="text-ink-900 font-bold">
                  <td colSpan={2} className="py-2">
                    Total estimado
                  </td>
                  <td className="py-2 text-right">{formatBRL(dados.total)}</td>
                </tr>
                {dados.finalValue !== null ? (
                  <tr className="font-bold text-emerald-700">
                    <td colSpan={2} className="py-2">
                      Valor fechado
                    </td>
                    <td className="py-2 text-right">{formatBRL(dados.finalValue)}</td>
                  </tr>
                ) : null}
              </tfoot>
            </table>
          </Card>

          <Card title="Linha do tempo">
            <ol className="space-y-3">
              {dados.timeline.map((evento) => (
                <li key={evento.id} className="border-ink-200 border-l-2 pl-3">
                  <p className="text-ink-800 text-sm">{descrever(evento)}</p>
                  <p className="text-ink-400 text-xs">
                    {formatDateTime(evento.createdAt)}
                    {evento.actor ? ` · ${evento.actor}` : ''}
                  </p>
                </li>
              ))}
            </ol>

            {podeEditar ? (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(evento) => {
                  evento.preventDefault();
                  if (nota.trim()) anotar.mutate(nota);
                }}
              >
                <Textarea
                  rows={2}
                  value={nota}
                  onChange={(evento) => setNota(evento.target.value)}
                  placeholder="Nota interna — o cliente não vê"
                  className="flex-1"
                />
                <Button type="submit" variant="outline" disabled={!nota.trim() || anotar.isPending}>
                  Anotar
                </Button>
              </form>
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          {podeEditar ? <MudarStatus code={code} atual={dados.status} /> : null}

          <Card title="Contato">
            <dl className="space-y-2 text-sm">
              <Linha rotulo="Nome" valor={dados.name} />
              <Linha rotulo="WhatsApp" valor={dados.phone} />
              {dados.email ? <Linha rotulo="E-mail" valor={dados.email} /> : null}
              <Linha rotulo="Entrega" valor={dados.deliveryLabel} />
              {dados.deliveryNote ? <Linha rotulo="Bairro" valor={dados.deliveryNote} /> : null}
              {dados.notesCustomer ? (
                <Linha rotulo="Observação" valor={dados.notesCustomer} />
              ) : null}
              <Linha rotulo="Criado" valor={formatDateTime(dados.createdAt)} />
              <Linha
                rotulo="Abriu o WhatsApp"
                valor={
                  dados.whatsappClickedAt ? formatDateTime(dados.whatsappClickedAt) : 'ainda não'
                }
              />
              {dados.lostReason ? (
                <Linha rotulo="Motivo da perda" valor={dados.lostReason} />
              ) : null}
            </dl>

            <div className="mt-4 space-y-2">
              <a
                href={`https://wa.me/${dados.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:underline"
              >
                <MessageCircle className="size-4" aria-hidden />
                Abrir conversa
              </a>

              <a
                href={`${import.meta.env.VITE_SITE_URL ?? ''}/p/${dados.code}?t=${dados.publicToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-700 flex items-center gap-2 text-sm font-semibold hover:underline"
              >
                <ExternalLink className="size-4" aria-hidden />
                Ver a página que o cliente vê
              </a>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function MudarStatus({ code, atual }: { code: string; atual: OrderStatus }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<OrderStatus>(atual);
  const [motivo, setMotivo] = useState('');
  const [valor, setValor] = useState('');

  const salvar = useMutation({
    mutationFn: () =>
      api.pedidos.mudarStatus(code, {
        status,
        lostReason: motivo || undefined,
        finalValue: valor ? priceInputToCents(valor) : undefined,
      }),
    onSuccess: () => {
      toast.success('Pedido atualizado.');
      void queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const precisaMotivo = requiresLostReason(status);
  const aceitaValor = acceptsFinalValue(status);

  return (
    <Card title="Mover o pedido">
      <form
        className="space-y-3"
        onSubmit={(evento) => {
          evento.preventDefault();
          salvar.mutate();
        }}
      >
        <Field label="Status">
          <Select
            value={status}
            onChange={(evento) => setStatus(evento.target.value as OrderStatus)}
          >
            {ORDER_STATUSES.map((valor) => (
              <option key={valor} value={valor}>
                {ORDER_STATUS_LABELS[valor]}
              </option>
            ))}
          </Select>
        </Field>

        {precisaMotivo ? (
          <Field
            label="Motivo"
            hint="Obrigatório. É o que o relatório usa para explicar a venda perdida."
          >
            <Input
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Ex.: achou mais barato / desistiu"
            />
          </Field>
        ) : null}

        {aceitaValor ? (
          <Field label="Valor fechado" hint="O que a loja realmente vendeu, já negociado.">
            <Input
              inputMode="decimal"
              value={valor}
              onChange={(evento) => setValor(evento.target.value)}
              placeholder={centsToPriceInput(0)}
            />
          </Field>
        ) : null}

        <Button type="submit" full disabled={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>
    </Card>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500 shrink-0">{rotulo}</dt>
      <dd className="text-ink-800 text-right font-medium">{valor}</dd>
    </div>
  );
}

/** Traduz o evento para uma frase que a atendente entende de relance. */
function descrever(evento: OrderEventDto): string {
  const dados = (evento.payload ?? {}) as Record<string, unknown>;

  switch (evento.type) {
    case 'criado':
      return `Pedido criado com ${String(dados.itens ?? '?')} item(ns).`;
    case 'status_alterado': {
      const de = ORDER_STATUS_LABELS[dados.de as OrderStatus] ?? String(dados.de);
      const para = ORDER_STATUS_LABELS[dados.para as OrderStatus] ?? String(dados.para);
      const motivo = dados.motivo ? ` — ${String(dados.motivo)}` : '';
      return `${de} → ${para}${motivo}`;
    }
    case 'nota_interna':
      return String(dados.texto ?? '');
    case 'whatsapp_aberto':
      return 'O cliente abriu o WhatsApp.';
    case 'email_enviado':
      return `E-mail de confirmação enviado${dados.para ? ` para ${String(dados.para)}` : ''}.`;
    case 'valor_fechado':
      return `Valor fechado: ${formatBRL(Number(dados.valor ?? 0))}`;
    default:
      return evento.type;
  }
}
