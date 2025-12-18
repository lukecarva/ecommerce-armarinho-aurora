import { AVAILABILITY_LABELS, formatBRL } from '@aurora/types';
import { Container } from '@aurora/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GradeDeProdutos, Trilha } from '@/components/vitrine';
import { DetalheDoProduto } from '@/components/produto';
import { getProduto, getStore } from '@/lib/api';
import { jsonLd } from '@/lib/json-ld';

/**
 * Página de produto.
 *
 * Revalidada a cada 5 minutos, como a listagem: preço e disponibilidade mudam
 * no painel e precisam chegar rápido à vitrine, mas não a cada visita — o
 * servidor é compartilhado.
 */
export const revalidate = 300;

type Parametros = { params: Promise<{ slug: string }> };

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? '';

export async function generateMetadata({ params }: Parametros): Promise<Metadata> {
  const { slug } = await params;
  const produto = await getProduto(slug);

  if (!produto) return { title: 'Produto não encontrado' };

  const titulo = produto.seo?.title ?? produto.name;
  const descricao =
    produto.seo?.description ??
    produto.shortDesc ??
    `${produto.name} por ${formatBRL(produto.price)} na Armarinho Aurora. ` +
      'Confira e finalize seu pedido pelo WhatsApp.';

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `/produto/${produto.slug}` },
    openGraph: {
      title: titulo,
      description: descricao,
      type: 'website',
      // A foto do produto é o que aparece quando o link é colado no WhatsApp —
      // o canal por onde esta loja vende.
      images: produto.images[0]
        ? [{ url: produto.images[0].url, alt: produto.images[0].alt ?? produto.name }]
        : undefined,
    },
  };
}

export default async function ProdutoPage({ params }: Parametros) {
  const { slug } = await params;

  const [produto, store] = await Promise.all([getProduto(slug), getStore()]);
  if (!produto) notFound();

  const urlDaPagina = `${SITE}/produto/${produto.slug}`;

  return (
    <Container className="py-5">
      <Trilha itens={[...produto.trilha, { name: produto.name, slug: produto.slug }]} />

      <DetalheDoProduto
        produto={produto}
        whatsapp={store.info.whatsapp}
        urlDaPagina={urlDaPagina}
      />

      {produto.relacionados.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-ink-900 mb-3 text-lg font-bold">Quem viu este, viu também</h2>
          <GradeDeProdutos produtos={produto.relacionados} />
        </section>
      ) : null}

      {/* Dados estruturados: é o que faz o preço e a disponibilidade
          aparecerem direto no resultado do Google — o principal canal de
          aquisição de uma loja que fecha a venda no WhatsApp. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: produto.name,
            description: produto.shortDesc ?? produto.description ?? undefined,
            sku: produto.sku ?? undefined,
            brand: produto.marca ? { '@type': 'Brand', name: produto.marca.name } : undefined,
            image: produto.images.map((imagem) => imagem.url),
            offers: {
              '@type': 'Offer',
              url: urlDaPagina,
              priceCurrency: 'BRL',
              // O schema.org pede o preço em unidades, não em centavos.
              price: (produto.price / 100).toFixed(2),
              availability: DISPONIBILIDADE_SCHEMA[produto.availability],
              // Sem checkout no site, a negociação acontece no WhatsApp — é
              // isso que o `seller` representa aqui.
              seller: { '@type': 'Organization', name: store.info.name },
            },
          }),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              ...produto.trilha.map((item, indice) => ({
                '@type': 'ListItem',
                position: indice + 1,
                name: item.name,
                item: `${SITE}/categoria/${item.slug}`,
              })),
              {
                '@type': 'ListItem',
                position: produto.trilha.length + 1,
                name: produto.name,
                item: urlDaPagina,
              },
            ],
          }),
        }}
      />

      <p className="sr-only">{AVAILABILITY_LABELS[produto.availability]}</p>
    </Container>
  );
}

/**
 * Tradução da disponibilidade da loja para o vocabulário do schema.org.
 *
 * "Sob consulta" vira `InStock`: o produto existe e a loja atende — quem
 * decide a quantidade é a conversa no WhatsApp. `PreOrder` ou `BackOrder`
 * prometeriam um fluxo de pedido que esta loja não tem.
 */
const DISPONIBILIDADE_SCHEMA = {
  em_estoque: 'https://schema.org/InStock',
  ultimas_unidades: 'https://schema.org/LimitedAvailability',
  sob_consulta: 'https://schema.org/InStock',
  esgotado: 'https://schema.org/OutOfStock',
} as const;
