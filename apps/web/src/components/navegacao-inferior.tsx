'use client';

import { BottomNav, type BottomNavKey } from '@aurora/ui';
import { usePathname } from 'next/navigation';

/** Marca no menu de baixo a seção que está aberta. */
export function NavegacaoInferior() {
  const pathname = usePathname();

  return <BottomNav active={secaoDe(pathname)} />;
}

function secaoDe(pathname: string): BottomNavKey {
  if (pathname.startsWith('/favoritos')) return 'favoritos';
  if (pathname.startsWith('/carrinho')) return 'carrinho';
  if (pathname.startsWith('/conta')) return 'conta';
  // Produto e busca vivem dentro da navegação do catálogo: manter "Categorias"
  // aceso diz de onde a pessoa veio, em vez de apagar tudo.
  if (
    pathname.startsWith('/categoria') ||
    pathname.startsWith('/produto') ||
    pathname.startsWith('/busca') ||
    pathname.startsWith('/ofertas')
  ) {
    return 'categorias';
  }
  return 'inicio';
}
