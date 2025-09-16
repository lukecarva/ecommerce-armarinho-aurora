import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** Largura máxima e respiro lateral padrão das páginas. */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4', className)} {...props} />;
}

/** Bloco de carregamento — evita salto de layout (CLS) enquanto os dados chegam. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-ink-200 animate-pulse rounded-md', className)} {...props} />;
}
