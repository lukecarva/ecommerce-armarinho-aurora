'use client';

import { formatBRL } from '@aurora/types';
import { Button, cn } from '@aurora/ui';
import { Ticket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AreaDaConta, ExigeConta } from '@/components/conta-ui';
import { useCarrinho } from '@/lib/carrinho';
import { chamarConta } from '@/lib/conta';

interface CupomDaConta {
  code: string;
  description: string | null;
  type: 'percent' | 'fixed';
  value: number;
  minSubtotal: number | null;
  endsAt: string | null;
  usadosPorVoce: number;
  disponivel: boolean;
}

export default function CuponsPage() {
  return (
    <AreaDaConta titulo="Cupons">
      <ExigeConta>
        <Cupons />
      </ExigeConta>
    </AreaDaConta>
  );
}

function Cupons() {
  const router = useRouter();
  const { aplicarCupom } = useCarrinho();
  const [cupons, setCupons] = useState<CupomDaConta[] | null>(null);

  useEffect(() => {
    void chamarConta<CupomDaConta[]>('/coupons').then((resposta) => {
      setCupons(resposta.ok ? resposta.dados : []);
    });
  }, []);

  if (!cupons) return <p className="text-ink-500 text-sm">Carregando…</p>;

  if (cupons.length === 0) {
    return (
      <div className="rounded-card border-ink-300 border border-dashed bg-white px-6 py-10 text-center">
        <p className="text-ink-700 font-medium">Nenhum cupom no momento.</p>
        <p className="text-ink-500 mt-1 text-sm">
          Quando sair um, ele aparece aqui e nas notificações.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-3">
      {cupons.map((cupom) => (
        <article
          key={cupom.code}
          className={cn(
            'rounded-card shadow-card flex gap-3 bg-white p-4',
            !cupom.disponivel && 'opacity-60',
          )}
        >
          <Ticket className="text-price-500 mt-0.5 size-6 shrink-0" aria-hidden />

          <div className="min-w-0 flex-1">
            <p className="text-ink-900 font-mono text-lg font-bold tracking-wide">{cupom.code}</p>
            <p className="text-ink-800 text-sm font-semibold">
              {cupom.type === 'percent'
                ? `${cupom.value}% de desconto`
                : `${formatBRL(cupom.value)} de desconto`}
              {cupom.minSubtotal ? ` acima de ${formatBRL(cupom.minSubtotal)}` : ''}
            </p>
            {cupom.description ? (
              <p className="text-ink-600 mt-1 text-sm">{cupom.description}</p>
            ) : null}
            {cupom.endsAt ? (
              <p className="text-ink-400 mt-1 text-xs">
                Válido até {new Date(cupom.endsAt).toLocaleDateString('pt-BR')}
              </p>
            ) : null}

            {cupom.disponivel ? (
              <Button
                size="sm"
                className="mt-3"
                onClick={async () => {
                  await aplicarCupom(cupom.code);
                  router.push('/carrinho');
                }}
              >
                Usar no carrinho
              </Button>
            ) : (
              <p className="text-ink-500 mt-2 text-xs font-medium">Você já usou este cupom.</p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
