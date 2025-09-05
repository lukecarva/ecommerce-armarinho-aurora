/** Marcas de acento combinantes, removidas após `normalize('NFD')`. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** "Algodão" → "Algodao". Base de toda comparação insensível a acento. */
export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(COMBINING_MARKS, '');
}

/**
 * Gera slug de URL a partir de texto em português.
 * "Tricoline Estampado 100% Algodão" → "tricoline-estampado-100-algodao"
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[çÇ]/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

/**
 * Normaliza texto para comparação e busca: sem acento, minúsculo, sem
 * espaço duplicado. Espelha o que o `unaccent` faz no Postgres.
 */
export function normalizeSearchTerm(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ajusta nome de produto que vem em CAIXA ALTA na exportação do ERP.
 * "TECIDO TRICOLINE 100% ALGODAO" → "Tecido Tricoline 100% Algodao"
 * Texto que já vem em caixa mista é preservado como está.
 */
export function titleCaseFromErp(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (trimmed !== trimmed.toUpperCase()) return trimmed;

  const lowercaseWords = new Set([
    'de',
    'da',
    'do',
    'das',
    'dos',
    'e',
    'em',
    'com',
    'para',
    'por',
    'a',
    'o',
    'as',
    'os',
  ]);

  return trimmed
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (index > 0 && lowercaseWords.has(word)) return word;
      if (/^\d/.test(word)) return word; // "100%", "300m"
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
