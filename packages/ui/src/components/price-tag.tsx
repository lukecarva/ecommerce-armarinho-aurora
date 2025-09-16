import {
  discountPercent,
  formatBRL,
  formatUnitPriceSuffix,
  type Cents,
  type SaleUnit,
} from '@aurora/types';
import { cn } from '../lib/cn';
import { Badge } from './badge';

export interface PriceTagProps {
  price: Cents;
  /** Preço cheio, quando o produto está em promoção. */
  compareAt?: Cents | null;
  unit: SaleUnit;
  size?: 'sm' | 'md' | 'lg';
  /** Mostra o selo "23% OFF" ao lado — usado na página de ofertas. */
  showDiscount?: boolean;
  className?: string;
}

const SIZES = {
  sm: { price: 'text-base', suffix: 'text-xs', compare: 'text-xs' },
  md: { price: 'text-lg', suffix: 'text-sm', compare: 'text-sm' },
  lg: { price: 'text-3xl', suffix: 'text-base', compare: 'text-base' },
} as const;

/**
 * Preço com a unidade de venda — "R$ 15,90/metro".
 *
 * A unidade não é decoração: sem ela o cliente compara o preço de um metro
 * de tecido com o de um pacote de botões.
 */
export function PriceTag({
  price,
  compareAt,
  unit,
  size = 'md',
  showDiscount = false,
  className,
}: PriceTagProps) {
  const styles = SIZES[size];
  const hasPromo = typeof compareAt === 'number' && compareAt > price;
  const percent = hasPromo ? discountPercent(compareAt, price) : 0;

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      <span className={cn('text-price-500 font-bold', styles.price)}>{formatBRL(price)}</span>
      <span className={cn('text-ink-500', styles.suffix)}>{formatUnitPriceSuffix(unit)}</span>

      {hasPromo ? (
        <>
          <span className={cn('text-ink-400 line-through', styles.compare)}>
            {formatBRL(compareAt)}
          </span>
          {showDiscount && percent > 0 ? <Badge tone="price">{percent}% OFF</Badge> : null}
        </>
      ) : null}
    </div>
  );
}
