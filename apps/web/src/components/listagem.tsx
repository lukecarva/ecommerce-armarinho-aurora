'use client';

import { Button } from '@aurora/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BarraDeFiltros } from '@/components/filtros';
import { GradeDeProdutos } from '@/components/vitrine';
import type { Facetas, ProdutoDaVitrine } from '@/lib/api';

/**
 * Listagem com filtros, ordenação e paginação.
 *
 * A primeira página vem renderizada no servidor — é ela que o Google indexa e
 * que define o tempo até o cliente ver produto na tela. As seguintes são
 * carregadas sob demanda, sem recarregar a página inteira.
 */
export function Listagem({
  produtos,
  facetas,
  total,
  pagina,
  totalPaginas,
}: {
  produtos: ProdutoDaVitrine[];
  facetas: Facetas;
  total: number;
  pagina: number;
  totalPaginas: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [layout, setLayout] = useState<'grade' | 'lista'>('grade');
  const [acumulados, setAcumulados] = useState<ProdutoDaVitrine[]>(produtos);
  const [paginaAtual, setPaginaAtual] = useState(pagina);
  const [carregando, setCarregando] = useState(false);

  // Trocar filtro ou ordenação recomeça a lista: o que veio antes não vale
  // mais. A dependência é a query inteira, que é o que define o resultado.
  const chaveDaBusca = params.toString();
  useEffect(() => {
    setAcumulados(produtos);
    setPaginaAtual(pagina);
  }, [chaveDaBusca, produtos, pagina]);

  // Preferência de visualização é por pessoa e por dispositivo — não entra na
  // URL, para não poluir o link que ela compartilha.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem('aurora:layout');
      if (salvo === 'grade' || salvo === 'lista') setLayout(salvo);
    } catch {
      // Navegador com armazenamento bloqueado: segue no padrão.
    }
  }, []);

  function trocarLayout(proximo: 'grade' | 'lista') {
    setLayout(proximo);
    try {
      localStorage.setItem('aurora:layout', proximo);
    } catch {
      // Sem persistência, a escolha vale só para esta visita.
    }
  }

  async function carregarMais() {
    setCarregando(true);

    const proxima = paginaAtual + 1;
    const query = new URLSearchParams(params.toString());
    query.set('page', String(proxima));

    try {
      const resposta = await fetch(`/vitrine/produtos?${query.toString()}`);
      if (resposta.ok) {
        const dados = (await resposta.json()) as { items: ProdutoDaVitrine[] };
        setAcumulados((atuais) => [...atuais, ...dados.items]);
        setPaginaAtual(proxima);
      }
    } finally {
      setCarregando(false);
    }
  }

  if (total === 0) {
    return (
      <div className="rounded-card border-ink-300 border border-dashed bg-white px-6 py-10 text-center">
        <p className="text-ink-700 font-medium">Nenhum produto com esses filtros.</p>
        <p className="text-ink-500 mt-1 text-sm">
          Tente limpar algum filtro — ou fale com a gente pelo WhatsApp que a gente procura para
          você.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push(pathname, { scroll: false })}
        >
          Limpar filtros
        </Button>
      </div>
    );
  }

  return (
    <>
      <BarraDeFiltros
        facetas={facetas}
        total={total}
        layout={layout}
        onLayoutChange={trocarLayout}
      />

      <GradeDeProdutos produtos={acumulados} layout={layout} />

      {paginaAtual < totalPaginas ? (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={() => void carregarMais()} disabled={carregando}>
            {carregando ? 'Carregando…' : `Ver mais (${total - acumulados.length} restantes)`}
          </Button>
        </div>
      ) : null}
    </>
  );
}
