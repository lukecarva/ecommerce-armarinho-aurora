import { describe, expect, it } from 'vitest';
import {
  addFavorite,
  isFavorite,
  MAX_FAVORITES,
  mergeFavorites,
  parseFavorites,
  removeFavorite,
  toggleFavorite,
} from './favorites.js';

describe('parseFavorites', () => {
  it('lê a lista guardada', () => {
    expect(parseFavorites('["a","b"]')).toEqual(['a', 'b']);
  });

  it('trata ausência como lista vazia', () => {
    expect(parseFavorites(null)).toEqual([]);
  });

  it('não quebra com JSON inválido — o localStorage é editável pela pessoa', () => {
    expect(parseFavorites('{isso não é json')).toEqual([]);
  });

  it('descarta formato antigo que não seja lista', () => {
    expect(parseFavorites('{"produtos":["a"]}')).toEqual([]);
  });

  it('descarta entradas que não são id', () => {
    expect(parseFavorites('["a",null,42,"",{"id":"b"},"c"]')).toEqual(['a', 'c']);
  });

  it('remove repetidos e respeita o teto', () => {
    const guardado = JSON.stringify(['x', 'x', ...Array.from({ length: 300 }, (_, i) => `p${i}`)]);
    const lista = parseFavorites(guardado);

    expect(lista).toHaveLength(MAX_FAVORITES);
    expect(lista[0]).toBe('x');
    expect(new Set(lista).size).toBe(lista.length);
  });
});

describe('addFavorite', () => {
  it('põe o mais recente no topo', () => {
    expect(addFavorite(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('favoritar de novo apenas traz para o topo, sem duplicar', () => {
    expect(addFavorite(['a', 'b'], 'b')).toEqual(['b', 'a']);
  });

  it('ignora id vazio', () => {
    expect(addFavorite(['a'], '')).toEqual(['a']);
  });

  it('descarta o mais antigo ao estourar o teto', () => {
    const cheia = Array.from({ length: MAX_FAVORITES }, (_, i) => `p${i}`);
    const lista = addFavorite(cheia, 'novo');

    expect(lista).toHaveLength(MAX_FAVORITES);
    expect(lista[0]).toBe('novo');
    expect(lista).not.toContain(`p${MAX_FAVORITES - 1}`);
  });
});

describe('removeFavorite e toggleFavorite', () => {
  it('remove sem mexer no resto', () => {
    expect(removeFavorite(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('remover o que não está lá não muda nada', () => {
    expect(removeFavorite(['a'], 'z')).toEqual(['a']);
  });

  it('alterna nos dois sentidos', () => {
    expect(toggleFavorite(['a'], 'b')).toEqual(['b', 'a']);
    expect(toggleFavorite(['b', 'a'], 'b')).toEqual(['a']);
  });

  it('isFavorite responde a pergunta do coração do card', () => {
    expect(isFavorite(['a'], 'a')).toBe(true);
    expect(isFavorite(['a'], 'b')).toBe(false);
  });
});

describe('mergeFavorites', () => {
  it('une as duas listas no login, sem perder nenhum lado', () => {
    expect(mergeFavorites(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('o que estava no navegador vem primeiro, por ser o mais recente', () => {
    expect(mergeFavorites(['novo'], ['antigo'])[0]).toBe('novo');
  });

  it('conta sem favoritos não apaga os do navegador', () => {
    expect(mergeFavorites(['a'], [])).toEqual(['a']);
  });
});
