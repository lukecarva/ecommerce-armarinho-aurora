import { slugify } from '@aurora/types';

interface SlugOwner {
  findFirst(args: { where: { slug: string; NOT?: { id: string } } }): Promise<unknown>;
}

/**
 * Garante slug único sem devolver erro ao usuário.
 *
 * Duas "Tricoline Estampada" são normais no catálogo de uma loja de tecidos.
 * Em vez de recusar o cadastro, acrescentamos um sufixo — o painel mostra o
 * slug final e a pessoa ajusta se quiser.
 */
export async function uniqueSlug(
  model: SlugOwner,
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(desired) || 'item';
  let candidate = base;
  let suffix = 2;

  // O teto evita laço infinito se algo estiver muito errado com o banco.
  while (suffix < 200) {
    const existing = await model.findFirst({
      where: { slug: candidate, ...(ignoreId ? { NOT: { id: ignoreId } } : {}) },
    });

    if (!existing) return candidate;

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return `${base}-${Date.now()}`;
}
