import { AVAILABILITIES, SALE_UNITS, type Availability, type SaleUnit } from './enums.js';
import { parseBRL, type Cents } from './money.js';
import { slugify, stripAccents, titleCaseFromErp } from './slug.js';

/**
 * Normalização da planilha do Futura.
 *
 * Exportação de ERP não é dado limpo: preço vem em três formatos, unidade vem
 * abreviada e sem padrão, nome vem em CAIXA ALTA, e a mesma planilha mistura
 * vírgula e ponto decimal. Tudo isso é traduzido aqui, com teste, antes de
 * chegar perto do banco.
 *
 * O casamento com o catálogo é sempre por `skuFutura`.
 */

/** Campos do catálogo que uma coluna da planilha pode alimentar. */
export const IMPORT_FIELDS = [
  'skuFutura',
  'name',
  'shortDesc',
  'description',
  'categoria',
  'marca',
  'unit',
  'saleStep',
  'minQty',
  'packSize',
  'price',
  'promoPrice',
  'qty',
  'status',
  'availability',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  skuFutura: 'Código no Futura',
  name: 'Nome',
  shortDesc: 'Resumo',
  description: 'Descrição',
  categoria: 'Categoria (nome)',
  marca: 'Marca (nome)',
  unit: 'Unidade de venda',
  saleStep: 'Passo de venda',
  minQty: 'Quantidade mínima',
  packSize: 'Itens por pacote',
  price: 'Preço',
  promoPrice: 'Preço promocional',
  qty: 'Quantidade em estoque',
  status: 'Status',
  availability: 'Disponibilidade',
};

/** Campos que cada tipo de importação aceita. */
export const FIELDS_BY_KIND: Record<'produtos' | 'precos' | 'estoque', ImportField[]> = {
  produtos: [...IMPORT_FIELDS],
  precos: ['skuFutura', 'price', 'promoPrice'],
  estoque: ['skuFutura', 'qty', 'availability'],
};

/** De cabeçalho da planilha para campo do catálogo. */
export type ColumnMap = Record<string, ImportField | ''>;

export interface ImportOptions {
  /** Atualiza o nome de produtos que já existem. Padrão: não sobrescreve. */
  atualizarNome?: boolean;
  /** Cria produtos que ainda não existem no catálogo. */
  criarAusentes?: boolean;
  /** Acréscimo percentual sobre o preço do ERP. `10` = +10%. */
  markupPercent?: number;
}

// ───────────────────────── Adivinhação do mapeamento ───────────────────────

/**
 * Palpite de mapeamento a partir dos cabeçalhos.
 *
 * A exportação do Futura usa nomes previsíveis (COD_PRODUTO, DESCRICAO,
 * VLR_VENDA). Acertar o palpite economiza o trabalho manual mais chato da
 * importação — e o operador sempre pode corrigir antes de aplicar.
 */
const PALPITES: Array<{ campo: ImportField; padroes: RegExp[] }> = [
  { campo: 'skuFutura', padroes: [/^(cod|codigo|sku|referencia|ref)/, /produto.*cod/] },
  { campo: 'name', padroes: [/^(descricao|desc|nome|produto|titulo)$/, /^descricao/] },
  { campo: 'price', padroes: [/(vlr|valor|preco|price).*(venda|varejo)/, /^(preco|valor|vlr)$/] },
  { campo: 'promoPrice', padroes: [/(promo|oferta|desconto)/] },
  { campo: 'qty', padroes: [/^(qtd|qtde|quantidade|estoque|saldo)/] },
  { campo: 'unit', padroes: [/^(un|unid|unidade|medida)/] },
  { campo: 'categoria', padroes: [/^(categoria|grupo|secao|departamento)/] },
  { campo: 'marca', padroes: [/^(marca|fabricante|fornecedor)/] },
  { campo: 'packSize', padroes: [/(embalagem|pacote|caixa|múltiplo|multiplo)/] },
  { campo: 'shortDesc', padroes: [/(resumo|complemento|detalhe)/] },
];

