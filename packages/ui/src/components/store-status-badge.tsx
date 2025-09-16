import type { StoreStatus } from '@aurora/types';
import { cn } from '../lib/cn';

/**
 * Indicador de loja aberta ou fechada.
 *
 * Com um único número de WhatsApp, dizer quando a resposta vem é parte do
 * atendimento: o cliente que envia um pedido às 23h precisa saber que será
 * respondido de manhã, em vez de achar que foi ignorado.
 */
export function StoreStatusBadge({
  status,
  className,
}: {
  status: StoreStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded-pill inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium',
        status.isOpen ? 'bg-stock-50 text-stock-600' : 'bg-ink-100 text-ink-600',
        className,
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', status.isOpen ? 'bg-stock-500' : 'bg-ink-400')}
        aria-hidden
      />
      {status.label}
    </span>
  );
}
