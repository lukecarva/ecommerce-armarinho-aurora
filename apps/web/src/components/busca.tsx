'use client';

import { MIN_SEARCH_LENGTH, highlightMatches, sanitizeSearchTerm } from '@aurora/types';
import { cn } from '@aurora/ui';
import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { SugestoesDaBusca } from '@/lib/api';

/**
 * Campo de busca com autocomplete.
 *
 * O `debounce` de 250 ms existe para o servidor: sem ele, "tricoline" dispara
 * nove consultas ao banco, e a nona é a única que a pessoa vê. Cada resposta
 * fora de ordem é descartada pelo `AbortController` — na rede do celular a
 * consulta de "tri" volta depois da de "trico" mais vezes do que se imagina, e
 * o resultado seria a lista errada piscando na tela.
 */

const ESPERA_MS = 250;

export function CampoDeBusca({
  termoInicial = '',
  autoFocus = false,
  className,
}: {
  termoInicial?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [termo, setTermo] = useState(termoInicial);
  const [sugestoes, setSugestoes] = useState<SugestoesDaBusca | null>(null);
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const limpo = sanitizeSearchTerm(termo);

    if (limpo.length < MIN_SEARCH_LENGTH) {
      setSugestoes(null);
      return;
    }

    const controle = new AbortController();
    const temporizador = setTimeout(() => {
      fetch(`/vitrine/sugestoes?q=${encodeURIComponent(limpo)}`, { signal: controle.signal })
        .then((resposta) => (resposta.ok ? resposta.json() : null))
        .then((dados: SugestoesDaBusca | null) => setSugestoes(dados))
        .catch(() => {
          // Requisição cancelada ou rede fora: o campo continua servindo para
          // enviar a busca, que é o que importa.
        });
    }, ESPERA_MS);

    return () => {
      clearTimeout(temporizador);
      controle.abort();
    };
  }, [termo]);

  // Clicar fora fecha a lista. Sem isso ela fica sobre o conteúdo no celular.
  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  function enviar(valor: string) {
    const limpo = sanitizeSearchTerm(valor);
    if (limpo.length < MIN_SEARCH_LENGTH) return;

    setAberto(false);
    router.push(`/busca?q=${encodeURIComponent(limpo)}`);
  }

  const temSugestoes =
    aberto && ((sugestoes?.produtos.length ?? 0) > 0 || (sugestoes?.categorias.length ?? 0) > 0);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(evento) => {
          evento.preventDefault();
          enviar(termo);
        }}
      >
        <label htmlFor="busca-vitrine" className="sr-only">
          Buscar produtos
        </label>

        <div className="rounded-button border-ink-300 flex h-11 items-center gap-2 border bg-white px-3">
          <Search className="text-ink-400 size-5 shrink-0" aria-hidden />
          <input
            id="busca-vitrine"
            type="search"
            // Foco automático só na página de busca vazia, que é onde digitar
            // é a razão de a pessoa ter chegado. No header seria roubo de foco.
            autoFocus={autoFocus}
            value={termo}
            onChange={(evento) => {
              setTermo(evento.target.value);
              setAberto(true);
            }}
            onFocus={() => setAberto(true)}
            placeholder="Buscar tecido, fio, aviamento…"
            className="text-ink-900 placeholder:text-ink-400 h-full flex-1 bg-transparent text-base outline-none"
            autoComplete="off"
          />
          {termo ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setTermo('');
                setSugestoes(null);
              }}
              className="text-ink-400 hover:text-ink-600"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </form>

      {temSugestoes ? (
        <div className="rounded-card shadow-card absolute inset-x-0 top-12 z-40 overflow-hidden bg-white">
          {sugestoes!.categorias.length > 0 ? (
            <div className="border-ink-200 border-b py-1">
              {sugestoes!.categorias.map((categoria) => (
                <Link
                  key={categoria.slug}
                  href={`/categoria/${categoria.slug}`}
                  onClick={() => setAberto(false)}
                  className="hover:bg-ink-50 text-ink-600 block px-4 py-2 text-sm"
                >
                  Em <strong className="text-ink-800">{categoria.name}</strong>
                </Link>
              ))}
            </div>
          ) : null}

          <ul>
            {sugestoes!.produtos.map((produto) => (
              <li key={produto.slug}>
                <Link
                  href={`/produto/${produto.slug}`}
                  onClick={() => setAberto(false)}
                  className="hover:bg-ink-50 text-ink-700 block px-4 py-2.5 text-sm"
                >
                  {highlightMatches(produto.name, termo).map((parte, indice) =>
                    parte.match ? (
                      <strong key={indice} className="text-ink-900 font-semibold">
                        {parte.text}
                      </strong>
                    ) : (
                      <span key={indice}>{parte.text}</span>
                    ),
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
