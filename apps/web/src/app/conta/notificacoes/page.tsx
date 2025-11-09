'use client';

import { NOTIFICATION_TYPE_LABELS, type NotificationType } from '@aurora/types';
import { cn } from '@aurora/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AreaDaConta, ExigeConta } from '@/components/conta-ui';
import { chamarConta, useConta } from '@/lib/conta';

interface Aviso {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificacoesPage() {
  return (
    <AreaDaConta titulo="Notificações">
      <ExigeConta>
        <Notificacoes />
      </ExigeConta>
    </AreaDaConta>
  );
}

function Notificacoes() {
  const { atualizarNaoLidas } = useConta();
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);

  useEffect(() => {
    void (async () => {
      const resposta = await chamarConta<{ items: Aviso[] }>('/notifications');
      if (!resposta.ok) {
        setAvisos([]);
        return;
      }

      setAvisos(resposta.dados.items);

      // Abrir a tela conta como ler. Os não lidos continuam destacados nesta
      // visita — a marcação só vale para o contador da próxima.
      if (resposta.dados.items.some((aviso) => !aviso.readAt)) {
        const lidas = await chamarConta<{ naoLidas: number }>('/notifications/read', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (lidas.ok) atualizarNaoLidas(lidas.dados.naoLidas);
      }
    })();
  }, [atualizarNaoLidas]);

  if (!avisos) return <p className="text-ink-500 text-sm">Carregando…</p>;

  if (avisos.length === 0) {
    return (
      <div className="rounded-card border-ink-300 border border-dashed bg-white px-6 py-10 text-center">
        <p className="text-ink-700 font-medium">Nada por aqui ainda.</p>
        <p className="text-ink-500 mt-1 text-sm">
          Avisos de pedido e cupons novos aparecem nesta tela.
        </p>
      </div>
    );
  }

  return (
    <ul className="max-w-lg space-y-2">
      {avisos.map((aviso) => {
        const conteudo = (
          <>
            <p className="text-ink-400 text-xs">
              {NOTIFICATION_TYPE_LABELS[aviso.type]} ·{' '}
              {new Date(aviso.createdAt).toLocaleString('pt-BR')}
            </p>
            <p className="text-ink-900 text-sm font-semibold">{aviso.title}</p>
            <p className="text-ink-600 text-sm">{aviso.body}</p>
          </>
        );

        return (
          <li
            key={aviso.id}
            className={cn(
              'rounded-card border-l-4 bg-white p-3',
              aviso.readAt ? 'border-transparent' : 'border-brand-600',
            )}
          >
            {aviso.link ? (
              <Link href={aviso.link} className="block">
                {conteudo}
              </Link>
            ) : (
              conteudo
            )}
          </li>
        );
      })}
    </ul>
  );
}
