import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import iconv from 'iconv-lite';
import Papa from 'papaparse';

/**
 * Leitura de planilha do Futura.
 *
 * O que chega não é previsível: o ERP exporta CSV com ponto e vírgula em
 * Windows-1252, TXT delimitado por tabulação, ou XLSX. Este módulo descobre
 * codificação e separador sozinho, porque exigir que o operador saiba o que é
 * "latin-1" seria transferir um problema nosso para ele.
 */

export interface SheetData {
  headers: string[];
  rows: Array<Record<string, string>>;
  /** O que foi detectado, para o painel mostrar e o operador conferir. */
  deteccao: {
    formato: 'csv' | 'xlsx';
    encoding?: string;
    delimitador?: string;
  };
}

/** Limite de linhas por importação. Acima disso, dividir o arquivo. */
export const MAX_LINHAS = 20_000;

@Injectable()
export class SpreadsheetParser {
  async parse(arquivo: { buffer: Buffer; originalname: string }): Promise<SheetData> {
    const nome = arquivo.originalname.toLowerCase();

    if (nome.endsWith('.xlsx') || nome.endsWith('.xlsm')) {
      return this.parseXlsx(arquivo.buffer);
    }

    if (nome.endsWith('.csv') || nome.endsWith('.txt') || nome.endsWith('.tsv')) {
      return this.parseCsv(arquivo.buffer);
    }

    throw new BadRequestException(
      'Formato não reconhecido. Envie CSV, TXT, TSV ou XLSX exportado do Futura.',
    );
  }

  // ─────────────────────────────── CSV ─────────────────────────────────────

  private parseCsv(buffer: Buffer): SheetData {
    const { texto, encoding } = decodificar(buffer);
    const delimitador = detectarDelimitador(texto);

    const resultado = Papa.parse<Record<string, string>>(texto, {
      header: true,
      delimiter: delimitador,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
    });

    const headers = (resultado.meta.fields ?? []).filter((h) => h.length > 0);

    if (headers.length === 0) {
      throw new BadRequestException(
        'Não encontrei o cabeçalho. A primeira linha do arquivo precisa ter os nomes das colunas.',
      );
    }

    const rows = resultado.data
      .map((linha) => normalizarLinha(linha, headers))
      .filter((linha) => Object.values(linha).some((valor) => valor !== ''));

    this.assertTamanho(rows.length);

    return {
      headers,
      rows,
      deteccao: { formato: 'csv', encoding, delimitador: nomeDelimitador(delimitador) },
    };
  }

  // ────────────────────────────── XLSX ─────────────────────────────────────

  private async parseXlsx(buffer: Buffer): Promise<SheetData> {
    const workbook = new ExcelJS.Workbook();

    try {
      // O cast é necessário: o tipo do exceljs pede ArrayBuffer, mas a
      // implementação aceita Buffer do Node — que é o que o upload entrega.
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Não consegui abrir o XLSX. O arquivo pode estar corrompido.');
    }

    const planilha = workbook.worksheets[0];
    if (!planilha) throw new BadRequestException('A planilha está vazia.');

    const linhaCabecalho = planilha.getRow(1);
    const headers: string[] = [];

    linhaCabecalho.eachCell({ includeEmpty: false }, (celula, coluna) => {
      headers[coluna - 1] = String(celula.value ?? '').trim();
    });

    const nomes = headers.filter((h) => h && h.length > 0);
    if (nomes.length === 0) {
      throw new BadRequestException(
        'Não encontrei o cabeçalho. A primeira linha da planilha precisa ter os nomes das colunas.',
      );
    }

    const rows: Array<Record<string, string>> = [];

    planilha.eachRow({ includeEmpty: false }, (linha, numero) => {
      if (numero === 1) return;

      const registro: Record<string, string> = {};
      let temConteudo = false;

      headers.forEach((header, indice) => {
        if (!header) return;
        const valor = celulaParaTexto(linha.getCell(indice + 1).value);
        registro[header] = valor;
        if (valor !== '') temConteudo = true;
      });

      if (temConteudo) rows.push(registro);
    });

    this.assertTamanho(rows.length);

    return { headers: nomes, rows, deteccao: { formato: 'xlsx' } };
  }

  private assertTamanho(linhas: number): void {
    if (linhas === 0) {
      throw new BadRequestException('O arquivo não tem nenhuma linha de produto.');
    }

    if (linhas > MAX_LINHAS) {
      throw new BadRequestException(
        `O arquivo tem ${linhas.toLocaleString('pt-BR')} linhas, acima do limite de ` +
          `${MAX_LINHAS.toLocaleString('pt-BR')}. Divida em arquivos menores.`,
      );
    }
  }
}

// ─────────────────────────────── Auxiliares ────────────────────────────────

/**
 * Descobre a codificação do arquivo.
 *
 * Exportação de ERP no Windows costuma vir em Windows-1252. Tentamos UTF-8
 * primeiro e, se aparecer o caractere de substituição (�), refazemos em 1252 —
 * é o que salva "Algodão" de virar "Algod�o".
 */
export function decodificar(buffer: Buffer): { texto: string; encoding: string } {
  // BOM de UTF-8: não há o que adivinhar.
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { texto: buffer.subarray(3).toString('utf8'), encoding: 'utf-8 (BOM)' };
  }

  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('�')) {
    return { texto: utf8, encoding: 'utf-8' };
  }

  return { texto: iconv.decode(buffer, 'win1252'), encoding: 'windows-1252' };
}

/**
 * Descobre o separador contando ocorrências na linha de cabeçalho.
 *
 * O ponto e vírgula é o padrão do Excel em português, e é o que o Futura
 * exporta — mas o arquivo pode chegar com vírgula ou tabulação.
 */
export function detectarDelimitador(texto: string): string {
  const cabecalho = texto.split(/\r?\n/, 1)[0] ?? '';
  const candidatos = [';', ',', '\t', '|'];

  let melhor = ';';
  let maior = 0;

  for (const candidato of candidatos) {
    const quantidade = cabecalho.split(candidato).length - 1;
    if (quantidade > maior) {
      maior = quantidade;
      melhor = candidato;
    }
  }

  return melhor;
}

function nomeDelimitador(delimitador: string): string {
  return (
    { ';': 'ponto e vírgula', ',': 'vírgula', '\t': 'tabulação', '|': 'barra' }[delimitador] ??
    delimitador
  );
}

/** Garante que toda linha tenha todas as colunas, como texto já aparado. */
function normalizarLinha(linha: Record<string, string>, headers: string[]): Record<string, string> {
  const registro: Record<string, string> = {};

  for (const header of headers) {
    const valor = linha[header];
    registro[header] = valor === undefined || valor === null ? '' : String(valor).trim();
  }

  return registro;
}

/**
 * Célula do Excel para texto.
 *
 * Uma célula pode conter fórmula, hyperlink, texto rico ou data — e todas
 * chegam como objeto. Sem isso, o preço viraria "[object Object]".
 */
export function celulaParaTexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);

  if (typeof valor === 'object') {
    if ('result' in valor && valor.result !== undefined) return String(valor.result).trim();
    if ('text' in valor && typeof valor.text === 'string') return valor.text.trim();
    if ('richText' in valor && Array.isArray(valor.richText)) {
      return valor.richText
        .map((parte) => parte.text)
        .join('')
        .trim();
    }
    if ('hyperlink' in valor && typeof valor.hyperlink === 'string') return valor.hyperlink;
  }

  return String(valor).trim();
}
