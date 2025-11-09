import type { Metadata } from 'next';

/**
 * A área do cliente é de uma pessoa só e depende da sessão dela: não há o que
 * indexar, e o robô do Google veria sempre a tela de entrada.
 */
export const metadata: Metadata = {
  title: 'Minha conta',
  robots: { index: false, follow: false },
};

export default function ContaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
