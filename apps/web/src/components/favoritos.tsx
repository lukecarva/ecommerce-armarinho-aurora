'use client';

import {
  FAVORITES_STORAGE_KEY,
  parseFavorites,
  toggleFavorite as alternar,
  isFavorite as pertence,
} from '@aurora/types';
import { cn } from '@aurora/ui';
import { Heart } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

/**
 * Favoritos da vitrine.
 *
 * Vivem no `localStorage`, sem conta e sem login: a cliente marca cinco
 * tecidos no celular durante o intervalo do almoço e reencontra a lista à
 * noite. Quando o cadastro entrar (Sprint 6), `mergeFavorites` junta esta
 * lista à da conta, sem perder nenhum lado.
 *
 * A leitura só acontece depois da montagem. O HTML vem do servidor, que não
 * tem como saber o que este navegador guardou — pintar coração cheio na
 * primeira renderização causaria erro de hidratação.
 */

/**
 * Avisa as outras instâncias do hook na mesma aba — e a conta, que grava a
 * lista no servidor quando há alguém logado.
 */
export const EVENTO_FAVORITOS = 'aurora:favoritos';

function ler(): string[] {
  try {
    return parseFavorites(localStorage.getItem(FAVORITES_STORAGE_KEY));
  } catch {
    // Navegador com armazenamento bloqueado ou modo restrito.
    return [];
  }
}

function gravar(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Sem persistência a escolha vale só para esta visita — melhor que quebrar.
  }
  window.dispatchEvent(new CustomEvent(EVENTO_FAVORITOS));
}

export function useFavoritos() {
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setFavoritos(ler());
    setPronto(true);

    const sincronizar = () => setFavoritos(ler());

    // `storage` cobre outra aba; o evento próprio cobre outro componente
    // nesta aba — o `storage` não dispara para quem escreveu.
    window.addEventListener('storage', sincronizar);
    window.addEventListener(EVENTO_FAVORITOS, sincronizar);

    return () => {
      window.removeEventListener('storage', sincronizar);
      window.removeEventListener(EVENTO_FAVORITOS, sincronizar);
    };
  }, []);

  const alternarFavorito = useCallback((id: string) => {
    const proximos = alternar(ler(), id);
    gravar(proximos);
    setFavoritos(proximos);
  }, []);

  return {
    favoritos,
    /** `false` até ler o navegador — evita o coração piscar de cheio para vazio. */
    pronto,
    ehFavorito: useCallback((id: string) => pertence(favoritos, id), [favoritos]),
    alternarFavorito,
  };
}

export function BotaoFavorito({ produtoId, className }: { produtoId: string; className?: string }) {
  const { ehFavorito, alternarFavorito, pronto } = useFavoritos();
  const marcado = pronto && ehFavorito(produtoId);

  return (
    <button
      type="button"
      aria-label={marcado ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
      aria-pressed={marcado}
      onClick={(evento) => {
        // O botão costuma ficar sobre o link do card.
        evento.preventDefault();
        evento.stopPropagation();
        alternarFavorito(produtoId);
      }}
      className={cn(
        'rounded-pill text-ink-500 hover:text-price-500 flex size-9 items-center justify-center bg-white/90 backdrop-blur transition-colors',
        className,
      )}
    >
      <Heart className={cn('size-5', marcado && 'fill-price-500 text-price-500')} aria-hidden />
    </button>
  );
}
