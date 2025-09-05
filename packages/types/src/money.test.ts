import { describe, expect, it } from 'vitest';
import { discountPercent, formatBRL, multiplyQuantity, parseBRL, sumCents } from './money.js';

describe('formatBRL', () => {
  it('formata centavos no padrão brasileiro', () => {
    expect(formatBRL(1590)).toBe('R$ 15,90');
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
  });
});

describe('parseBRL', () => {
  it('lê o formato brasileiro', () => {
    expect(parseBRL('15,90')).toBe(1590);
    expect(parseBRL('1.234,56')).toBe(123456);
    expect(parseBRL('R$ 35,90')).toBe(3590);
  });

  it('lê o formato americano, comum em exportação de ERP', () => {
    expect(parseBRL('15.90')).toBe(1590);
    expect(parseBRL('1,234.56')).toBe(123456);
  });

  it('trata ponto com 3 casas como separador de milhar', () => {
    // "1.234" em planilha de ERP é mil duzentos e trinta e quatro, não 1,234
    expect(parseBRL('1.234')).toBe(123400);
    expect(parseBRL('1.234.567')).toBe(123456700);
  });

  it('aceita número e valores sem separador', () => {
    expect(parseBRL(15.9)).toBe(1590);
    expect(parseBRL('16')).toBe(1600);
    expect(parseBRL('0,5')).toBe(50);
  });

  it('devolve null para entrada inválida', () => {
    expect(parseBRL('')).toBeNull();
    expect(parseBRL('sob consulta')).toBeNull();
    expect(parseBRL(null)).toBeNull();
    expect(parseBRL(undefined)).toBeNull();
  });
});

describe('multiplyQuantity', () => {
  it('multiplica por quantidade inteira', () => {
    expect(multiplyQuantity(1590, 2)).toBe(3180);
  });

  it('multiplica por quantidade fracionada de tecido', () => {
    // 2,5 metros de tricoline a R$ 15,90
    expect(multiplyQuantity(1590, 2.5)).toBe(3975);
    expect(multiplyQuantity(1990, 1.5)).toBe(2985);
  });

  it('arredonda ao centavo sem acumular erro de ponto flutuante', () => {
    expect(multiplyQuantity(333, 0.1)).toBe(33);
    expect(multiplyQuantity(1099, 3)).toBe(3297);
    expect(multiplyQuantity(1199, 0.3)).toBe(360);
  });
});

describe('sumCents', () => {
  it('soma o carrinho do design sem perder centavo', () => {
    // 2m tricoline + 1 fio de rafia + 1 pacote de botão
    expect(sumCents([3180, 3590, 1199])).toBe(7969);
    expect(formatBRL(sumCents([3180, 3590, 1199]))).toBe('R$ 79,69');
  });
});

describe('discountPercent', () => {
  it('calcula o percentual exibido na página de ofertas', () => {
    expect(discountPercent(2190, 1690)).toBe(23);
    expect(discountPercent(1390, 1099)).toBe(21);
  });

  it('devolve zero quando não há desconto', () => {
    expect(discountPercent(1590, 1590)).toBe(0);
    expect(discountPercent(1590, 1990)).toBe(0);
  });
});
