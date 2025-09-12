import { describe, expect, it } from 'vitest';
import {
  highlightMatches,
  isSearchable,
  MAX_SEARCH_LENGTH,
  sanitizeSearchTerm,
  searchWords,
} from './search.js';

describe('sanitizeSearchTerm', () => {
  it('colapsa espaço e apara as pontas', () => {
    expect(sanitizeSearchTerm('  tecido   tricoline  ')).toBe('tecido tricoline');
  });

  it('preserva acento e caixa — quem exibe o termo mostra o que foi digitado', () => {
    expect(sanitizeSearchTerm('Algodão')).toBe('Algodão');
  });

  it('corta no teto', () => {
    expect(sanitizeSearchTerm('a'.repeat(500))).toHaveLength(MAX_SEARCH_LENGTH);
  });
});

describe('isSearchable', () => {
  it('recusa termo curto demais para dizer alguma coisa', () => {
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable('   ')).toBe(false);
  });

  it('aceita a partir de duas letras', () => {
    expect(isSearchable('fio')).toBe(true);
  });
});

describe('searchWords', () => {
  it('normaliza acento e descarta palavra de uma letra', () => {
    expect(searchWords('Tecido de Algodão')).toEqual(['tecido', 'de', 'algodao']);
  });

  it('devolve vazio quando não sobra nada', () => {
    expect(searchWords(' a ')).toEqual([]);
  });
});

describe('highlightMatches', () => {
  it('marca o trecho digitado', () => {
    expect(highlightMatches('Tricoline Estampado', 'tricoline')).toEqual([
      { text: 'Tricoline', match: true },
      { text: ' Estampado', match: false },
    ]);
  });

  it('acha texto acentuado a partir de termo sem acento', () => {
    // A cliente digita "algodao" no teclado do celular e precisa ver
    // "Algodão" destacado.
    expect(highlightMatches('100% Algodão', 'algodao')).toEqual([
      { text: '100% ', match: false },
      { text: 'Algodão', match: true },
    ]);
  });

  it('devolve o texto original, com acento e caixa preservados', () => {
    const segmentos = highlightMatches('Algodão Cru', 'ALGODAO');
    expect(segmentos.map((parte) => parte.text).join('')).toBe('Algodão Cru');
  });

  it('marca todas as ocorrências', () => {
    expect(highlightMatches('fio fio', 'fio')).toEqual([
      { text: 'fio', match: true },
      { text: ' ', match: false },
      { text: 'fio', match: true },
    ]);
  });

  it('marca cada palavra do termo separadamente', () => {
    expect(highlightMatches('Fio de Rafia', 'fio rafia')).toEqual([
      { text: 'Fio', match: true },
      { text: ' de ', match: false },
      { text: 'Rafia', match: true },
    ]);
  });

  it('sem termo útil, devolve o texto inteiro sem marcação', () => {
    expect(highlightMatches('Tricoline', 'a')).toEqual([{ text: 'Tricoline', match: false }]);
  });

  it('aguenta texto vazio', () => {
    expect(highlightMatches('', 'fio')).toEqual([{ text: '', match: false }]);
  });
});
