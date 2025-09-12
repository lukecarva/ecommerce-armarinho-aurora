import { describe, expect, it } from 'vitest';
import {
  checkPassword,
  formatAddressLine,
  formatCep,
  formatPhoneBR,
  isUf,
  isValidCep,
  normalizeCep,
  normalizeEmail,
  PASSWORD_MIN_LENGTH,
} from './customers.js';

describe('checkPassword', () => {
  it('aceita senha longa o bastante, sem exigir símbolo ou maiúscula', () => {
    expect(checkPassword('linha de costura azul')).toBeNull();
    expect(checkPassword('tricoline')).toBeNull();
  });

  it('recusa curta demais', () => {
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('curta');
  });

  it('recusa as senhas que todo vazamento tem', () => {
    expect(checkPassword('12345678')).toBe('comum');
    expect(checkPassword('senha123')).toBe('comum');
  });

  it('a lista de comuns ignora caixa e acento', () => {
    expect(checkPassword('SENHA123')).toBe('comum');
    expect(checkPassword('Aurora123')).toBe('comum');
  });

  it('recusa colagem acidental enorme', () => {
    expect(checkPassword('x'.repeat(500))).toBe('longa');
  });
});

describe('normalizeEmail', () => {
  it('iguala caixa e tira espaço — é a mesma caixa de entrada', () => {
    expect(normalizeEmail('  Maria@Gmail.COM ')).toBe('maria@gmail.com');
  });
});

describe('CEP', () => {
  it('normaliza para oito dígitos', () => {
    expect(normalizeCep('01000-000')).toBe('01000000');
    expect(normalizeCep('01.000-000')).toBe('01000000');
  });

  it('valida só o que tem oito dígitos e existe', () => {
    expect(isValidCep('01000-000')).toBe(true);
    expect(isValidCep('0100000')).toBe(false);
    // O que o autocompletar às vezes preenche.
    expect(isValidCep('00000-000')).toBe(false);
  });

  it('formata com hífen', () => {
    expect(formatCep('01000000')).toBe('01000-000');
  });

  it('devolve como veio o que não é CEP', () => {
    expect(formatCep('abc')).toBe('abc');
  });
});

describe('isUf', () => {
  it('reconhece a sigla em qualquer caixa', () => {
    expect(isUf('SP')).toBe(true);
    expect(isUf('sp')).toBe(true);
    expect(isUf('XX')).toBe(false);
  });
});

describe('formatAddressLine', () => {
  it('monta a linha que a atendente copia para o motoboy', () => {
    expect(
      formatAddressLine({
        street: 'Av. Exemplo',
        number: '1000',
        district: 'Centro',
        city: 'São Paulo',
        uf: 'SP',
      }),
    ).toBe('Av. Exemplo, 1000 — Centro, São Paulo/SP');
  });

  it('inclui o complemento quando existe', () => {
    expect(
      formatAddressLine({
        street: 'Rua A',
        number: '10',
        complement: 'ap 32',
        district: 'Centro',
        city: 'São Paulo',
        uf: 'SP',
      }),
    ).toBe('Rua A, 10 (ap 32) — Centro, São Paulo/SP');
  });
});

describe('formatPhoneBR', () => {
  it('formata celular com e sem DDI', () => {
    expect(formatPhoneBR('5511999990000')).toBe('(11) 99999-0000');
    expect(formatPhoneBR('11999990000')).toBe('(11) 99999-0000');
  });

  it('formata fixo', () => {
    expect(formatPhoneBR('1130000000')).toBe('(11) 3000-0000');
  });

  it('devolve cru o que não parece telefone brasileiro', () => {
    expect(formatPhoneBR('123')).toBe('123');
  });
});
