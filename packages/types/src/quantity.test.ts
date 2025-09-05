import { describe, expect, it } from 'vitest';
import {
  decrementQuantity,
  defaultRulesFor,
  formatPackSize,
  formatQuantity,
  formatUnitPriceSuffix,
  incrementQuantity,
  normalizeQuantity,
} from './quantity.js';

describe('normalizeQuantity', () => {
  const tecido = { step: 0.5, min: 1 };

  it('arredonda para o passo de venda do tecido', () => {
    expect(normalizeQuantity(2.3, tecido)).toBe(2.5);
    expect(normalizeQuantity(2.1, tecido)).toBe(2);
    expect(normalizeQuantity(2.75, tecido)).toBe(3);
  });

  it('respeita a quantidade mínima', () => {
    expect(normalizeQuantity(0.2, tecido)).toBe(1);
    expect(normalizeQuantity(0, tecido)).toBe(1);
    expect(normalizeQuantity(-5, tecido)).toBe(1);
  });

  it('respeita o teto quando existe', () => {
    expect(normalizeQuantity(100, { step: 0.5, min: 1, max: 10 })).toBe(10);
  });

  it('mantém inteiros para itens vendidos por unidade', () => {
    const unidade = defaultRulesFor('unidade');
    expect(normalizeQuantity(3.4, unidade)).toBe(3);
    expect(normalizeQuantity(3.6, unidade)).toBe(4);
  });
});

describe('incrementQuantity / decrementQuantity', () => {
  const tecido = { step: 0.5, min: 1 };

  it('anda de meio em meio metro', () => {
    expect(incrementQuantity(1, tecido)).toBe(1.5);
    expect(incrementQuantity(1.5, tecido)).toBe(2);
    expect(decrementQuantity(2, tecido)).toBe(1.5);
  });

  it('não desce abaixo do mínimo', () => {
    expect(decrementQuantity(1, tecido)).toBe(1);
  });
});

describe('formatQuantity', () => {
  it('escreve a quantidade como o cliente lê', () => {
    expect(formatQuantity(2, 'metro')).toBe('2 metros');
    expect(formatQuantity(1, 'metro')).toBe('1 metro');
    expect(formatQuantity(2.5, 'metro')).toBe('2,5 metros');
    expect(formatQuantity(1, 'unidade')).toBe('1 un');
    expect(formatQuantity(3, 'pacote')).toBe('3 pacotes');
    expect(formatQuantity(0.5, 'kg')).toBe('0,5 kg');
  });
});

describe('formatUnitPriceSuffix', () => {
  it('devolve o sufixo do preço na vitrine', () => {
    expect(formatUnitPriceSuffix('metro')).toBe('/metro');
    expect(formatUnitPriceSuffix('unidade')).toBe('/un');
    expect(formatUnitPriceSuffix('pacote')).toBe('/pacote');
  });
});

describe('formatPackSize', () => {
  it('descreve a embalagem quando faz sentido', () => {
    expect(formatPackSize(10)).toBe('Pacote com 10 un');
    expect(formatPackSize(1)).toBeNull();
    expect(formatPackSize(null)).toBeNull();
  });
});
