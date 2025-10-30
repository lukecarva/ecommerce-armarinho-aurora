'use client';

import type { StoreStatus } from '@aurora/types';
import { Header } from '@aurora/ui';
import { useRouter } from 'next/navigation';
import { useCarrinho } from '@/lib/carrinho';

/**
 * Header da vitrine.
 *
 * Cliente por causa dos handlers de menu e busca. A lupa leva à página de
 * busca, onde o campo já abre com o teclado aberto — no celular é um toque a
 * menos que abrir um campo aqui e depois digitar.
 */
export function SiteHeader({
  storeStatus,
  logoUrl,
}: {
  storeStatus: StoreStatus;
  logoUrl?: string | null;
}) {
  const router = useRouter();
  const { carrinho } = useCarrinho();

  return (
    <Header
      variant="home"
      logoUrl={logoUrl}
      storeStatus={storeStatus}
      cartCount={carrinho.itemCount}
      onSearchClick={() => router.push('/busca')}
    />
  );
}
