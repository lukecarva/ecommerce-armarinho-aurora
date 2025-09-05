import { describe, expect, it } from 'vitest';
import { normalizeSearchTerm, slugify, titleCaseFromErp } from './slug.js';

describe('slugify', () => {
  it('gera URL limpa a partir do nome do produto', () => {
    expect(slugify('Tricoline Estampado 100% Algodão')).toBe('tricoline-estampado-100-algodao');
    expect(slugify('Fios e Barbantes')).toBe('fios-e-barbantes');
    expect(slugify('Botão de Pérola (Pacote com 10 un)')).toBe('botao-de-perola-pacote-com-10-un');
  });

  it('remove cedilha e acentos', () => {
    expect(slugify('Coleção Sazonal')).toBe('colecao-sazonal');
    expect(slugify('Máquinas e Acessórios')).toBe('maquinas-e-acessorios');
  });

  it('não deixa hífen sobrando nas pontas', () => {
    expect(slugify('  --- Ofertas ---  ')).toBe('ofertas');
  });
});

describe('normalizeSearchTerm', () => {
  it('iguala a busca ao que o unaccent faz no Postgres', () => {
    expect(normalizeSearchTerm('TRICOLÍNE')).toBe('tricoline');
    expect(normalizeSearchTerm('  Fio   de  Rafia ')).toBe('fio de rafia');
  });
});

describe('titleCaseFromErp', () => {
  it('conserta nome em caixa alta vindo do Futura', () => {
    expect(titleCaseFromErp('TECIDO TRICOLINE 100% ALGODAO')).toBe('Tecido Tricoline 100% Algodao');
    expect(titleCaseFromErp('FIO DE RAFIA 300M')).toBe('Fio de Rafia 300m');
  });

  it('preserva nome já digitado em caixa mista', () => {
    expect(titleCaseFromErp('Tricoline Floral Digital Premium')).toBe(
      'Tricoline Floral Digital Premium',
    );
  });
});
