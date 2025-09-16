'use client';

import type { StoreStatus } from '@aurora/types';
import { ArrowLeft, Menu, Search, ShoppingCart } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useLinkComponent } from '../lib/link';
import { Logo } from './logo';
import { StoreStatusBadge } from './store-status-badge';

export interface HeaderProps {
  /** "home" mostra o logo; "page" mostra voltar + título, como no design. */
  variant?: 'home' | 'page';
  title?: string;
  logoUrl?: string | null;
  cartCount?: number;
  storeStatus?: StoreStatus;
  onMenuClick?: () => void;
  onBackClick?: () => void;
  onSearchClick?: () => void;
  actions?: ReactNode;
  className?: string;
}

export function Header({
  variant = 'home',
  title,
  logoUrl,
  cartCount = 0,
  storeStatus,
  onMenuClick,
  onBackClick,
  onSearchClick,
  actions,
  className,
}: HeaderProps) {
  const Link = useLinkComponent();

  return (
    <header className={cn('bg-brand-600 sticky top-0 z-30 text-white', className)}>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        {variant === 'page' ? (
          <>
            <button
              type="button"
              aria-label="Voltar"
              onClick={onBackClick}
              className="rounded-button -ml-2 flex size-9 items-center justify-center hover:bg-white/10"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </button>
            <h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={onMenuClick}
              className="rounded-button -ml-2 flex size-9 items-center justify-center hover:bg-white/10 md:hidden"
            >
              <Menu className="size-5" aria-hidden />
            </button>

            <Link href="/" className="flex items-center" aria-label="Página inicial">
              <Logo src={logoUrl} variant="onDark" />
            </Link>

            {storeStatus ? (
              <StoreStatusBadge status={storeStatus} className="ml-2 hidden sm:inline-flex" />
            ) : null}

            <div className="flex-1" />
          </>
        )}

        {actions}

        <button
          type="button"
          aria-label="Buscar produtos"
          onClick={onSearchClick}
          className="rounded-button flex size-9 items-center justify-center hover:bg-white/10"
        >
          <Search className="size-5" aria-hidden />
        </button>

        <Link
          href="/carrinho"
          aria-label={`Carrinho com ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`}
          className="rounded-button relative flex size-9 items-center justify-center hover:bg-white/10"
        >
          <ShoppingCart className="size-5" aria-hidden />
          {cartCount > 0 ? (
            <span className="rounded-pill bg-accent-400 text-ink-900 absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center px-1 text-[0.625rem] font-bold">
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          ) : null}
        </Link>
      </div>

      {/* Faixa amarela de assinatura da marca, como no design */}
      <div className="bg-accent-400 h-1" aria-hidden />
    </header>
  );
}
