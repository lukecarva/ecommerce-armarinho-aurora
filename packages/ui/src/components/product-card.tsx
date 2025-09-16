'use client';

import type { Availability, Cents, SaleUnit } from '@aurora/types';
import { Heart, ShoppingCart } from 'lucide-react';
import { cn } from '../lib/cn';
import { useLinkComponent } from '../lib/link';
import { AvailabilityBadge } from './badge';
import { Button } from './button';
import { PriceTag } from './price-tag';

export interface ProductCardProduct {
  id: string;
  name: string;
  slug: string;
  price: Cents;
  compareAt?: Cents | null;
  unit: SaleUnit;
  availability: Availability;
  imageUrl?: string | null;
  /** Linha curta de atributo: "1,50m largura", "300m", "Pacote com 10 un". */
  highlight?: string | null;
}

export interface ProductCardProps {
  product: ProductCardProduct;
  onAdd?: (product: ProductCardProduct) => void;
  onToggleFavorite?: (product: ProductCardProduct) => void;
  isFavorite?: boolean;
  layout?: 'grid' | 'list';
  showDiscount?: boolean;
  className?: string;
}

export function ProductCard({
  product,
  onAdd,
  onToggleFavorite,
  isFavorite = false,
  layout = 'grid',
  showDiscount = false,
  className,
}: ProductCardProps) {
  const Link = useLinkComponent();
  const href = `/produto/${product.slug}`;
  const soldOut = product.availability === 'esgotado';
  const isList = layout === 'list';

  return (
    <article
      className={cn(
        'group rounded-card shadow-card relative overflow-hidden bg-white',
        isList ? 'flex gap-3 p-3' : 'flex flex-col',
        className,
      )}
    >
      {onToggleFavorite ? (
        <button
          type="button"
          aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          aria-pressed={isFavorite}
          onClick={() => onToggleFavorite(product)}
          className="rounded-pill text-ink-500 hover:text-price-500 absolute top-2 right-2 z-10 flex size-8 items-center justify-center bg-white/90 backdrop-blur transition-colors"
        >
          <Heart
            className={cn('size-4', isFavorite && 'fill-price-500 text-price-500')}
            aria-hidden
          />
        </button>
      ) : null}

      <Link
        href={href}
        className={cn(
          'bg-ink-100 block shrink-0 overflow-hidden',
          isList ? 'size-24 rounded-md' : 'aspect-square w-full',
        )}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="text-ink-400 flex size-full items-center justify-center text-xs">
            Sem foto
          </span>
        )}
      </Link>

      <div className={cn('flex min-w-0 flex-1 flex-col gap-1.5', isList ? '' : 'p-3')}>
        <Link
          href={href}
          className="text-ink-800 line-clamp-2 text-sm font-semibold hover:underline"
        >
          {product.name}
        </Link>

        <PriceTag
          price={product.price}
          compareAt={product.compareAt}
          unit={product.unit}
          size="md"
          showDiscount={showDiscount}
        />

        {product.highlight ? <p className="text-ink-500 text-xs">{product.highlight}</p> : null}

        <AvailabilityBadge availability={product.availability} className="w-fit" />

        {onAdd ? (
          <Button
            size="sm"
            full
            className="mt-1.5"
            disabled={soldOut}
            onClick={() => onAdd(product)}
            icon={<ShoppingCart className="size-4" aria-hidden />}
          >
            {soldOut ? 'Indisponível' : 'Adicionar'}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
