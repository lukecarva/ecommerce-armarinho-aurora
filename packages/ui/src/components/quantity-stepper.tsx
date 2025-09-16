'use client';

import {
  SALE_UNIT_LABELS,
  decrementQuantity,
  formatQuantity,
  incrementQuantity,
  normalizeQuantity,
  type QuantityRules,
  type SaleUnit,
} from '@aurora/types';
import { Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '../lib/cn';

export interface QuantityStepperProps {
  value: number;
  onChange: (quantity: number) => void;
  unit: SaleUnit;
  rules: QuantityRules;
  disabled?: boolean;
  className?: string;
}

/**
 * Seletor de quantidade que respeita a unidade de venda.
 *
 * Para tecido, anda de meio em meio metro; para pacote, de um em um. O valor
 * digitado à mão é normalizado ao sair do campo — quem escreve "2,3" em um
 * tecido de passo 0,5 recebe 2,5, e não um pedido impossível de atender.
 */
export function QuantityStepper({
  value,
  onChange,
  unit,
  rules,
  disabled,
  className,
}: QuantityStepperProps) {
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const labels = SALE_UNIT_LABELS[unit];

  const atMinimum = value <= rules.min;
  const atMaximum = rules.max !== undefined && value >= rules.max;

  function commitDraft() {
    if (draft === null) return;
    const parsed = Number(draft.replace(',', '.'));
    onChange(normalizeQuantity(Number.isFinite(parsed) ? parsed : value, rules));
    setDraft(null);
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="rounded-button border-ink-300 flex h-12 items-center border bg-white">
        <button
          type="button"
          aria-label={`Diminuir ${labels.singular}`}
          className="text-ink-600 flex h-full w-11 items-center justify-center disabled:opacity-40"
          onClick={() => onChange(decrementQuantity(value, rules))}
          disabled={disabled || atMinimum}
        >
          <Minus className="size-4" aria-hidden />
        </button>

        <input
          id={inputId}
          inputMode="decimal"
          aria-label={`Quantidade em ${labels.plural}`}
          className="border-ink-200 text-ink-900 h-full w-14 border-x text-center text-base font-semibold outline-none"
          value={draft ?? formatDecimal(value)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitDraft();
          }}
          disabled={disabled}
        />

        <button
          type="button"
          aria-label={`Aumentar ${labels.singular}`}
          className="text-ink-600 flex h-full w-11 items-center justify-center disabled:opacity-40"
          onClick={() => onChange(incrementQuantity(value, rules))}
          disabled={disabled || atMaximum}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      <span className="text-ink-500 text-sm" aria-live="polite">
        {formatQuantity(value, unit)}
      </span>
    </div>
  );
}

function formatDecimal(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}