export function guessColumnMap(headers: string[], campos: ImportField[]): ColumnMap {
  const mapa: ColumnMap = {};
  const usados = new Set<ImportField>();

  for (const header of headers) {
    const normalizado = stripAccents(header)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const achado = PALPITES.find(
      (palpite) =>
        campos.includes(palpite.campo) &&
        !usados.has(palpite.campo) &&
        palpite.padroes.some((padrao) => padrao.test(normalizado)),
    );

    mapa[header] = achado?.campo ?? '';
    if (achado) usados.add(achado.campo);
  }

  return mapa;
}

// ──────────────────────────── Normalização ─────────────────────────────────

/**
 * Unidade de venda a partir do que o ERP escreve.
 * "MT", "M", "METRO", "mts" → metro. Desconhecido vira `null`, e a linha
 * mantém a unidade que o produto já tem.
 */
export function normalizeUnit(valor: string | null | undefined): SaleUnit | null {
  if (!valor) return null;

  const v = stripAccents(valor)
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  if (!v) return null;
  if (SALE_UNITS.includes(v as SaleUnit)) return v as SaleUnit;

  const tabela: Record<string, SaleUnit> = {
    m: 'metro',
    mt: 'metro',
    mts: 'metro',
    metros: 'metro',
    ml: 'metro',
    un: 'unidade',
    und: 'unidade',
    unid: 'unidade',
    unidades: 'unidade',
    pc: 'unidade',
    pca: 'unidade',
    peca: 'unidade',
    pecas: 'unidade',
    pct: 'pacote',
    pcte: 'pacote',
    pacotes: 'pacote',
    cx: 'pacote',
    caixa: 'pacote',
    kg: 'kg',
    kgs: 'kg',
    quilo: 'kg',
    quilos: 'kg',
    g: 'kg',
    cj: 'conjunto',
    conj: 'conjunto',
    kit: 'conjunto',
    jogo: 'conjunto',
  };

  return tabela[v] ?? null;
}

/** Quantidade numérica tolerante ao formato brasileiro. "1.234,500" → 1234.5 */
export function normalizeQuantityValue(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;

  const centavos = parseBRL(valor);
  return centavos === null ? null : centavos / 100;
}

/** Status do produto a partir de texto livre do ERP. */
export function normalizeStatus(valor: string | null | undefined): 'ativo' | 'inativo' | null {
  if (!valor) return null;

  const v = stripAccents(valor).toLowerCase().trim();

  if (['ativo', 'a', 's', 'sim', '1', 'true', 'habilitado'].includes(v)) return 'ativo';
  if (['inativo', 'i', 'n', 'nao', '0', 'false', 'desabilitado'].includes(v)) return 'inativo';
  return null;
}

export function normalizeAvailability(valor: string | null | undefined): Availability | null {
  if (!valor) return null;
  const v = stripAccents(valor)
    .toLowerCase()
    .replace(/[^a-z]/g, '_');

  return (AVAILABILITIES as readonly string[]).includes(v) ? (v as Availability) : null;
}

/** Aplica o markup configurado sobre o preço do ERP. */
export function applyMarkup(preco: Cents, markupPercent = 0): Cents {
  if (!markupPercent) return preco;
  return Math.max(0, Math.round(preco * (1 + markupPercent / 100)));
}

// ─────────────────────────── Leitura de uma linha ──────────────────────────

export interface ParsedRow {
  /** Número da linha na planilha, contando o cabeçalho. Usado no relatório. */
  linha: number;
  skuFutura: string | null;
  name?: string;
  slug?: string;
  shortDesc?: string;
  description?: string;
  categoria?: string;
  marca?: string;
  unit?: SaleUnit;
  saleStep?: number;
  minQty?: number;
  packSize?: number;
  price?: Cents;
  promoPrice?: Cents | null;
  qty?: number;
  status?: 'ativo' | 'inativo';
  availability?: Availability;
  erros: string[];
  avisos: string[];
}

/**
 * Converte uma linha bruta da planilha em dados do catálogo.
 *
 * Nunca lança: erros ficam na própria linha, para o relatório poder dizer
 * exatamente o que deu errado em cada uma sem interromper a importação.
 */
