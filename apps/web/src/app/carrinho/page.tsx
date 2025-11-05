import { Container, StoreStatusBadge } from '@aurora/ui';
import type { Metadata } from 'next';
import { Checkout } from '@/components/checkout';
import { getStore } from '@/lib/api';

/**
 * O carrinho é de uma pessoa só — não há o que indexar, e a página que o robô
 * do Google veria seria sempre a vazia.
 */
export const metadata: Metadata = {
  title: 'Seu carrinho',
  robots: { index: false, follow: true },
};

export default async function CarrinhoPage() {
  const store = await getStore();

  return (
    <Container className="py-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-ink-900 text-xl font-bold">Seu carrinho</h1>
        <StoreStatusBadge status={store.status} />
      </div>

      <Checkout formasDeEntrega={store.deliveryMethods} storeStatus={store.status} />
    </Container>
  );
}
