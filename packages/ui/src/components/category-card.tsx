'use client';

import { cn } from '../lib/cn';
import { useLinkComponent } from '../lib/link';

export interface CategoryCardCategory {
  id: string;
  name: string;
  slug: string;
  imageUrl?: string | null;
}

/** Card quadrado da grade de categorias da home. */
export function CategoryCard({
  category,
  className,
}: {
  category: CategoryCardCategory;
  className?: string;
}) {
  const Link = useLinkComponent();

  return (
    <Link
      href={`/categoria/${category.slug}`}
      className={cn(
        'group rounded-card shadow-card flex flex-col overflow-hidden bg-white',
        className,
      )}
    >
      <div className="bg-ink-100 aspect-square w-full overflow-hidden">
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
      </div>
      <span className="text-ink-700 px-2 py-2.5 text-center text-xs leading-tight font-semibold">
        {category.name}
      </span>
    </Link>
  );
}