export function parseRow(
  bruta: Record<string, string>,
  mapa: ColumnMap,
  linha: number,
  opcoes: ImportOptions = {},
): ParsedRow {
  const saida: ParsedRow = { linha, skuFutura: null, erros: [], avisos: [] };

  const valorDe = (campo: ImportField): string | undefined => {
    const coluna = Object.keys(mapa).find((chave) => mapa[chave] === campo);
    if (!coluna) return undefined;
    const valor = bruta[coluna];
    return valor === undefined || valor === null ? undefined : String(valor).trim();
  };

  // ── Identificação ────────────────────────────────────────────────────────
  const sku = valorDe('skuFutura');
  if (!sku) {
    saida.erros.push('Sem código do Futura — não dá para casar com o catálogo');
    return saida;
  }
  saida.skuFutura = sku;

  // ── Nome ─────────────────────────────────────────────────────────────────
  const nome = valorDe('name');
  if (nome) {
    saida.name = titleCaseFromErp(nome);
    saida.slug = slugify(saida.name);
    if (saida.name.length > 160) {
      saida.name = saida.name.slice(0, 160);
      saida.avisos.push('Nome truncado em 160 caracteres');
    }
  }

  for (const campo of ['shortDesc', 'description', 'categoria', 'marca'] as const) {
    const valor = valorDe(campo);
    if (valor) saida[campo] = valor;
  }

  // ── Unidade ──────────────────────────────────────────────────────────────
  const unidadeBruta = valorDe('unit');
  if (unidadeBruta) {
    const unidade = normalizeUnit(unidadeBruta);
    if (unidade) saida.unit = unidade;
    else saida.avisos.push(`Unidade "${unidadeBruta}" não reconhecida — mantida a atual`);
  }

  for (const campo of ['saleStep', 'minQty'] as const) {
    const valor = normalizeQuantityValue(valorDe(campo));
    if (valor !== null) {
      if (valor > 0) saida[campo] = valor;
      else saida.erros.push(`${IMPORT_FIELD_LABELS[campo]} precisa ser maior que zero`);
    }
  }

  const pacote = normalizeQuantityValue(valorDe('packSize'));
  if (pacote !== null && pacote >= 1) saida.packSize = Math.round(pacote);

  // ── Preço ────────────────────────────────────────────────────────────────
  const precoBruto = valorDe('price');
  if (precoBruto !== undefined && precoBruto !== '') {
    const preco = parseBRL(precoBruto);
    if (preco === null) saida.erros.push(`Preço "${precoBruto}" não é um valor válido`);
    else if (preco < 0) saida.erros.push('Preço negativo');
    else saida.price = applyMarkup(preco, opcoes.markupPercent);
  }

  const promoBruta = valorDe('promoPrice');
  if (promoBruta !== undefined) {
    if (promoBruta === '' || promoBruta === '0') {
      saida.promoPrice = null;
    } else {
      const promo = parseBRL(promoBruta);
      if (promo === null) saida.avisos.push(`Preço promocional "${promoBruta}" ignorado`);
      else if (saida.price !== undefined && promo >= saida.price) {
        saida.avisos.push('Promoção maior ou igual ao preço — ignorada');
        saida.promoPrice = null;
      } else saida.promoPrice = promo;
    }
  }

  // ── Estoque ──────────────────────────────────────────────────────────────
  const quantidade = normalizeQuantityValue(valorDe('qty'));
  if (quantidade !== null) {
    // Estoque negativo é comum em ERP (venda lançada antes da entrada).
    // Para a vitrine, o que importa é que não há peça disponível.
    saida.qty = Math.max(0, quantidade);
    if (quantidade < 0) saida.avisos.push('Estoque negativo no ERP — tratado como zero');
  }

  const disponibilidade = normalizeAvailability(valorDe('availability'));
  if (disponibilidade) saida.availability = disponibilidade;

  const status = normalizeStatus(valorDe('status'));
  if (status) saida.status = status;

  return saida;
}

// ──────────────────────────────── Diferença ────────────────────────────────

export interface ExistingProduct {
  id: string;
  skuFutura: string | null;
  name: string;
  price: Cents;
  promoPrice: Cents | null;
  unit: SaleUnit;
  qty: number;
}

export type RowAction = 'criar' | 'atualizar' | 'sem_mudanca' | 'ignorar' | 'erro';

