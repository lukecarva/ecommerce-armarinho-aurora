'use client';

import { formatBRL } from '@aurora/types';
import { Button } from '@aurora/ui';
import { ImageOff } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AreaDaConta, BotaoPedirDeNovo, ExigeConta } from '@/components/conta-ui';
import { chamarConta } from '@/lib/conta';

interface PedidoResumo {
  code: string;
  statusLabel: string;
  createdAt: string;
  itemCount: number;
  total: number;
  finalValue: number | null;
  preview: Array<{ name: string; imageUrl: string | null }>;
}

export default function PedidosPage() {
  return (
    <AreaDaConta titulo="Meus pedidos">
      <ExigeConta>
        <Pedidos />
      </ExigeConta>
    </AreaDaConta>
  );
}

function Pedidos() {
  const [pedidos, setPedidos] = useState<PedidoResumo[] | null>(null);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const carregar = useCallback(async (numero: number) => {
    const resposta = await chamarConta<{ items: PedidoResumo[]; totalPages: number }>(
      `/orders?page=${numero}`,
    );
    if (!resposta.ok) return;

    setPedidos((atuais) =>
      numero === 1 ? resposta.dados.items : [...(atuais ?? []), ...resposta.dados.items],
    );
    setTotalPaginas(resposta.dados.totalPages);
    setPagina(numero);
  }, []);

  useEffect(() => {
    void carregar(1);
  }, [carregar]);

  if (!pedidos) return <p className="text-ink-500 text-sm">Carregando…</p>;

  if (pedidos.length === 0) {
    return (
      <div className="rounded-card border-ink-300 border border-dashed bg-white px-6 py-10 text-center">
        <p className="text-ink-700 font-medium">Você ainda não fez pedidos com esta conta.</p>
        <Link
          href="/categorias"
          className="text-brand-600 mt-4 inline-block text-sm font-semibold hover:underline"
        >
          Ver o catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pedidos.map((pedido) => (
        <article key={pedido.code} className="rounded-card shadow-card bg-white p-4">
          <Link href={`/conta/pedidos/${pedido.code}`} className="block">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-ink-900 font-bold">{pedido.code}</p>
              <p className="text-ink-900 font-bold">
                {formatBRL(pedido.finalValue ?? pedido.total)}
              </p>
            </div>
            <p className="text-ink-500 text-xs">
              {new Date(pedido.createdAt).toLocaleDateString('pt-BR')} · {pedido.itemCount} item(ns)
              · <span className="text-brand-700 font-semibold">{pedido.statusLabel}</span>
            </p>

            <div className="mt-3 flex gap-2">
              {pedido.preview.map((item, indice) => (
                <span
                  key={indice}
                  title={item.name}
                  className="bg-ink-100 text-ink-400 flex size-12 items-center justify-center overflow-hidden rounded-md"
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <ImageOff className="size-4" aria-hidden />
                  )}
                </span>
              ))}
            </div>
          </Link>

          <BotaoPedirDeNovo code={pedido.code} className="mt-3" />
        </article>
      ))}

      {pagina < totalPaginas ? (
        <Button variant="outline" full onClick={() => void carregar(pagina + 1)}>
          Ver pedidos mais antigos
        </Button>
      ) : null}
    </div>
  );
}
