import iconv from 'iconv-lite';
import { describe, expect, it } from 'vitest';
import {
  SpreadsheetParser,
  celulaParaTexto,
  decodificar,
  detectarDelimitador,
} from './spreadsheet.parser';

const parser = new SpreadsheetParser();

const arquivo = (conteudo: Buffer | string, nome: string) => ({
  buffer: typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo,
  originalname: nome,
});

describe('decodificar', () => {
  it('lê UTF-8 direto', () => {
    const { texto, encoding } = decodificar(Buffer.from('Algodão', 'utf8'));
    expect(texto).toBe('Algodão');
    expect(encoding).toBe('utf-8');
  });

  it('remove o BOM que o Excel coloca', () => {
    const comBom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('COD;NOME', 'utf8'),
    ]);
    const { texto, encoding } = decodificar(comBom);
    expect(texto).toBe('COD;NOME');
    expect(encoding).toContain('BOM');
  });

  it('cai para Windows-1252 quando o UTF-8 falha — o caso do ERP', () => {
    const { texto, encoding } = decodificar(iconv.encode('Tecido Algodão Coração', 'win1252'));
    expect(texto).toBe('Tecido Algodão Coração');
    expect(encoding).toBe('windows-1252');
  });
});

describe('detectarDelimitador', () => {
  it('reconhece o ponto e vírgula do Excel em português', () => {
    expect(detectarDelimitador('COD;DESCRICAO;VLR_VENDA\n1;Tecido;15,90')).toBe(';');
  });

  it('reconhece vírgula e tabulação', () => {
    expect(detectarDelimitador('cod,nome,preco\n1,Tecido,15.90')).toBe(',');
    expect(detectarDelimitador('cod\tnome\tpreco')).toBe('\t');
  });

  it('não se confunde com vírgula decimal em arquivo separado por ponto e vírgula', () => {
    // A vírgula aparece mais nos dados, mas o cabeçalho é o que decide.
    expect(detectarDelimitador('COD;NOME;PRECO\n1;Tecido;15,90\n2;Fio;35,90')).toBe(';');
  });
});

describe('celulaParaTexto', () => {
  it('extrai o resultado da fórmula, não a fórmula', () => {
    expect(celulaParaTexto({ formula: 'A1*2', result: 31.8 })).toBe('31.8');
  });

  it('junta texto rico em uma string só', () => {
    expect(celulaParaTexto({ richText: [{ text: 'Tricoline ' }, { text: 'Premium' }] })).toBe(
      'Tricoline Premium',
    );
  });

  it('trata número, data e vazio', () => {
    expect(celulaParaTexto(15.9)).toBe('15.9');
    expect(celulaParaTexto(new Date('2026-09-08T00:00:00Z'))).toBe('2026-09-08');
    expect(celulaParaTexto(null)).toBe('');
  });
});

describe('SpreadsheetParser — CSV', () => {
  it('lê a exportação típica do Futura', async () => {
    const csv = [
      'COD_PRODUTO;DESCRICAO;VLR_VENDA;QTD_ESTOQUE;UNIDADE',
      '10001;TECIDO TRICOLINE 100% ALGODAO;15,90;120;MT',
      '20001;FIO DE RAFIA 300M;35,90;25;UN',
    ].join('\r\n');

    const dados = await parser.parse(arquivo(csv, 'produtos.csv'));

    expect(dados.headers).toEqual([
      'COD_PRODUTO',
      'DESCRICAO',
      'VLR_VENDA',
      'QTD_ESTOQUE',
      'UNIDADE',
    ]);
    expect(dados.rows).toHaveLength(2);
    expect(dados.rows[0]).toMatchObject({ COD_PRODUTO: '10001', VLR_VENDA: '15,90' });
    expect(dados.deteccao).toMatchObject({ formato: 'csv', delimitador: 'ponto e vírgula' });
  });

  it('preserva acentos de arquivo em Windows-1252', async () => {
    const csv = iconv.encode('COD;DESCRICAO\n1;Algodão Coração', 'win1252');
    const dados = await parser.parse(arquivo(csv, 'produtos.csv'));

    expect(dados.rows[0]?.DESCRICAO).toBe('Algodão Coração');
    expect(dados.deteccao.encoding).toBe('windows-1252');
  });

  it('respeita campo entre aspas com o separador dentro', async () => {
    const csv = 'COD;DESCRICAO\n1;"Tecido; listrado"';
    const dados = await parser.parse(arquivo(csv, 'produtos.csv'));
    expect(dados.rows[0]?.DESCRICAO).toBe('Tecido; listrado');
  });

  it('descarta linhas em branco no meio do arquivo', async () => {
    const csv = 'COD;NOME\n1;A\n\n\n2;B\n';
    const dados = await parser.parse(arquivo(csv, 'produtos.csv'));
    expect(dados.rows).toHaveLength(2);
  });

  it('apara espaço no cabeçalho e nos valores', async () => {
    const csv = ' COD ; DESCRICAO \n 1 ; Tecido ';
    const dados = await parser.parse(arquivo(csv, 'produtos.csv'));
    expect(dados.headers).toEqual(['COD', 'DESCRICAO']);
    expect(dados.rows[0]).toEqual({ COD: '1', DESCRICAO: 'Tecido' });
  });

  it('recusa arquivo sem nenhuma linha de produto', async () => {
    await expect(parser.parse(arquivo('COD;NOME\n', 'vazio.csv'))).rejects.toThrow(
      /nenhuma linha/i,
    );
  });

  it('recusa formato que não sabe ler, com instrução clara', async () => {
    await expect(parser.parse(arquivo('qualquer coisa', 'produtos.pdf'))).rejects.toThrow(
      /CSV, TXT, TSV ou XLSX/,
    );
  });

  it('lê TXT separado por tabulação', async () => {
    const txt = 'COD\tNOME\tPRECO\n1\tTecido\t15,90';
    const dados = await parser.parse(arquivo(txt, 'produtos.txt'));
    expect(dados.rows[0]).toEqual({ COD: '1', NOME: 'Tecido', PRECO: '15,90' });
    expect(dados.deteccao.delimitador).toBe('tabulação');
  });
});
