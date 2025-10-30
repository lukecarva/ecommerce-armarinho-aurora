import { Container } from '@aurora/ui';
import type { Metadata } from 'next';
import { Listagem } from '@/components/listagem';
import { getFacetas, getProdutos } from '@/lib/api';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Ofertas',
  description:
    'Produtos em promoção na Armarinho Aurora. Confira e finalize seu pedido pelo WhatsApp.',
  alternates: { canonical: '/ofertas' },
};

type Busca = Record<string, string | string[] | undefined>;

export default async function OfertasPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;

  const consulta: Record<string, string | string[] | undefined> = {};
  for (const [chave, valor] of Object.entries(busca)) {
    if (valor !== undefined) consulta[chave] = valor;
  }

  // "Ofertas" é a listagem normal com a ordenação que traz promoção primeiro;
  // a API já filtra o que está fora do catálogo publicado.
  const parametros = { ...consulta, ordenar: consulta.ordenar ?? 'relevancia' };
  const [lista, facetas] = await Promise.all([getProdutos(parametros), getFacetas(parametros)]);

  const emOferta = lista.items.filter((produto) => produto.descontoPercent > 0);

  return (
    <Container className="py-5">
      <h1 className="text-ink-900 mb-1 text-xl font-bold">Ofertas e novidades</h1>
      <p className="text-ink-500 mb-4 text-sm">
        {emOferta.length > 0
          ? `${emOferta.length} produto(s) com desconto agora.`
          : 'Sem promoções no momento — veja o que chegou de novo.'}
      </p>

      <Listagem
        produtos={emOferta.length > 0 ? emOferta : lista.items}
        facetas={facetas}
        total={emOferta.length > 0 ? emOferta.length : lista.total}
        pagina={lista.page}
        totalPaginas={emOferta.length > 0 ? 1 : lista.totalPages}
      />
    </Container>
  );
}
