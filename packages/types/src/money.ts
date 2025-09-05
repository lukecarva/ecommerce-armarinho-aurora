/**
 * Dinheiro no projeto é sempre **centavos inteiros**.
 *
 * Preço em ponto flutuante é a origem clássica de divergência de centavo entre
 * carrinho, mensagem do WhatsApp e relatório. O banco guarda `numeric`, a API
 * converte para centavos na borda, e daqui para dentro tudo é inteiro.
 */
export type Cents = number;

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * O `Intl` separa "R$" do número com espaço não-quebrável (U+00A0 ou U+202F).
 * Esse caractere vaza para a URL do WhatsApp, para o CSV exportado e para
 * qualquer comparação de string. Normalizamos para espaço comum na saída.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/\s/g, ' ');
}

/** 1590 → "R$ 15,90" */
export function formatBRL(cents: Cents): string {
  return normalizeSpaces(BRL_FORMATTER.format(cents / 100));
}

/** 1590 → "15,90" (sem o símbolo, para tabelas e planilhas) */
export function formatAmount(cents: Cents): string {
  return normalizeSpaces(
    (cents / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );
}

/**
 * Converte texto de preço em centavos. Tolerante aos formatos que aparecem
 * em exportação de ERP, que mistura padrão brasileiro e americano.
 *
 * Regra de desambiguação quando há só ponto:
 * exatamente 3 dígitos depois dele = separador de milhar ("1.234" → 123400).
 * Qualquer outra quantidade = separador decimal ("15.90" → 1590).
 *
 * @returns centavos, ou `null` se não for um número reconhecível.
 */
export function parseBRL(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }

  const cleaned = input
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\s/g, '');

  if (cleaned === '') return null;
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;

  const negative = cleaned.startsWith('-');
  const digitsOnly = negative ? cleaned.slice(1) : cleaned;

  const lastComma = digitsOnly.lastIndexOf(',');
  const lastDot = digitsOnly.lastIndexOf('.');

  let normalized: string;

  if (lastComma >= 0 && lastDot >= 0) {
    // Ambos presentes: o mais à direita é o decimal.
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = digitsOnly.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    normalized = digitsOnly.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    const decimals = digitsOnly.length - lastDot - 1;
    const multipleDots = digitsOnly.indexOf('.') !== lastDot;
    normalized = decimals === 3 || multipleDots ? digitsOnly.split('.').join('') : digitsOnly;
  } else {
    normalized = digitsOnly;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100) * (negative ? -1 : 1);
}

/**
 * Multiplica preço unitário por quantidade — que pode ser fracionada
 * (2,5 metros de tecido). Arredonda para o centavo mais próximo.
 */
export function multiplyQuantity(unitPrice: Cents, quantity: number): Cents {
  // Quantidade é escalada para inteiro (3 casas cobrem 0,5m, 0,25m e 0,1kg)
  // antes da multiplicação, evitando o acúmulo de erro do ponto flutuante.
  const scaled = Math.round(quantity * 1000);
  return Math.round((unitPrice * scaled) / 1000);
}

/** Soma segura de centavos. */
export function sumCents(values: Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}

/** Percentual de desconto entre dois preços: (1990, 1590) → 20 */
export function discountPercent(from: Cents, to: Cents): number {
  if (from <= 0 || to >= from) return 0;
  return Math.round(((from - to) / from) * 100);
}
