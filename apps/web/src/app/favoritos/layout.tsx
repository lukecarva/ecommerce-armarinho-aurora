import type { Metadata } from 'next';

/**
 * A lista de favoritos é de uma pessoa só e vive no navegador dela — não há
 * o que indexar, e a página renderizada pelo robô do Google seria sempre a
 * vazia.
 */
export const metadata: Metadata = {
  title: 'Meus favoritos',
  robots: { index: false, follow: true },
};

export default function FavoritosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
