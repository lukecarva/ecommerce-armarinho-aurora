/**
 * Regras de busca compartilhadas entre a API e a vitrine.
 *
 * A busca de verdade acontece no Postgres — índice textual com a configuração
 * `pt_unaccent` e trigramas para erro de digitação. O que mora aqui é o que
 * precisa valer igual dos dois lados: o que conta como termo buscável e como
 * o trecho encontrado é destacado na tela.
 */
import { normalizeSearchTerm } from './slug.js';

/**
 * Abaixo disso não vale buscar. Uma letra casa com metade do catálogo e o
 * resultado não ajuda ninguém a escolher um tecido.
 */
export const MIN_SEARCH_LENGTH = 2;

/** Teto do termo, alinhado ao schema da API. Evita URL absurda e log inchado. */
export const MAX_SEARCH_LENGTH = 120;

/** Quantas sugestões o autocomplete mostra. Mais que isso não cabe no celular. */
export const MAX_SUGGESTIONS = 8;

/** Limpa o que a pessoa digitou, sem alterar acento nem caixa. */
export function sanitizeSearchTerm(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH);
}

/** O termo tem tamanho suficiente para valer uma consulta? */
export function isSearchable(input: string): boolean {
  return sanitizeSearchTerm(input).length >= MIN_SEARCH_LENGTH;
}

/** Palavras do termo, normalizadas — a base do destaque e do log. */
export function searchWords(input: string): string[] {
  return normalizeSearchTerm(sanitizeSearchTerm(input))
    .split(' ')
    .filter((palavra) => palavra.length >= MIN_SEARCH_LENGTH);
}

export interface TextSegment {
  text: string;
  match: boolean;
}

/**
 * Quebra o texto nos trechos que casam com o termo, para o autocomplete
 * mostrar em negrito o que a pessoa digitou.
 *
 * A comparação ignora acento — quem digita "algodao" precisa ver "Algodão"
 * destacado —, mas o texto devolvido é sempre o original, com acento e caixa
 * preservados. Por isso trabalhamos com índices sobre uma versão normalizada
 * de mesmo comprimento, e não sobre o texto transformado.
 */
export function highlightMatches(text: string, term: string): TextSegment[] {
  const palavras = searchWords(term);
  if (palavras.length === 0 || !text) return [{ text, match: false }];

  // `normalizeSearchTerm` só remove acentos e muda a caixa, o que preserva o
  // comprimento — cada índice aqui aponta para o mesmo caractere no original.
  const alvo = normalizeSearchTerm(text);
  const marcado = new Array<boolean>(text.length).fill(false);

  for (const palavra of palavras) {
    let de = alvo.indexOf(palavra);

    while (de !== -1) {
      for (let i = de; i < de + palavra.length && i < marcado.length; i += 1) marcado[i] = true;
      de = alvo.indexOf(palavra, de + palavra.length);
    }
  }

  const segmentos: TextSegment[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const ultimo = segmentos[segmentos.length - 1];

    if (ultimo && ultimo.match === marcado[i]) ultimo.text += text[i];
    else segmentos.push({ text: text[i]!, match: marcado[i]! });
  }

  return segmentos;
}
