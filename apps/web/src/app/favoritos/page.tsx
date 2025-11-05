'use client';

import { Container } from '@aurora/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useFavoritos } from '@/components/favoritos';
import { EsqueletoDaGrade, GradeDeProdutos } from '@/components/vitrine';
import type { ProdutoDaVitrine } from '@/lib/api';

/**
 * Página de favoritos.
 *
 * É a única página da vitrine renderizada só no navegador: a lista mora no
 * `localStorage` desta pessoa e o servidor não tem como saber o que ela
 * marcou. Nada aqui deve ser indexado — é conteúdo de uma pessoa só —, e o
 * `robots` está no layout de metadados abaixo.
 */
export default function FavoritosPage() {
  const { favoritos, pronto } = useFavoritos();
  const [produtos, setProdutos] = useState<ProdutoDaVitrine[]>([]);
  const [carregando, setCarregando] = useState(true);

  const chave = favoritos.join(',');

  useEffect(() => {
    if (!pronto) return;

    if (favoritos.length === 0) {
      setProdutos([]);
      setCarregando(false);
      return;
    }

    const controle = new AbortController();
    setCarregando(true);

    fetch(`/vitrine/produtos?ids=${encodeURIComponent(chave)}&perPage=48`, {
      signal: controle.signal,
    })
      .then((resposta) => (resposta.ok ? resposta.json() : { items: [] }))
      .then((dados: { items: ProdutoDaVitrine[] }) => {
        // A ordem que importa é a do navegador: o último favoritado primeiro.
        // O banco não conhece essa ordem, então ela é reaplicada aqui.
        const porId = new Map(dados.items.map((produto) => [produto.id, produto]));
        setProdutos(favoritos.map((id) => porId.get(id)).filter(Boolean) as ProdutoDaVitrine[]);
        setCarregando(false);
      })
      .catch(() => {
        // Requisição cancelada por uma nova, ou rede fora.
      });

    return () => controle.abort();
  }, [chave, favoritos, pronto]);

  return (
    <Container className="py-5">
      <h1 className="text-ink-900 mb-1 text-xl font-bold">Meus favoritos</h1>
      <p className="text-ink-500 mb-5 text-sm">
        Salvos neste aparelho. Quando a conta existir, eles vão junto.
      </p>

      {!pronto || carregando ? (
        <EsqueletoDaGrade quantidade={4} />
      ) : produtos.length === 0 ? (
        <div className="rounded-card border-ink-300 border border-dashed bg-white px-6 py-10 text-center">
          <p className="text-ink-700 font-medium">Você ainda não salvou nenhum produto.</p>
          <p className="text-ink-500 mt-1 text-sm">
            Toque no coração de um produto para guardá-lo aqui.
          </p>
          <Link
            href="/categorias"
            className="text-brand-600 mt-6 inline-block text-sm font-semibold hover:underline"
          >
            Explorar o catálogo
          </Link>
        </div>
      ) : (
        <>
          {/* Um favorito que sai do ar simplesmente some da lista. Avisar
              "produto indisponível" para algo que a loja arquivou seria ruído. */}
          <p className="text-ink-500 mb-4 text-sm">{produtos.length} produto(s)</p>
          <GradeDeProdutos produtos={produtos} />
        </>
      )}
    </Container>
  );
}
