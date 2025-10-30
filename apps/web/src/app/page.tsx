import { CategoryCard, Container } from '@aurora/ui';
import Link from 'next/link';
import { CarrosselDeProdutos, GradeDeProdutos } from '@/components/vitrine';
import { getHome } from '@/lib/api';

/**
 * A home é revalidada a cada 5 minutos: promoção que entra ou sai não pode
 * demorar para aparecer, mas também não vale gerar a página a cada visita —
 * o servidor divide 1 vCPU com outros seis sites.
 */
export const revalidate = 300;

export default async function HomePage() {
  const { categorias, ofertas, colecoes, novidades } = await getHome();

  return (
    <Container className="space-y-8 py-5">
      <section className="rounded-card bg-brand-600 overflow-hidden px-6 py-8 text-white">
        <h1 className="text-2xl leading-tight font-bold">
          Tudo para
          <br />
          suas criações
          <br />
          estão aqui!
        </h1>
        <p className="text-brand-100 mt-3 max-w-md text-sm">
          Qualidade, variedade e o melhor atendimento para você.
        </p>
        <Link
          href="/categorias"
          className="rounded-button bg-accent-400 text-ink-900 mt-5 inline-flex h-10 items-center px-4 text-sm font-bold"
        >
          VER NOVIDADES
        </Link>
      </section>

      {categorias.length > 0 ? (
        <section>
          <Cabecalho titulo="Categorias" href="/categorias" acao="Ver todas" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {categorias.map((categoria) => (
              <CategoryCard key={categoria.id} category={categoria} />
            ))}
          </div>
        </section>
      ) : null}

      {ofertas.length > 0 ? (
        <section>
          <Cabecalho titulo="Ofertas da semana" href="/ofertas" acao="Ver todas" />
          <CarrosselDeProdutos produtos={ofertas} />
        </section>
      ) : null}

      {colecoes.length > 0 ? (
        <section>
          <Cabecalho titulo="Coleções" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {colecoes.map((colecao) => (
              <Link
                key={colecao.id}
                href={`/colecao/${colecao.slug}`}
                className="rounded-card shadow-card group block overflow-hidden bg-white"
              >
                <span className="bg-ink-100 block aspect-[4/3] w-full overflow-hidden">
                  {colecao.bannerUrl ? (
                    <img
                      src={colecao.bannerUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : null}
                </span>
                <span className="text-ink-700 block px-3 py-2.5 text-sm font-semibold">
                  {colecao.name}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {novidades.length > 0 ? (
        <section>
          <Cabecalho titulo="Novidades" href="/categorias" acao="Ver o catálogo" />
          <GradeDeProdutos produtos={novidades.slice(0, 8)} />
        </section>
      ) : null}

      {categorias.length === 0 && novidades.length === 0 ? (
        <section className="rounded-card border-ink-300 text-ink-600 border border-dashed bg-white p-6 text-center text-sm">
          <p className="text-ink-800 font-semibold">O catálogo está sendo montado.</p>
          <p className="mt-1">
            Enquanto isso, fale com a gente pelo WhatsApp — temos tudo para o seu artesanato.
          </p>
        </section>
      ) : null}
    </Container>
  );
}

function Cabecalho({ titulo, href, acao }: { titulo: string; href?: string; acao?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-ink-800 text-base font-bold">{titulo}</h2>
      {href && acao ? (
        <Link href={href} className="text-brand-600 text-sm font-semibold hover:underline">
          {acao}
        </Link>
      ) : null}
    </div>
  );
}
