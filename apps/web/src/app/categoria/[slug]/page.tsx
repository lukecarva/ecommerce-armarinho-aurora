import { Container } from '@aurora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Listagem } from '@/components/listagem';
import { Trilha } from '@/components/vitrine';
import { getCategoria, getFacetas, getProdutos } from '@/lib/api';

/** A listagem é revalidada a cada 5 minutos, como a home. */
export const revalidate = 300;

type Parametros = { params: Promise<{ slug: string }>; searchParams: Promise<Busca> };
type Busca = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: Parametros): Promise<Metadata> {
  const { slug } = await params;
  const categoria = await getCategoria(slug);

  if (!categoria) return { title: 'Categoria não encontrada' };

  const titulo = categoria.seo?.title ?? categoria.name;
  const descricao =
    categoria.seo?.description ??
    `${categoria.name} na Armarinho Aurora. Confira preços e disponibilidade e finalize pelo WhatsApp.`;

  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `/categoria/${categoria.slug}` },
    openGraph: { title: titulo, description: descricao },
  };
}

export default async function CategoriaPage({ params, searchParams }: Parametros) {
  const { slug } = await params;
  const busca = await searchParams;

  const categoria = await getCategoria(slug);
  if (!categoria) notFound();

  const consulta = { ...paraConsulta(busca), categoria: slug };

  // Lista e filtros em paralelo: são independentes, e o servidor tem um núcleo
  // só — encadear dobraria o tempo até a primeira pintura.
  const [lista, facetas] = await Promise.all([getProdutos(consulta), getFacetas(consulta)]);

  return (
    <Container className="py-5">
      <Trilha itens={categoria.trilha} />

      <h1 className="text-ink-900 mb-1 text-xl font-bold">{categoria.name}</h1>
      <p className="text-ink-500 mb-4 text-sm">{lista.total} produto(s) disponíveis</p>

      {categoria.children.length > 0 ? (
        <nav aria-label="Subcategorias" className="mb-5 flex flex-wrap gap-2">
          {categoria.children.map((filha) => (
            <Link
              key={filha.id}
              href={`/categoria/${filha.slug}`}
              className="rounded-pill border-ink-300 text-ink-700 hover:border-brand-500 border bg-white px-3 py-1.5 text-sm"
            >
              {filha.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <Listagem
        produtos={lista.items}
        facetas={facetas}
        total={lista.total}
        pagina={lista.page}
        totalPaginas={lista.totalPages}
      />

      {/* Dados estruturados: é o que faz a categoria aparecer bem no Google,
          principal canal de aquisição de uma loja sem checkout no site. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: categoria.trilha.map((item, indice) => ({
              '@type': 'ListItem',
              position: indice + 1,
              name: item.name,
              item: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/categoria/${item.slug}`,
            })),
          }),
        }}
      />
    </Container>
  );
}

/**
 * Repassa os parâmetros da URL para a API.
 *
 * Arrays continuam arrays: um atributo escolhido duas vezes chega como
 * parâmetro repetido, e não juntado por vírgula — que quebraria "1,50m".
 */
function paraConsulta(busca: Busca): Record<string, string | string[] | undefined> {
  const consulta: Record<string, string | string[] | undefined> = {};

  for (const [chave, valor] of Object.entries(busca)) {
    if (valor !== undefined) consulta[chave] = valor;
  }

  return consulta;
}