export interface RowDiff {
  linha: number;
  skuFutura: string | null;
  nome: string | null;
  acao: RowAction;
  /** { price: { de: 1590, para: 1390 } } */
  mudancas: Record<string, { de: unknown; para: unknown }>;
  erros: string[];
  avisos: string[];
}

/**
 * Compara a linha com o catálogo e decide o que fazer.
 *
 * É o que alimenta a simulação: antes de gravar qualquer coisa, o operador vê
 * quantos produtos entram, quantos preços mudam e quais linhas têm problema.
 */
export function diffRow(
  linha: ParsedRow,
  existente: ExistingProduct | undefined,
  opcoes: ImportOptions = {},
): RowDiff {
  const base: RowDiff = {
    linha: linha.linha,
    skuFutura: linha.skuFutura,
    nome: linha.name ?? existente?.name ?? null,
    acao: 'sem_mudanca',
    mudancas: {},
    erros: linha.erros,
    avisos: linha.avisos,
  };

  if (linha.erros.length > 0) return { ...base, acao: 'erro' };

  if (!existente) {
    if (!opcoes.criarAusentes) {
      return {
        ...base,
        acao: 'ignorar',
        avisos: [...base.avisos, 'Produto não existe no catálogo e a criação está desligada'],
      };
    }

    if (linha.price === undefined) {
      return { ...base, acao: 'erro', erros: ['Produto novo precisa de preço'] };
    }

    return { ...base, acao: 'criar', mudancas: { criado: { de: null, para: linha.name } } };
  }

  const mudancas: RowDiff['mudancas'] = {};

  // Nome só muda se o operador pedir: quem já ajustou o nome para a vitrine
  // não quer que a próxima planilha do ERP desfaça o trabalho.
  if (opcoes.atualizarNome && linha.name && linha.name !== existente.name) {
    mudancas.name = { de: existente.name, para: linha.name };
  }

  if (linha.price !== undefined && linha.price !== existente.price) {
    mudancas.price = { de: existente.price, para: linha.price };
  }

  if (linha.promoPrice !== undefined && linha.promoPrice !== existente.promoPrice) {
    mudancas.promoPrice = { de: existente.promoPrice, para: linha.promoPrice };
  }

  if (linha.unit && linha.unit !== existente.unit) {
    mudancas.unit = { de: existente.unit, para: linha.unit };
  }

  if (linha.qty !== undefined && linha.qty !== existente.qty) {
    mudancas.qty = { de: existente.qty, para: linha.qty };
  }

  return {
    ...base,
    acao: Object.keys(mudancas).length > 0 ? 'atualizar' : 'sem_mudanca',
    mudancas,
  };
}

export interface ImportSummary {
  total: number;
  criar: number;
  atualizar: number;
  semMudanca: number;
  ignorar: number;
  erro: number;
  /** SKUs repetidos na planilha — só a última ocorrência vale. */
  duplicados: string[];
}

export function summarize(diffs: RowDiff[]): ImportSummary {
  const vistos = new Map<string, number>();

  for (const diff of diffs) {
    if (!diff.skuFutura) continue;
    vistos.set(diff.skuFutura, (vistos.get(diff.skuFutura) ?? 0) + 1);
  }

  return {
    total: diffs.length,
    criar: diffs.filter((d) => d.acao === 'criar').length,
    atualizar: diffs.filter((d) => d.acao === 'atualizar').length,
    semMudanca: diffs.filter((d) => d.acao === 'sem_mudanca').length,
    ignorar: diffs.filter((d) => d.acao === 'ignorar').length,
    erro: diffs.filter((d) => d.acao === 'erro').length,
    duplicados: [...vistos.entries()].filter(([, n]) => n > 1).map(([sku]) => sku),
  };
}

// ───────────────────────────── Proteção do CSV ─────────────────────────────

/**
 * Neutraliza fórmula em célula exportada.
 *
 * Um produto chamado "=cmd|' /c calc'!A1" viraria comando ao abrir o CSV no
 * Excel. Prefixar com aspa simples mantém o texto visível e inofensivo.
 */
export function escapeCsvInjection(valor: string): string {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

/** Uma célula pronta para o CSV, com aspas e escape corretos. */
export function toCsvCell(valor: unknown): string {
  if (valor === null || valor === undefined) return '';

  const texto = escapeCsvInjection(String(valor));
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}
