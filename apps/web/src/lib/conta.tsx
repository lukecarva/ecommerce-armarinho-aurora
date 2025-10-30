'use client';

import {
  FAVORITES_STORAGE_KEY,
  MAX_FAVORITES,
  mergeFavorites,
  parseFavorites,
} from '@aurora/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { EVENTO_FAVORITOS } from '@/components/favoritos';
import { useCarrinho } from '@/lib/carrinho';

/**
 * Conta do cliente na vitrine.
 *
 * A sessão é um cookie httpOnly posto pela API — a página nunca vê o token.
 * O que este contexto guarda é só o resultado: quem está logado, ou ninguém.
 *
 * Três coisas acontecem quando alguém entra ou sai, e moram aqui para não
 * se espalharem pelas páginas:
 *
 * 1. **O carrinho é recarregado.** Entrar une a sacola do navegador à da
 *    conta; sair faz o navegador esquecê-la.
 * 2. **Os favoritos são unidos.** O que estava no navegador e o que estava na
 *    conta viram uma lista só, gravada nos dois lugares.
 * 3. **Ao sair, os favoritos saem do navegador.** Continuam salvos na conta;
 *    num computador compartilhado, a próxima pessoa não vê a lista de ninguém.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface ClienteDaConta {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  emailVerified: boolean;
  temSenha: boolean;
  acceptsMarketing: boolean;
}

export type RespostaDaConta<T> =
  { ok: true; dados: T } | { ok: false; erro: string; status: number };

/**
 * Chamada à API da conta, com o cookie de sessão junto.
 *
 * Nunca lança: devolve o erro já em texto para a tela. O Zod da API manda
 * uma lista de problemas; a primeira linha já diz o que corrigir.
 */
export async function chamarConta<T>(
  caminho: string,
  init?: RequestInit,
): Promise<RespostaDaConta<T>> {
  try {
    const resposta = await fetch(`${API}/account${caminho}`, {
      ...init,
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });

    const dados: unknown = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      const mensagem =
        dados && typeof dados === 'object' && 'message' in dados
          ? (dados as { message: unknown }).message
          : null;

      return {
        ok: false,
        status: resposta.status,
        erro: Array.isArray(mensagem)
          ? String(mensagem[0])
          : typeof mensagem === 'string'
            ? mensagem
            : 'Não foi possível concluir. Tente de novo.',
      };
    }

    return { ok: true, dados: dados as T };
  } catch {
    return { ok: false, status: 0, erro: 'Sem conexão. Tente de novo em instantes.' };
  }
}

interface ContextoDaConta {
  cliente: ClienteDaConta | null;
  /** `false` até a primeira resposta — evita piscar "Entrar" para quem está logado. */
  pronto: boolean;
  naoLidas: number;
  entrar: (email: string, senha: string) => Promise<RespostaDaConta<unknown>>;
  cadastrar: (dados: {
    nome: string;
    email: string;
    telefone: string;
    senha: string;
    aceitaMarketing: boolean;
    aceitaTermos: boolean;
  }) => Promise<RespostaDaConta<unknown>>;
  sair: () => Promise<void>;
  /** Depois de entrar por link ou trocar a senha: a API já pôs o cookie. */
  recarregar: () => Promise<void>;
  atualizarNaoLidas: (quantas: number) => void;
}

const Contexto = createContext<ContextoDaConta | null>(null);

