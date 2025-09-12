/**
 * Favoritos da vitrine.
 *
 * Enquanto ninguém está logado, a lista vive no `localStorage` do navegador —
 * é o coração do card do design. Ao entrar numa conta, a lista local é
 * mesclada com a da conta em vez de sobrescrita: quem favoritou cinco tecidos
 * antes de criar cadastro não pode perdê-los ao fazer login.
 *
 * As funções aqui são puras; quem lê e escreve o `localStorage` é a vitrine.
 */

/** Chave única no `localStorage`. Versionada para poder mudar o formato depois. */
export const FAVORITES_STORAGE_KEY = 'aurora:favoritos:v1';

/**
 * Teto da lista. Protege o `localStorage` (limite de poucos MB por origem) e
 * mantém a página de favoritos carregável numa consulta só.
 */
export const MAX_FAVORITES = 200;

/**
 * Lê o que estiver guardado no navegador.
 *
 * Nunca lança: `localStorage` é editável pela pessoa, pode ter sobra de uma
 * versão anterior do site ou lixo de extensão. Conteúdo inválido vira lista
 * vazia — favorito perdido é irritante, tela quebrada é pior.
 */
export function parseFavorites(raw: string | null): string[] {
  if (!raw) return [];

  try {
    const dados: unknown = JSON.parse(raw);
    if (!Array.isArray(dados)) return [];

    const ids = dados.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return dedupe(ids).slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

/** Adiciona no topo — o último favoritado é o que a pessoa quer rever. */
export function addFavorite(favoritos: readonly string[], id: string): string[] {
  if (!id) return [...favoritos];
  return dedupe([id, ...favoritos]).slice(0, MAX_FAVORITES);
}

export function removeFavorite(favoritos: readonly string[], id: string): string[] {
  return favoritos.filter((item) => item !== id);
}

export function toggleFavorite(favoritos: readonly string[], id: string): string[] {
  return favoritos.includes(id) ? removeFavorite(favoritos, id) : addFavorite(favoritos, id);
}

export function isFavorite(favoritos: readonly string[], id: string): boolean {
  return favoritos.includes(id);
}

/**
 * Junta a lista local com a da conta no login.
 *
 * União, nunca substituição: os dois lados representam escolha real de alguém.
 * O que está no navegador vem primeiro por ser o mais recente.
 */
export function mergeFavorites(local: readonly string[], daConta: readonly string[]): string[] {
  return dedupe([...local, ...daConta]).slice(0, MAX_FAVORITES);
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
