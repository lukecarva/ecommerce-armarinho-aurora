import { buildContactUrl } from '@aurora/types';
import { BottomNavSpacer, Footer } from '@aurora/ui';
import type { Metadata, Viewport } from 'next';
import { NavegacaoInferior } from '@/components/navegacao-inferior';
import { SiteHeader } from '@/components/site-header';
import { Providers } from '@/components/providers';
import { getStore } from '@/lib/api';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Armarinho Aurora — O Supermercado do Artesanato',
    template: '%s | Armarinho Aurora',
  },
  description:
    'Tecidos, fios, barbantes, aviamentos, máquinas e workshops em São Paulo. ' +
    'Monte seu pedido pelo site e finalize pelo WhatsApp.',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Armarinho Aurora',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#1B3A8C',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await getStore();

  return (
    <html lang="pt-BR">
      <body className="bg-ink-100 min-h-dvh antialiased">
        <Providers>
          <SiteHeader storeStatus={store.status} logoUrl={store.branding.logoPrincipal} />

          <main className="min-h-[60vh]">{children}</main>

          <Footer
            store={store.info}
            scheduleLines={store.scheduleLines}
            whatsappUrl={buildContactUrl(store.info.whatsapp)}
            logoUrl={store.branding.logoRodape}
          />

          <BottomNavSpacer />
          <NavegacaoInferior />
        </Providers>
      </body>
    </html>
  );
}
