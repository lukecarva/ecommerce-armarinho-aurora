import { MIN_SEARCH_LENGTH, sanitizeSearchTerm } from '@aurora/types';
import { Container } from '@aurora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CampoDeBusca } from '@/components/busca';
import { GradeDeProdutos } from '@/components/vitrine';
import { getBusca } from '@/lib/api';

type Parametros = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Resultado de busca não entra no índice do Google.
 *
 * Página de busca gera uma URL diferente por termo digitado, todas com o mesmo
 * conteúdo remontado. Indexá-las divide a autoridade do site entre milhares de
 * páginas rasas e concorre com as categorias, que são as que devem ranquear.
 */
export const metadata: Metadata = {
  title: 'Busca',
  robots: { index: false, follow: true },
};

export default async function BuscaPage({ searchParams }: Parametros) {
  const params = await searchParams;
  const termo = sanitizeSearchTerm(primeiro(params.q) ?? '');
  const ordenar = primeiro(params.ordenar);

  const buscou = termo.length >= MIN_SEARCH_LENGTH;
  const resultado = buscou
    ? await getBusca({ q: termo, ordenar, page: primeiro(params.page) })
    : null;

  return (
    <Container className="py-5">
      <h1 className="text-ink-900 mb-3 text-xl font-bold">
        {buscou ? <>Resultados para “{termo}”</> : 'O que você procura?'}
      </h1>

      <CampoDeBusca termoInicial={termo} autoFocus={!buscou} className="mb-5" />

      {!buscou ? (
        <p className="text-ink-500 text-sm">
          Digite ao menos {MIN_SEARCH_LENGTH} letras. Pode escrever sem acento e sem medo de errar —
          a busca entende.
        </p>
      ) : resultado && resultado.total > 0 ? (
        <>
          <p className="text-ink-500 mb-4 text-sm">{resultado.total} produto(s) encontrado(s)</p>
          <GradeDeProdutos produtos={resultado.items} />
        </>
      ) : (
        <SemResultado termo={termo} sugestoes={resultado?.sugestoes ?? []} />
      )}
    </Container>
  );
}

function SemResultado({ termo, sugestoes }: { termo: string; sugestoes: string[] }) {
  return (
    <div className="rounded-card border-ink-300 border border-dashed bg-white px-6 py-10 text-center">
      <p className="text-ink-700 font-medium">Nada encontrado para “{termo}”.</p>

      {sugestoes.length > 0 ? (
        <div className="mt-4">
          <p className="text-ink-500 text-sm">Você quis dizer:</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {sugestoes.map((sugestao) => (
              <Link
                key={sugestao}
                href={`/busca?q=${encodeURIComponent(sugestao)}`}
                className="rounded-pill border-ink-300 text-ink-700 hover:border-brand-500 border px-3 py-1.5 text-sm"
              >
                {sugestao}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-ink-500 mt-1 text-sm">
          Tente outra palavra — ou fale com a gente pelo WhatsApp que a gente procura para você.
        </p>
      )}

      <Link
        href="/categorias"
        className="text-brand-600 mt-6 inline-block text-sm font-semibold hover:underline"
      >
        Ver todas as categorias
      </Link>
    </div>
  );
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}
