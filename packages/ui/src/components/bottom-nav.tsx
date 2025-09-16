'use client';

import { Grid2X2, Heart, Home, ShoppingCart, User } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../lib/cn';
import { useLinkComponent } from '../lib/link';

export type BottomNavKey = 'inicio' | 'categorias' | 'carrinho' | 'favoritos' | 'conta';

interface NavItem {
  key: BottomNavKey;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

const ITEMS: NavItem[] = [
  { key: 'inicio', label: 'Início', href: '/', icon: Home },
  { key: 'categorias', label: 'Categorias', href: '/categorias', icon: Grid2X2 },
  { key: 'carrinho', label: 'Carrinho', href: '/carrinho', icon: ShoppingCart },
  { key: 'favoritos', label: 'Favoritos', href: '/favoritos', icon: Heart },
  { key: 'conta', label: 'Conta', href: '/conta', icon: User },
];

export interface BottomNavProps {
  active?: BottomNavKey;
  cartCount?: number;
  favoritesCount?: number;
  className?: string;
}

/**
 * Navegação inferior fixa — a estrutura de app do design.
 *
 * Só aparece no mobile; a partir de `md` a navegação vive no header.
 */
export function BottomNav({
  active,
  cartCount = 0,
  favoritesCount = 0,
  className,
}: BottomNavProps) {
  const Link = useLinkComponent();

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'border-ink-200 shadow-nav fixed inset-x-0 bottom-0 z-40 border-t bg-white md:hidden',
        'pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      <ul className="mx-auto flex h-[4.25rem] max-w-lg items-stretch">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          const count =
            item.key === 'carrinho' ? cartCount : item.key === 'favoritos' ? favoritesCount : 0;

          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium',
                  isActive ? 'text-brand-600' : 'text-ink-500',
                )}
              >
                <span className="relative">
                  <Icon className="size-5" aria-hidden />
                  {count > 0 ? (
                    <span
                      className="rounded-pill bg-accent-400 text-ink-900 absolute -top-1.5 -right-2.5 flex min-w-4 items-center justify-center px-1 text-[0.625rem] font-bold"
                      aria-label={`${count} ${count === 1 ? 'item' : 'itens'}`}
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Espaçador para o conteúdo não ficar sob a navegação fixa. */
export function BottomNavSpacer() {
  return <div className="h-[4.25rem] md:hidden" aria-hidden />;
}
