'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AvailabilityValue, SaleUnitValue } from '@/lib/api';

/**
 * Carrinho no navegador.
 *
 * Ao contrário dos favoritos, o carrinho **não** vive no `localStorage`: ele
 * mora no servidor, identificado por um cookie httpOnly que o JavaScript da
 * página não lê. Dois motivos:
 *
 * 1. O preço tem que ser o da loja. Carrinho guardado no navegador é carrinho
 *    editável pelo DevTools — e aqui não há checkout com validação de
 *    pagamento para pegar a diferença depois.
 * 2. A cliente monta o carrinho no celular e finaliza no computador da loja
 *    com a atendente do lado. Só o servidor sustenta isso.
 *
 * O estado global existe para o contador do header e a página do carrinho
 * mostrarem sempre o mesmo número, sem cada um consultar a API por conta.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface ItemDoCarrinho {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  variantName: string | null;
  imageUrl: string | null;
  unit: SaleUnitValue;
  packSize: number | null;
  qty: number;
  unitPrice: number;
  compareAt: number | null;
  lineTotal: number;
  availability: AvailabilityValue;
  quantidade: { step: number; min: number };
  indisponivel: boolean;
}

export interface Carrinho {
  items: ItemDoCarrinho[];
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  coupon: { code: string; discount: number } | null;
  couponError: { reason: string; message: string } | null;
}

export const CARRINHO_VAZIO: Carrinho = {
  items: [],
  itemCount: 0,
  subtotal: 0,
  discount: 0,
  total: 0,
  coupon: null,
  couponError: null,
};

interface ContextoDoCarrinho {
  carrinho: Carrinho;
  /** `false` até a primeira leitura — evita o contador piscar de 0 para 3. */
  pronto: boolean;
  ocupado: boolean;
  erro: string | null;
  adicionar: (entrada: {
    productId: string;
    variantId?: string | null;
    qty: number;
  }) => Promise<void>;
  alterar: (itemId: string, qty: number) => Promise<void>;
  remover: (itemId: string) => Promise<void>;
  aplicarCupom: (code: string) => Promise<void>;
  removerCupom: () => Promise<void>;
  recarregar: () => Promise<void>;
}

const Contexto = createContext<ContextoDoCarrinho | null>(null);

export function CarrinhoProvider({ children }: { children: ReactNode }) {
  const [carrinho, setCarrinho] = useState<Carrinho>(CARRINHO_VAZIO);
  const [pronto, setPronto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const chamar = useCallback(async (caminho: string, init?: RequestInit): Promise<void> => {
    setOcupado(true);
    setErro(null);

    try {
      const resposta = await fetch(`${API}/cart${caminho}`, {
        ...init,
        // O cookie do carrinho é httpOnly e precisa ir junto; em produção a
        // API está no mesmo domínio, em desenvolvimento não.
        credentials: 'include',
        headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      });

      const dados: unknown = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        const mensagem =
          dados && typeof dados === 'object' && 'message' in dados
            ? String((dados as { message: unknown }).message)
            : 'Não foi possível atualizar o carrinho.';
        setErro(mensagem);
        return;
      }

      setCarrinho(dados as Carrinho);
    } catch {
      setErro('Sem conexão. Tente de novo em instantes.');
    } finally {
      setOcupado(false);
      setPronto(true);
    }
  }, []);

  const recarregar = useCallback(() => chamar(''), [chamar]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const valor = useMemo<ContextoDoCarrinho>(
    () => ({
      carrinho,
      pronto,
      ocupado,
      erro,
      recarregar,
      adicionar: (entrada) => chamar('/items', { method: 'POST', body: JSON.stringify(entrada) }),
      alterar: (itemId, qty) =>
        chamar(`/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ qty }) }),
      remover: (itemId) => chamar(`/items/${itemId}`, { method: 'DELETE' }),
      aplicarCupom: (code) => chamar('/coupon', { method: 'POST', body: JSON.stringify({ code }) }),
      removerCupom: () => chamar('/coupon', { method: 'DELETE' }),
    }),
    [carrinho, pronto, ocupado, erro, chamar, recarregar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCarrinho(): ContextoDoCarrinho {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useCarrinho precisa estar dentro de <CarrinhoProvider>.');

  return contexto;
}
