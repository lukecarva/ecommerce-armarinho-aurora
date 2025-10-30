'use client';

import { AVAILABILITY_LABELS, formatBRL, formatUnitPriceSuffix } from '@aurora/types';
import { Badge, Skeleton, cn } from '@aurora/ui';
import Link from 'next/link';
import { ChevronRight, ImageOff } from 'lucide-react';
import { BotaoFavorito } from '@/components/favoritos';
import type { ProdutoDaVitrine } from '@/lib/api';

/**
 * Peças da vitrine.
 *
 * O card fica aqui, e não no design system, porque depende do formato que a
 * API pública devolve. O componente genérico do `@aurora/ui` continua
 * servindo ao painel e à documentação visual.
 */

export function CardDeProduto({
  produto,
  layout = 'grade',
}: {
  produto: ProdutoDaVitrine;
  layout?: 'grade' | 'lista';
}) {
  const lista = layout === 'lista';

  return (
    <article
      className={cn(
        'group rounded-card shadow-card relative overflow-hidden bg-white',
        lista ? 'flex gap-3 p-3' : 'flex flex-col',
      )}
    >
      {/* O coração fica fora do link da foto: é um botão de verdade, com
          estado próprio, e não pode navegar junto ao ser tocado. */}
      <BotaoFavorito produtoId={produto.id} className="absolute top-2 right-2 z-10 size-8" />

      <Link
        href={`/produto/${produto.slug}`}
        className={cn(
          'bg-ink-100 relative block shrink-0 overflow-hidden',
          lista ? 'size-24 rounded-md' : 'aspect-square w-full',
        )}
      >
        {produto.imageUrl ? (
          <img
            src={produto.imageUrl}
            alt={produto.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="text-ink-400 flex size-full items-center justify-center">
            <ImageOff className="size-6" aria-hidden />
          </span>
        )}

        {produto.descontoPercent > 0 ? (
          <span className="bg-price-500 rounded-pill absolute top-2 left-2 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
            {produto.descontoPercent}% OFF
          </span>
        ) : null}
      </Link>

      <div className={cn('flex min-w-0 flex-1 flex-col gap-1.5', lista ? '' : 'p-3')}>
        <Link
          href={`/produto/${produto.slug}`}
          className="text-ink-800 line-clamp-2 text-sm font-semibold hover:underline"
        >
          {produto.name}
        </Link>

        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-price-500 text-lg font-bold">{formatBRL(produto.price)}</span>
          <span className="text-ink-500 text-sm">{formatUnitPriceSuffix(produto.unit)}</span>
          {produto.compareAt ? (
            <span className="text-ink-400 text-xs line-through">
              {formatBRL(produto.compareAt)}
            </span>
          ) : null}
        </div>

        {produto.highlight ? <p className="text-ink-500 text-xs">{produto.highlight}</p> : null}

        <Badge
          tone={
            produto.availability === 'em_estoque'
              ? 'stock'
              : produto.availability === 'ultimas_unidades'
                ? 'warning'
                : 'brand'
          }
          className="w-fit"
        >
          {AVAILABILITY_LABELS[produto.availability]}
        </Badge>
      </div>
    </article>
  );
}

export function GradeDeProdutos({
  produtos,
  layout = 'grade',
}: {
  produtos: ProdutoDaVitrine[];
  layout?: 'grade' | 'lista';
}) {
  if (layout === 'lista') {
    return (
      <div className="space-y-3">
        {produtos.map((produto) => (
          <CardDeProduto key={produto.id} produto={produto} layout="lista" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {produtos.map((produto) => (
        <CardDeProduto key={produto.id} produto={produto} />
      ))}
    </div>
  );
}

/** Carrossel horizontal — o formato das "Ofertas da semana" no design. */
export function CarrosselDeProdutos({ produtos }: { produtos: ProdutoDaVitrine[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex gap-3">
        {produtos.map((produto) => (
          <div key={produto.id} className="w-40 shrink-0 sm:w-48">
            <CardDeProduto produto={produto} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Trilha({ itens }: { itens: Array<{ name: string; slug: string }> }) {
  return (
    <nav
      aria-label="Você está aqui"
      className="text-ink-500 mb-3 flex flex-wrap items-center text-xs"
    >
      <Link href="/" className="hover:underline">
        Início
      </Link>
      {itens.map((item, indice) => (
        <span key={item.slug} className="flex items-center">
          <ChevronRight className="mx-1 size-3" aria-hidden />
          {indice === itens.length - 1 ? (
            <span className="text-ink-700 font-medium" aria-current="page">
              {item.name}
            </span>
          ) : (
            <Link href={`/categoria/${item.slug}`} className="hover:underline">
              {item.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Esqueleto com a mesma proporção do card — evita o salto de layout. */
export function EsqueletoDaGrade({ quantidade = 8 }: { quantidade?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: quantidade }, (_, indice) => (
        <div key={indice} className="rounded-card shadow-card bg-white p-3">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="mt-3 h-4 w-4/5" />
          <Skeleton className="mt-2 h-5 w-1/2" />
          <Skeleton className="mt-2 h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
