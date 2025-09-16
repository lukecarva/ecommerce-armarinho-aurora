import { AVAILABILITY_LABELS, type Availability } from '@aurora/types';
import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const badge = cva(
  'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-medium leading-5',
  {
    variants: {
      tone: {
        neutral: 'bg-ink-100 text-ink-600',
        brand: 'bg-brand-50 text-brand-700',
        stock: 'bg-stock-50 text-stock-600',
        warning: 'bg-accent-50 text-accent-700',
        price: 'bg-price-50 text-price-600',
        solidPrice: 'bg-price-500 text-white',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

const AVAILABILITY_TONE: Record<Availability, NonNullable<BadgeProps['tone']>> = {
  em_estoque: 'stock',
  ultimas_unidades: 'warning',
  sob_consulta: 'brand',
  esgotado: 'neutral',
};

/**
 * Disponibilidade do produto.
 *
 * Nunca exibe a quantidade: como o pagamento acontece no WhatsApp, não há
 * risco de oversell, e mostrar só o estado torna a defasagem do estoque
 * irrelevante para o cliente.
 */
export function AvailabilityBadge({
  availability,
  className,
}: {
  availability: Availability;
  className?: string;
}) {
  return (
    <Badge tone={AVAILABILITY_TONE[availability]} className={className}>
      {AVAILABILITY_LABELS[availability]}
    </Badge>
  );
}
