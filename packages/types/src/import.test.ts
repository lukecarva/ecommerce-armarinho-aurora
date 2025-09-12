import { describe, expect, it } from 'vitest';
import {
  applyMarkup,
  diffRow,
  escapeCsvInjection,
  guessColumnMap,
  IMPORT_FIELDS,
  normalizeAvailability,
  normalizeQuantityValue,
  normalizeStatus,
  normalizeUnit,
  parseRow,
  summarize,
  toCsvCell,
  type ColumnMap,
  type ExistingProduct,
} from './import.js';

describe('guessColumnMap', () => {
  it('reconhece os cabeçalhos típicos da exportação do Futura', () => {
    const mapa = guessColumnMap(
      ['COD_PRODUTO', 'DESCRICAO', 'VLR_VENDA', 'QTD_ESTOQUE', 'UNIDADE'],
      [...IMPORT_FIELDS],
    );

    expect(mapa).toEqual({
      COD_PRODUTO: 'skuFutura',
      DESCRICAO: 'name',
      VLR_VENDA: 'price',
      QTD_ESTOQUE: 'qty',
      UNIDADE: 'unit',
    });
  });

  it('ignora acento e maiúscula no cabeçalho', () => {
    const mapa = guessColumnMap(['Código', 'Descrição', 'Preço'], [...IMPORT_FIELDS]);
    expect(mapa['Código']).toBe('skuFutura');
    expect(mapa['Descrição']).toBe('name');
    expect(mapa['Preço']).toBe('price');
  });

  it('não mapeia a mesma coluna duas vezes', () => {
    const mapa = guessColumnMap(['CODIGO', 'COD_BARRAS'], [...IMPORT_FIELDS]);
    expect(mapa['CODIGO']).toBe('skuFutura');
    expect(mapa['COD_BARRAS']).toBe('');
  });

  it('só oferece os campos permitidos para o tipo de importação', () => {
    const mapa = guessColumnMap(['CODIGO', 'DESCRICAO', 'VLR_VENDA'], ['skuFutura', 'price']);
    expect(mapa['DESCRICAO']).toBe('');
    expect(mapa['VLR_VENDA']).toBe('price');
  });

  it('deixa vazio o que não reconhece, em vez de chutar', () => {
    const mapa = guessColumnMap(['XPTO_42'], [...IMPORT_FIELDS]);
    expect(mapa['XPTO_42']).toBe('');
  });
});

describe('normalizeUnit', () => {
  it('traduz as abreviações que o ERP usa', () => {
    expect(normalizeUnit('MT')).toBe('metro');
    expect(normalizeUnit('M')).toBe('metro');
    expect(normalizeUnit('mts')).toBe('metro');
    expect(normalizeUnit('UN')).toBe('unidade');
    expect(normalizeUnit('PÇ')).toBe('unidade');
    expect(normalizeUnit('PCT')).toBe('pacote');
    expect(normalizeUnit('CX')).toBe('pacote');
    expect(normalizeUnit('KG')).toBe('kg');
    expect(normalizeUnit('KIT')).toBe('conjunto');
  });

  it('aceita o valor já no formato do catálogo', () => {
    expect(normalizeUnit('metro')).toBe('metro');
    expect(normalizeUnit('pacote')).toBe('pacote');
  });

  it('devolve null para o que não conhece — melhor manter o que já está lá', () => {
    expect(normalizeUnit('ROLO')).toBeNull();
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
  });
});

describe('normalizeStatus e normalizeAvailability', () => {
  it('entende as várias formas de "ativo" que aparecem em ERP', () => {
    for (const valor of ['ATIVO', 'S', 'Sim', '1', 'true']) {
      expect(normalizeStatus(valor)).toBe('ativo');
    }
    for (const valor of ['INATIVO', 'N', 'Não', '0', 'false']) {
      expect(normalizeStatus(valor)).toBe('inativo');
    }
    expect(normalizeStatus('talvez')).toBeNull();
  });

  it('lê a disponibilidade ignorando acento e separador', () => {
    expect(normalizeAvailability('em estoque')).toBe('em_estoque');
    expect(normalizeAvailability('ÚLTIMAS UNIDADES')).toBe('ultimas_unidades');
    expect(normalizeAvailability('qualquer coisa')).toBeNull();
  });
});

describe('normalizeQuantityValue', () => {
  it('lê quantidade no formato brasileiro', () => {
    expect(normalizeQuantityValue('2,5')).toBe(2.5);
    expect(normalizeQuantityValue('1.234,5')).toBe(1234.5);
    expect(normalizeQuantityValue('120')).toBe(120);
    expect(normalizeQuantityValue(48)).toBe(48);
  });

  it('trata vazio como ausência, não como zero', () => {
    expect(normalizeQuantityValue('')).toBeNull();
    expect(normalizeQuantityValue(null)).toBeNull();
  });
});

