import { formatBRL, formatQuantity, type SaleUnit } from '@aurora/types';
import { Container, buttonVariants } from '@aurora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessageCircle } from 'lucide-react';

/**
 * Página pública do pedido.
 *
 * É o plano B da mensagem: quando o carrinho é grande demais para caber na
 * URL do WhatsApp, a mensagem vira resumo e este link carrega a lista
 * completa. Serve também para a cliente reabrir o pedido depois, sem depender
 * do histórico da conversa.
 *
 * O código sozinho não abre nada — o token do link é obrigatório. Sem ele,
 * "CP-2026-0001" e um laço de repetição dariam o nome e o telefone de todos os
 * clientes da loja.
 */
export const metadata: Metadata = {
  title: 'Seu pedido',
  // Nunca indexar: é o documento de uma pessoa, com nome e telefone.
  robots: { index: false, follow: false },
};

/** Sem cache: o status muda enquanto a atendente trabalha o pedido. */
export const dynamic = 'force-dynamic';

const API =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

interface ItemDoPedido {
  name: string;
  variantName?: string | null;
  unit: SaleUnit;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl?: string | null;
}

interface PedidoPublico {
  code: string;
  status: string;
  createdAt: string;
  customer: { name: string };
  delivery: { label: string; note: string | null };
  items: ItemDoPedido[];
  subtotal: number;
  discount: number;
  total: number;
  whatsappUrl: string;
  storeOpen: boolean;
  storeStatusMessage: string;
}

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { code } = await params;
  const { t } = await searchParams;

  const pedido = await buscar(code, t ?? '');
  if (!pedido) notFound();

  return (
    <Container className="py-6">
      <p className="text-ink-500 text-sm">Pedido</p>
      <h1 className="text-ink-900 text-2xl font-bold">{pedido.code}</h1>
      <p className="text-ink-500 mt-1 text-sm">
        Feito em {new Date(pedido.createdAt).toLocaleString('pt-BR')} · {pedido.customer.name}
      </p>

      <div className="rounded-card mt-5 bg-white">
        <ul className="divide-ink-200 divide-y">
          {pedido.items.map((item, indice) => (
            <li key={indice} className="flex gap-3 p-3">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="bg-ink-100 size-16 shrink-0 rounded-md object-cover"
                />
              ) : null}

              <div className="min-w-0 flex-1">
                <p className="text-ink-800 text-sm font-semibold">{item.name}</p>
                {item.variantName ? (
                  <p className="text-ink-500 text-xs">{item.variantName}</p>
                ) : null}
                <p className="text-ink-500 mt-1 text-xs">
                  {formatQuantity(item.qty, item.unit)} × {formatBRL(item.unitPrice)}
                </p>
              </div>

              <p className="text-ink-900 shrink-0 font-bold">{formatBRL(item.lineTotal)}</p>
            </li>
          ))}
        </ul>

        <div className="border-ink-200 space-y-1 border-t p-4 text-sm">
          <div className="text-ink-600 flex justify-between">
            <span>Subtotal</span>
            <span>{formatBRL(pedido.subtotal)}</span>
          </div>

          {pedido.discount > 0 ? (
            <div className="text-stock-700 flex justify-between">
              <span>Desconto</span>
              <span>−{formatBRL(pedido.discount)}</span>
            </div>
          ) : null}

          <div className="text-ink-600 flex justify-between">
            <span>Entrega</span>
            <span className="text-right">
              {pedido.delivery.label}
              {pedido.delivery.note ? ` — ${pedido.delivery.note}` : ''}
            </span>
          </div>

          <div className="border-ink-200 text-ink-900 flex justify-between border-t pt-2 text-lg font-bold">
            <span>Total estimado</span>
            <span>{formatBRL(pedido.total)}</span>
          </div>
        </div>
      </div>

      {!pedido.storeOpen ? (
        <p className="bg-accent-100 text-ink-700 mt-4 rounded-md px-3 py-2 text-xs">
          {pedido.storeStatusMessage}
        </p>
      ) : null}

      <a
        href={pedido.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${buttonVariants({ variant: 'whatsapp', size: 'lg', full: true })} mt-5`}
      >
        <MessageCircle className="size-5" aria-hidden />
        Continuar no WhatsApp
      </a>

      <p className="text-ink-500 mt-3 text-center text-xs">
        Este pedido é um orçamento: o valor final é combinado na conversa.
      </p>

      <p className="mt-6 text-center">
        <Link href="/" className="text-brand-600 text-sm font-semibold hover:underline">
          Voltar para a loja
        </Link>
      </p>
    </Container>
  );
}

/**
 * Busca o pedido na API.
 *
 * Qualquer recusa — token errado, link expirado, código inexistente — vira a
 * mesma página 404. Distinguir "existe mas o token está errado" de "não
 * existe" contaria a quem tentasse adivinhar quais códigos são reais.
 */
async function buscar(code: string, token: string): Promise<PedidoPublico | null> {
  if (!token) return null;

  try {
    const resposta = await fetch(
      `${API}/orders/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );

    if (!resposta.ok) return null;
    return (await resposta.json()) as PedidoPublico;
  } catch {
    return null;
  }
}
