import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

const button = cva(
  'inline-flex items-center justify-center gap-2 font-semibold transition-colors ' +
    'disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        /** Ação principal do design: amarelo com texto escuro. */
        primary: 'bg-accent-400 text-ink-900 hover:bg-accent-500 active:bg-accent-600',
        /** Azul da marca, para ações secundárias em fundo claro. */
        secondary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
        /** Verde oficial do WhatsApp — usado só no checkout e na compra rápida. */
        whatsapp: 'bg-whatsapp text-white hover:bg-whatsapp-dark active:bg-whatsapp-dark',
        outline: 'border border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
        ghost: 'text-ink-600 hover:bg-ink-100',
        danger: 'bg-price-500 text-white hover:bg-price-600',
      },
      size: {
        sm: 'h-9 rounded-button px-3 text-sm',
        md: 'h-11 rounded-button px-4 text-sm',
        lg: 'h-12 rounded-button px-5 text-base',
        icon: 'h-10 w-10 rounded-button',
      },
      full: {
        true: 'w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  /** Ícone à esquerda do texto. */
  icon?: ReactNode;
}

export function Button({ className, variant, size, full, icon, children, ...props }: ButtonProps) {
  return (
    <button className={cn(button({ variant, size, full }), className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

export { button as buttonVariants };