describe('applyMarkup', () => {
  it('aplica o acréscimo sobre o preço do ERP', () => {
    expect(applyMarkup(1000, 10)).toBe(1100);
    expect(applyMarkup(1590, 0)).toBe(1590);
    expect(applyMarkup(1590)).toBe(1590);
  });

  it('aceita desconto e nunca devolve negativo', () => {
    expect(applyMarkup(1000, -20)).toBe(800);
    expect(applyMarkup(1000, -200)).toBe(0);
  });
});

// ─────────────────────────────── parseRow ──────────────────────────────────

const MAPA: ColumnMap = {
  COD_PRODUTO: 'skuFutura',
  DESCRICAO: 'name',
  VLR_VENDA: 'price',
  QTD_ESTOQUE: 'qty',
  UNIDADE: 'unit',
};

describe('parseRow', () => {
  it('normaliza a linha típica do Futura', () => {
    const linha = parseRow(
      {
        COD_PRODUTO: '10001',
        DESCRICAO: 'TECIDO TRICOLINE 100% ALGODAO',
        VLR_VENDA: '15,90',
        QTD_ESTOQUE: '120',
        UNIDADE: 'MT',
      },
      MAPA,
      2,
    );

    expect(linha.erros).toEqual([]);
    expect(linha.skuFutura).toBe('10001');
    expect(linha.name).toBe('Tecido Tricoline 100% Algodao');
    expect(linha.slug).toBe('tecido-tricoline-100-algodao');
    expect(linha.price).toBe(1590);
    expect(linha.qty).toBe(120);
    expect(linha.unit).toBe('metro');
  });

  it('rejeita linha sem código, que não teria como casar', () => {
    const linha = parseRow({ DESCRICAO: 'Sem código' }, MAPA, 5);
    expect(linha.erros[0]).toContain('Sem código do Futura');
    expect(linha.skuFutura).toBeNull();
  });

  it('reporta preço inválido em vez de gravar lixo', () => {
    const linha = parseRow({ COD_PRODUTO: '1', VLR_VENDA: 'sob consulta' }, MAPA, 3);
    expect(linha.erros[0]).toContain('não é um valor válido');
    expect(linha.price).toBeUndefined();
  });

  it('lê o formato americano que também aparece na exportação', () => {
    expect(parseRow({ COD_PRODUTO: '1', VLR_VENDA: '15.90' }, MAPA, 2).price).toBe(1590);
  });

  it('avisa sobre unidade desconhecida sem invalidar a linha', () => {
    const linha = parseRow({ COD_PRODUTO: '1', UNIDADE: 'ROLO' }, MAPA, 2);
    expect(linha.erros).toEqual([]);
    expect(linha.unit).toBeUndefined();
    expect(linha.avisos[0]).toContain('ROLO');
  });

  it('trata estoque negativo do ERP como zero, com aviso', () => {
    // Acontece quando a venda é lançada antes da entrada da mercadoria.
    const linha = parseRow({ COD_PRODUTO: '1', QTD_ESTOQUE: '-3' }, MAPA, 2);
    expect(linha.qty).toBe(0);
    expect(linha.avisos[0]).toContain('negativo');
  });

  it('aplica o markup configurado', () => {
    const linha = parseRow({ COD_PRODUTO: '1', VLR_VENDA: '10,00' }, MAPA, 2, {
      markupPercent: 15,
    });
    expect(linha.price).toBe(1150);
  });

  it('ignora promoção que não é desconto', () => {
    const mapa: ColumnMap = { ...MAPA, VLR_PROMO: 'promoPrice' };
    const linha = parseRow({ COD_PRODUTO: '1', VLR_VENDA: '15,90', VLR_PROMO: '19,90' }, mapa, 2);
    expect(linha.promoPrice).toBeNull();
    expect(linha.avisos[0]).toContain('maior ou igual');
  });

  it('promoção zerada limpa a promoção existente', () => {
    const mapa: ColumnMap = { ...MAPA, VLR_PROMO: 'promoPrice' };
    expect(parseRow({ COD_PRODUTO: '1', VLR_PROMO: '0' }, mapa, 2).promoPrice).toBeNull();
    expect(parseRow({ COD_PRODUTO: '1', VLR_PROMO: '' }, mapa, 2).promoPrice).toBeNull();
  });

  it('trunca nome absurdamente longo em vez de estourar a coluna', () => {
    const linha = parseRow({ COD_PRODUTO: '1', DESCRICAO: 'Tecido '.repeat(40) }, MAPA, 2);
    expect(linha.name!.length).toBe(160);
    expect(linha.avisos[0]).toContain('truncado');
  });
});

// ──────────────────────────────── diffRow ──────────────────────────────────

const EXISTENTE: ExistingProduct = {
  id: 'p1',
  skuFutura: '10001',
  name: 'Tricoline Estampado 100% Algodão',
  price: 1590,
  promoPrice: null,
  unit: 'metro',
  qty: 120,
};

