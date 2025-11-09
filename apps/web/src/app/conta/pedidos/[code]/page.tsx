'use client';

import { formatBRL, formatQuantity, type SaleUnit } from '@aurora/types';
import { buttonVariants } from '@aurora/ui';
import { MessageCircle } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AreaDaConta, BotaoPedirDeNovo, ExigeConta, Mensagem } from '@/components/conta-ui';
import { chamarConta } from '@/lib/conta';

interface PedidoDaConta {
  code: string;
  statusLabel: string;
  createdAt: string;
  delivery: { label: string; note: string | null };
  couponCode: string | null;
  subtotal: number;
  discount: number;
  total: number;
  finalValue: number | null;
  items: Array<{
    name: string;
    variantName?: string | null;
    unit: SaleUnit;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  historico: Array<{ createdAt: string; label: string }>;
  whatsappUrl: string;
}

export default function PedidoDaContaPage() {
  const { code } = useParams<{ code: string }>();

  return (
    <AreaDaConta titulo={`Pedido ${code}`} voltar="/conta/pedidos">
      <ExigeConta>
        <Pedido code={code} />
      </ExigeConta>
    </AreaDaConta>
  );
}

function Pedido({ code }: { code: string }) {
  const [pedido, setPedido] = useState<PedidoDaConta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void chamarConta<PedidoDaConta>(`/orders/${encodeURIComponent(code)}`).then((resposta) => {
      if (resposta.ok) setPedido(resposta.dados);
      else setErro(resposta.erro);
    });
  }, [code]);

  if (erro) return <Mensagem tom="erro">{erro}</Mensagem>;
  if (!pedido) return <p className="text-ink-500 text-sm">Carregando…</p>;

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_18rem] md:items-start">
      <div className="space-y-4">
        <div className="rounded-card bg-white">
          <ul className="divide-ink-200 divide-y">
            {pedido.items.map((item, indice) => (
              <li key={indice} className="flex justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="text-ink-800 font-semibold">{item.name}</p>
                  {item.variantName ? (
                    <p className="text-ink-500 text-xs">{item.variantName}</p>
                  ) : null}
                  <p className="text-ink-500 text-xs">
                    {formatQuantity(item.qty, item.unit)} × {formatBRL(item.unitPrice)}
                  </p>
                </div>
                <p className="text-ink-900 shrink-0 font-bold">{formatBRL(item.lineTotal)}</p>
              </li>
            ))}
          </ul>

          <dl className="border-ink-200 space-y-1 border-t p-4 text-sm">
            <Linha rotulo="Subtotal" valor={formatBRL(pedido.subtotal)} />
            {pedido.discount > 0 ? (
              <Linha
                rotulo={`Desconto${pedido.couponCode ? ` (${pedido.couponCode})` : ''}`}
                valor={`−${formatBRL(pedido.discount)}`}
              />
            ) : null}
            <Linha
              rotulo="Entrega"
              valor={`${pedido.delivery.label}${pedido.delivery.note ? ` — ${pedido.delivery.note}` : ''}`}
            />
            <div className="border-ink-200 text-ink-900 flex justify-between border-t pt-2 font-bold">
              <dt>{pedido.finalValue !== null ? 'Valor combinado' : 'Total estimado'}</dt>
              <dd>{formatBRL(pedido.finalValue ?? pedido.total)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-card bg-white p-4">
          <h2 className="text-ink-900 mb-3 font-bold">Andamento</h2>
          <ol className="space-y-3">
            {pedido.historico.map((passo, indice) => (
              <li key={indice} className="border-brand-200 border-l-2 pl-3">
                <p className="text-ink-800 text-sm font-medium">{passo.label}</p>
                <p className="text-ink-400 text-xs">
                  {new Date(passo.createdAt).toLocaleString('pt-BR')}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <a
          href={pedido.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'whatsapp', full: true })}
        >
          <MessageCircle className="size-5" aria-hidden />
          Falar sobre este pedido
        </a>

        <BotaoPedirDeNovo code={pedido.code} />
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="text-ink-600 flex justify-between gap-3">
      <dt>{rotulo}</dt>
      <dd className="text-right">{valor}</dd>
    </div>
  );
}
