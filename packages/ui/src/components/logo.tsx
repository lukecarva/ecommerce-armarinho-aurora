import { cn } from '../lib/cn';

export interface LogoProps {
  /** URL enviada pelo painel (Identidade Visual). Sem ela, cai no wordmark. */
  src?: string | null;
  variant?: 'onDark' | 'onLight';
  className?: string;
}

/**
 * Logo da loja.
 *
 * Enquanto o arquivo oficial não for enviado pelo painel, renderiza um
 * wordmark tipográfico com as cores da marca. Nenhum arquivo de logo é
 * versionado no repositório — a marca é conteúdo, não código.
 */
export function Logo({ src, variant = 'onDark', className }: LogoProps) {
  if (src) {
    return (
      <img
        src={src}
        alt="Armarinho Aurora"
        className={cn('h-9 w-auto object-contain', className)}
      />
    );
  }

  const onDark = variant === 'onDark';

  return (
    <span
      className={cn('flex flex-col leading-none', className)}
      aria-label="Armarinho Aurora"
      role="img"
    >
      <span
        className={cn(
          'text-lg font-extrabold tracking-tight',
          onDark ? 'text-white' : 'text-brand-600',
        )}
      >
        Center<span className="text-accent-400">Panos</span>
      </span>
      <span
        className={cn(
          'text-[0.5rem] font-semibold tracking-[0.22em] uppercase',
          onDark ? 'text-brand-100' : 'text-ink-500',
        )}
      >
        São Paulo
      </span>
    </span>
  );
}