describe('diffRow', () => {
  const linhaBase = (extra: Partial<ReturnType<typeof parseRow>> = {}) => ({
    linha: 2,
    skuFutura: '10001',
    erros: [],
    avisos: [],
    ...extra,
  });

  it('detecta que só o preço mudou', () => {
    const diff = diffRow(linhaBase({ price: 1390 }), EXISTENTE);
    expect(diff.acao).toBe('atualizar');
    expect(diff.mudancas).toEqual({ price: { de: 1590, para: 1390 } });
  });

  it('reconhece quando nada mudou — o caso mais comum na reimportação', () => {
    const diff = diffRow(linhaBase({ price: 1590, qty: 120 }), EXISTENTE);
    expect(diff.acao).toBe('sem_mudanca');
    expect(diff.mudancas).toEqual({});
  });

  it('não sobrescreve o nome curado sem o operador pedir', () => {
    const linha = linhaBase({ name: 'TECIDO TRICOLINE', price: 1590 });

    expect(diffRow(linha, EXISTENTE).mudancas.name).toBeUndefined();
    expect(diffRow(linha, EXISTENTE, { atualizarNome: true }).mudancas.name).toEqual({
      de: EXISTENTE.name,
      para: 'TECIDO TRICOLINE',
    });
  });

  it('ignora produto ausente quando a criação está desligada', () => {
    const diff = diffRow(linhaBase({ price: 1590 }), undefined);
    expect(diff.acao).toBe('ignorar');
    expect(diff.avisos[0]).toContain('não existe no catálogo');
  });

  it('cria produto ausente quando o operador pede', () => {
    const diff = diffRow(linhaBase({ name: 'Novo', price: 1590 }), undefined, {
      criarAusentes: true,
    });
    expect(diff.acao).toBe('criar');
  });

  it('produto novo sem preço é erro, não criação silenciosa', () => {
    const diff = diffRow(linhaBase({ name: 'Novo' }), undefined, { criarAusentes: true });
    expect(diff.acao).toBe('erro');
    expect(diff.erros[0]).toContain('precisa de preço');
  });

  it('linha com erro de leitura não vira atualização', () => {
    const diff = diffRow(
      { linha: 2, skuFutura: '1', erros: ['Preço inválido'], avisos: [] },
      EXISTENTE,
    );
    expect(diff.acao).toBe('erro');
    expect(diff.mudancas).toEqual({});
  });
});

describe('summarize', () => {
  it('conta as ações e aponta SKUs repetidos na planilha', () => {
    const resumo = summarize([
      { linha: 2, skuFutura: '1', nome: 'A', acao: 'criar', mudancas: {}, erros: [], avisos: [] },
      {
        linha: 3,
        skuFutura: '2',
        nome: 'B',
        acao: 'atualizar',
        mudancas: {},
        erros: [],
        avisos: [],
      },
      {
        linha: 4,
        skuFutura: '2',
        nome: 'B',
        acao: 'atualizar',
        mudancas: {},
        erros: [],
        avisos: [],
      },
      { linha: 5, skuFutura: '3', nome: 'C', acao: 'erro', mudancas: {}, erros: ['x'], avisos: [] },
      {
        linha: 6,
        skuFutura: '4',
        nome: 'D',
        acao: 'sem_mudanca',
        mudancas: {},
        erros: [],
        avisos: [],
      },
    ]);

    expect(resumo).toEqual({
      total: 5,
      criar: 1,
      atualizar: 2,
      semMudanca: 1,
      ignorar: 0,
      erro: 1,
      duplicados: ['2'],
    });
  });
});

// ────────────────────────── Proteção do CSV ────────────────────────────────

describe('escapeCsvInjection', () => {
  it('neutraliza fórmula que o Excel executaria ao abrir', () => {
    expect(escapeCsvInjection("=cmd|' /c calc'!A1")).toBe("'=cmd|' /c calc'!A1");
    expect(escapeCsvInjection('+1+1')).toBe("'+1+1");
    expect(escapeCsvInjection('-2+3')).toBe("'-2+3");
    expect(escapeCsvInjection('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('não mexe em texto normal', () => {
    expect(escapeCsvInjection('Tricoline 100% Algodão')).toBe('Tricoline 100% Algodão');
    expect(escapeCsvInjection('15,90')).toBe('15,90');
  });
});

describe('toCsvCell', () => {
  it('protege aspas, ponto e vírgula e quebra de linha', () => {
    expect(toCsvCell('Tecido "premium"')).toBe('"Tecido ""premium"""');
    expect(toCsvCell('a;b')).toBe('"a;b"');
    expect(toCsvCell('linha1\nlinha2')).toBe('"linha1\nlinha2"');
  });

  it('trata ausência como célula vazia', () => {
    expect(toCsvCell(null)).toBe('');
    expect(toCsvCell(undefined)).toBe('');
  });

  it('protege fórmula mesmo quando precisa de aspas', () => {
    expect(toCsvCell('=A1;B2')).toBe('"\'=A1;B2"');
  });
});
