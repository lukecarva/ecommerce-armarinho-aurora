'use client';

import { LinkProvider, type LinkProps } from '@aurora/ui';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { CarrinhoProvider } from '@/lib/carrinho';
import { ContaProvider } from '@/lib/conta';

/**
 * Injeta o `next/link` no design system.
 *
 * Assim os componentes compartilhados não precisam conhecer o Next: o admin
 * injeta o próprio roteador e reaproveita os mesmos cards e botões.
 */
function NextLinkAdapter({ href, ...props }: LinkProps) {
  return <NextLink href={href} {...props} />;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LinkProvider component={NextLinkAdapter}>
      {/* A conta fica dentro do carrinho: entrar e sair mudam a sacola. */}
      <CarrinhoProvider>
        <ContaProvider>{children}</ContaProvider>
      </CarrinhoProvider>
    </LinkProvider>
  );
}