export function ContaProvider({ children }: { children: ReactNode }) {
  const { recarregar: recarregarCarrinho } = useCarrinho();

  const [cliente, setCliente] = useState<ClienteDaConta | null>(null);
  const [naoLidas, setNaoLidas] = useState(0);
  const [pronto, setPronto] = useState(false);

  // Enquanto a união dos favoritos grava no navegador, o evento que ela mesma
  // dispara não deve voltar ao servidor como se fosse um clique.
  const sincronizando = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recarregar = useCallback(async () => {
    const resposta = await chamarConta<{ cliente: ClienteDaConta | null; naoLidas: number }>('/me');

    if (resposta.ok) {
      setCliente(resposta.dados.cliente);
      setNaoLidas(resposta.dados.naoLidas);
    }

    setPronto(true);
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // Com alguém logado, a lista do navegador e a da conta viram uma só.
  const clienteId = cliente?.id ?? null;
  useEffect(() => {
    if (!clienteId) return;

    void (async () => {
      const doServidor = await chamarConta<{ ids: string[] }>('/favorites');
      if (!doServidor.ok) return;

      const locais = lerFavoritosLocais();
      const unidos = mergeFavorites(locais, doServidor.dados.ids).slice(0, MAX_FAVORITES);

      if (!mesmaLista(unidos, locais)) {
        sincronizando.current = true;
        gravarFavoritosLocais(unidos);
        sincronizando.current = false;
      }

      if (!mesmaLista(unidos, doServidor.dados.ids)) {
        await chamarConta('/favorites', { method: 'PUT', body: JSON.stringify({ ids: unidos }) });
      }
    })();
  }, [clienteId]);

  // Cada coração tocado com alguém logado vai para a conta. O intervalo curto
  // junta os toques seguidos numa gravação só.
  useEffect(() => {
    if (!clienteId) return;

    function aoMudar() {
      if (sincronizando.current) return;
      if (temporizador.current) clearTimeout(temporizador.current);

      temporizador.current = setTimeout(() => {
        void chamarConta('/favorites', {
          method: 'PUT',
          body: JSON.stringify({ ids: lerFavoritosLocais() }),
        });
      }, 400);
    }

    window.addEventListener(EVENTO_FAVORITOS, aoMudar);
    return () => window.removeEventListener(EVENTO_FAVORITOS, aoMudar);
  }, [clienteId]);

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const resposta = await chamarConta<{ cliente: ClienteDaConta }>('/login', {
        method: 'POST',
        body: JSON.stringify({ email, senha }),
      });

      if (resposta.ok) {
        await recarregar();
        await recarregarCarrinho();
      }

      return resposta;
    },
    [recarregar, recarregarCarrinho],
  );

  const cadastrar = useCallback<ContextoDaConta['cadastrar']>(
    async (dados) => {
      const resposta = await chamarConta<{ cliente: ClienteDaConta }>('/register', {
        method: 'POST',
        body: JSON.stringify(dados),
      });

      if (resposta.ok) {
        await recarregar();
        await recarregarCarrinho();
      }

      return resposta;
    },
    [recarregar, recarregarCarrinho],
  );

  const sair = useCallback(async () => {
    await chamarConta('/logout', { method: 'POST' });

    setCliente(null);
    setNaoLidas(0);

    sincronizando.current = true;
    gravarFavoritosLocais([]);
    sincronizando.current = false;

    await recarregarCarrinho();
  }, [recarregarCarrinho]);

  const valor = useMemo<ContextoDaConta>(
    () => ({
      cliente,
      pronto,
      naoLidas,
      entrar,
      cadastrar,
      sair,
      recarregar: async () => {
        await recarregar();
        await recarregarCarrinho();
      },
      atualizarNaoLidas: setNaoLidas,
    }),
    [cliente, pronto, naoLidas, entrar, cadastrar, sair, recarregar, recarregarCarrinho],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useConta(): ContextoDaConta {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useConta precisa estar dentro de <ContaProvider>.');

  return contexto;
}

// ─────────────────────────────── Internos ──────────────────────────────────

function lerFavoritosLocais(): string[] {
  try {
    return parseFavorites(localStorage.getItem(FAVORITES_STORAGE_KEY));
  } catch {
    return [];
  }
}

function gravarFavoritosLocais(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Armazenamento bloqueado: a lista continua valendo na conta.
  }
  window.dispatchEvent(new CustomEvent(EVENTO_FAVORITOS));
}

function mesmaLista(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, indice) => id === b[indice]);
}
