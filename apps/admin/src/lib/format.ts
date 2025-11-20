import { formatBRL, parseBRL, type Cents } from '@aurora/types';

export { formatBRL, parseBRL };

/** Data e hora no padrão brasileiro. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString('pt-BR');
}

/** "2026-09-08T00:00:00Z" → "2026-09-08", para `<input type="date">`. */
export function toDateInput(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/** Campo de preço: aceita o que a pessoa digitar e devolve centavos. */
export function priceInputToCents(value: string): Cents {
  return parseBRL(value) ?? 0;
}

/** Centavos → texto editável no input ("15,90"). */
export function centsToPriceInput(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
