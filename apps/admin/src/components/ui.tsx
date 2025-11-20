import { cn } from '@aurora/ui';
import { X } from 'lucide-react';
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useEffect, useId } from 'react';

/** Peças de formulário e layout usadas em todo o painel. */

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-card shadow-card bg-white', className)}>
      {(title || actions) && (
        <header className="border-ink-200 flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            {title ? <h2 className="text-ink-800 font-semibold">{title}</h2> : null}
            {description ? <p className="text-ink-500 mt-0.5 text-sm">{description}</p> : null}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="text-ink-700 mb-1 block text-sm font-medium">
        {label}
        {required ? <span className="text-price-500 ml-0.5">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-price-600 mt-1 block text-xs">{error}</span>
      ) : hint ? (
        <span className="text-ink-500 mt-1 block text-xs">{hint}</span>
      ) : null}
    </label>
  );
}

const controlClass =
  'w-full rounded-button border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 ' +
  'placeholder:text-ink-400 focus:border-brand-500 focus:outline-none disabled:bg-ink-100';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, 'min-h-24', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, 'pr-8', className)} {...props} />;
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();

  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'rounded-pill mt-0.5 h-5 w-9 shrink-0 transition-colors',
          checked ? 'bg-brand-600' : 'bg-ink-300',
        )}
      >
        <span
          className={cn(
            'block size-4 rounded-full bg-white transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        <span className="text-ink-700 block text-sm font-medium">{label}</span>
        {hint ? <span className="text-ink-500 block text-xs">{hint}</span> : null}
      </label>
    </div>
  );
}

export function Legend({ children, ...props }: LabelHTMLAttributes<HTMLElement>) {
  return (
    <h3 className="text-ink-500 mb-3 text-xs font-semibold tracking-wide uppercase" {...props}>
      {children}
    </h3>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border-ink-300 border border-dashed px-6 py-10 text-center">
      <p className="text-ink-700 font-medium">{title}</p>
      {description ? <p className="text-ink-500 mt-1 text-sm">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  // Fechar com Esc é o reflexo de quem usa o painel o dia todo.
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bg-ink-900/40 fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('rounded-card shadow-card w-full bg-white', wide ? 'max-w-4xl' : 'max-w-lg')}
      >
        <header className="border-ink-200 flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-ink-800 font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-ink-500 hover:text-ink-800"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="border-ink-200 flex justify-end gap-2 border-t px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return <p className="text-ink-500 text-sm">{total} registro(s)</p>;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-ink-500 text-sm">
        Página {page} de {totalPages} · {total} registro(s)
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-button border-ink-300 border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="rounded-button border-ink-300 border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="text-ink-500 flex items-center gap-2 py-8 text-sm">
      <span
        className="border-ink-300 border-t-brand-600 size-4 animate-spin rounded-full border-2"
        aria-hidden
      />
      {label}
    </div>
  );
}
