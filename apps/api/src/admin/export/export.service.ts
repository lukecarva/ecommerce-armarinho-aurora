import { formatAmount, toCsvCell, type SaleUnit } from '@aurora/types';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ExportFormat, Prisma, ProductStatus } from '@prisma/client';
import { ZipArchive } from 'archiver';
import ExcelJS from 'exceljs';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { toCents, toCentsOrNull, toQuantity } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Exportação de catálogo.
 *
 * Sai no **mesmo formato que o importador aceita de volta**. Essa ida e volta
 * é o que transforma a exportação em ferramenta de trabalho: para reajustar
 * uma categoria inteira, o operador exporta, mexe no Excel e reimporta com
 * simulação — sem depender de uma tela que preveja cada caso.
 *
 * O catálogo curado (foto, descrição, SEO) é o ativo mais caro do projeto, e
 * poder tirá-lo daqui a qualquer momento, sem acesso ao banco, é o que evita
 * ficar refém da plataforma.
 */

export interface ExportFiltros {
  categoryId?: string;
  collectionId?: string;
  status?: ProductStatus;
  needsContent?: boolean;
  comFoto?: boolean;
  search?: string;
}

/** Colunas na ordem em que saem, com o mesmo nome que o importador reconhece. */
export const COLUNAS_PADRAO = [
  'skuFutura',
  'name',
  'categoria',
  'unit',
  'saleStep',
  'minQty',
  'packSize',
  'price',
  'promoPrice',
  'qty',
  'availability',
  'status',
  'shortDesc',
  'imagens',
] as const;

const CABECALHOS: Record<string, string> = {
  skuFutura: 'COD_FUTURA',
  name: 'NOME',
  categoria: 'CATEGORIA',
  unit: 'UNIDADE',
  saleStep: 'PASSO',
  minQty: 'QTD_MINIMA',
  packSize: 'ITENS_POR_PACOTE',
  price: 'PRECO',
  promoPrice: 'PRECO_PROMOCIONAL',
  qty: 'ESTOQUE',
  availability: 'DISPONIBILIDADE',
  status: 'STATUS',
  shortDesc: 'RESUMO',
  imagens: 'IMAGENS',
};

/**
 * Marca de ordem de byte.
 *
 * Sem ela o Excel em português abre o CSV e destrói todos os acentos —
 * "Algodão" vira "AlgodÃ£o". Escrita como escape porque o caractere literal
 * é invisível no editor.
 */
const BOM = String.fromCharCode(0xfeff);

/** Por quantos dias o arquivo fica disponível para download. */
const DIAS_ATE_EXPIRAR = 7;

interface LinhaExportada {
  skuFutura: string;
  name: string;
  categoria: string;
  unit: SaleUnit;
  saleStep: string;
  minQty: string;
  packSize: string;
  price: string;
  promoPrice: string;
  qty: string;
  availability: string;
  status: string;
  shortDesc: string;
  imagens: string;
  /** Só para o XLSX e o ZIP; não vira coluna. */
  _urls: string[];
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly pasta = resolve(process.env.EXPORT_DIR ?? './tmp/exports');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria a exportação e devolve na hora, processando em segundo plano.
   *
   * Um ZIP com milhares de fotos leva minutos: prender a requisição HTTP até
   * o fim daria timeout no navegador. O painel acompanha pelo status.
   */
  async solicitar(
    formato: ExportFormat,
    filtros: ExportFiltros,
    colunas: string[],
    ator: { id: string; name: string },
  ) {
    const run = await this.prisma.exportRun.create({
      data: {
        format: formato,
        status: 'processando',
        filters: filtros as unknown as Prisma.InputJsonValue,
        columns: colunas.length > 0 ? colunas : [...COLUNAS_PADRAO],
        includeImages: formato === 'zip',
        actorId: ator.id,
        actorName: ator.name,
      },
    });

    // Sem `await`: a resposta sai agora e o trabalho continua.
    void this.processar(run.id).catch((erro: unknown) => {
      this.logger.error(`Exportação ${run.id} falhou`, erro);
    });

    return run;
  }

  async listar(pagina: number, porPagina: number) {
    const [items, total] = await Promise.all([
      this.prisma.exportRun.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.exportRun.count(),
    ]);

    return {
      items,
      page: pagina,
      perPage: porPagina,
      total,
      totalPages: Math.max(1, Math.ceil(total / porPagina)),
    };
  }

  findOne(id: string) {
    return this.prisma.exportRun.findUniqueOrThrow({ where: { id } });
  }

  /** Caminho do arquivo pronto, para o controller transmitir. */
  async caminhoDoArquivo(id: string): Promise<{ caminho: string; nome: string }> {
    const run = await this.prisma.exportRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Exportação não encontrada.');

    if (run.status !== 'concluido' || !run.fileKey) {
      throw new NotFoundException(
        run.status === 'processando'
          ? 'A exportação ainda está sendo gerada.'
          : 'Esta exportação não tem arquivo disponível.',
      );
    }

    if (run.expiresAt && run.expiresAt < new Date()) {
      await this.prisma.exportRun.update({ where: { id }, data: { status: 'expirado' } });
      throw new NotFoundException('O arquivo expirou. Gere a exportação de novo.');
    }

    const caminho = join(this.pasta, run.fileKey);

    try {
      await stat(caminho);
    } catch {
      await this.prisma.exportRun.update({ where: { id }, data: { status: 'expirado' } });
      throw new NotFoundException(
        'O arquivo não está mais no servidor. Gere a exportação de novo.',
      );
    }

    return { caminho, nome: `catalogo-${run.createdAt.toISOString().slice(0, 10)}.${run.format}` };
  }

  /** Remove exportações vencidas. Chamado pela rotina de limpeza. */
  async limparVencidas(): Promise<number> {
    const vencidas = await this.prisma.exportRun.findMany({
      where: { status: 'concluido', expiresAt: { lt: new Date() } },
      select: { id: true, fileKey: true },
    });

    for (const run of vencidas) {
      if (run.fileKey) await rm(join(this.pasta, run.fileKey), { force: true }).catch(() => {});
    }

    if (vencidas.length > 0) {
      await this.prisma.exportRun.updateMany({
        where: { id: { in: vencidas.map((run) => run.id) } },
        data: { status: 'expirado' },
      });
    }

    return vencidas.length;
  }

  // ───────────────────────────── Processamento ─────────────────────────────

  private async processar(runId: string): Promise<void> {
    const run = await this.prisma.exportRun.findUniqueOrThrow({ where: { id: runId } });

    try {
      await mkdir(this.pasta, { recursive: true });

      const filtros = (run.filters ?? {}) as ExportFiltros;
      const colunas = (run.columns as string[]) ?? [...COLUNAS_PADRAO];
      const linhas = await this.carregar(filtros);

      const nomeArquivo = `${runId}.${run.format}`;
      const caminho = join(this.pasta, nomeArquivo);

      if (run.format === 'csv') await this.escreverCsv(caminho, linhas, colunas);
      else if (run.format === 'xlsx') await this.escreverXlsx(caminho, linhas, colunas);
      else await this.escreverZip(caminho, linhas, colunas);

      const info = await stat(caminho);

      await this.prisma.exportRun.update({
        where: { id: runId },
        data: {
          status: 'concluido',
          rowsTotal: linhas.length,
          fileKey: nomeArquivo,
          fileSize: info.size,
          expiresAt: new Date(Date.now() + DIAS_ATE_EXPIRAR * 24 * 60 * 60 * 1000),
          finishedAt: new Date(),
        },
      });
    } catch (erro) {
      await this.prisma.exportRun.update({
        where: { id: runId },
        data: {
          status: 'falhou',
          error: erro instanceof Error ? erro.message : String(erro),
          finishedAt: new Date(),
        },
      });
      throw erro;
    }
  }

  private async carregar(filtros: ExportFiltros): Promise<LinhaExportada[]> {
    const where: Prisma.ProductWhereInput = {
      ...(filtros.status ? { status: filtros.status } : { status: { not: 'arquivado' } }),
      ...(filtros.categoryId ? { categoryId: filtros.categoryId } : {}),
      ...(filtros.collectionId
        ? { collections: { some: { collectionId: filtros.collectionId } } }
        : {}),
      ...(filtros.needsContent !== undefined ? { needsContent: filtros.needsContent } : {}),
      ...(filtros.comFoto === true ? { images: { some: {} } } : {}),
      ...(filtros.comFoto === false ? { images: { none: {} } } : {}),
      ...(filtros.search
        ? {
            OR: [
              { name: { contains: filtros.search, mode: 'insensitive' } },
              { skuFutura: { contains: filtros.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const produtos = await this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        category: { select: { name: true } },
        inventory: { where: { variantId: null }, take: 1 },
        images: { orderBy: { position: 'asc' }, include: { media: { select: { url: true } } } },
      },
    });

    return produtos.map((produto) => {
      const estoque = produto.inventory[0];
      const urls = produto.images.map((imagem) => imagem.media.url);

      return {
        skuFutura: produto.skuFutura ?? '',
        name: produto.name,
        categoria: produto.category?.name ?? '',
        unit: produto.unit,
        saleStep: formatarNumero(toQuantity(produto.saleStep)),
        minQty: formatarNumero(toQuantity(produto.minQty)),
        packSize: produto.packSize ? String(produto.packSize) : '',
        price: formatAmount(toCents(produto.price)),
        promoPrice:
          toCentsOrNull(produto.promoPrice) === null
            ? ''
            : formatAmount(toCentsOrNull(produto.promoPrice)!),
        qty: formatarNumero(toQuantity(estoque?.qty)),
        availability: estoque?.availability ?? '',
        status: produto.status,
        shortDesc: produto.shortDesc ?? '',
        imagens: urls.length > 0 ? `${produto.skuFutura ?? produto.id} (${urls.length})` : '',
        _urls: urls,
      };
    });
  }

  // ── CSV ──────────────────────────────────────────────────────────────────

  private async escreverCsv(
    caminho: string,
    linhas: LinhaExportada[],
    colunas: string[],
  ): Promise<void> {
    const saida = createWriteStream(caminho);

    // BOM: sem ele o Excel em português abre o arquivo e destrói os acentos.
    saida.write(BOM);
    saida.write(`${colunas.map((coluna) => CABECALHOS[coluna] ?? coluna).join(';')}\r\n`);

    for (const linha of linhas) {
      const celulas = colunas.map((coluna) => toCsvCell(linha[coluna as keyof LinhaExportada]));
      saida.write(`${celulas.join(';')}\r\n`);
    }

    await new Promise<void>((resolver, rejeitar) => {
      saida.end(() => resolver());
      saida.on('error', rejeitar);
    });
  }

  // ── XLSX ─────────────────────────────────────────────────────────────────

  private async escreverXlsx(
    caminho: string,
    linhas: LinhaExportada[],
    colunas: string[],
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Armarinho Aurora';
    workbook.created = new Date();

    const planilha = workbook.addWorksheet('Catálogo', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Coluna extra de miniatura, antes das demais.
    planilha.columns = [
      { header: 'FOTO', key: '_foto', width: 12 },
      ...colunas.map((coluna) => ({
        header: CABECALHOS[coluna] ?? coluna,
        key: coluna,
        width: coluna === 'name' ? 42 : 16,
      })),
    ];

    planilha.getRow(1).font = { bold: true };
    planilha.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B3A8C' },
    };
    planilha.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const [indice, linha] of linhas.entries()) {
      const registro: Record<string, unknown> = {};
      for (const coluna of colunas) registro[coluna] = linha[coluna as keyof LinhaExportada];

      const linhaExcel = planilha.addRow(registro);
      linhaExcel.height = 48;

      const miniatura = await this.baixarMiniatura(linha._urls[0]);
      if (miniatura) {
        // O exceljs declara ArrayBuffer, mas a implementação aceita Buffer
        // do Node — que é o que o `fetch` entrega.
        const imagemId = workbook.addImage({
          buffer: miniatura.buffer as unknown as ArrayBuffer,
          extension: miniatura.extension,
        });
        planilha.addImage(imagemId, {
          tl: { col: 0.15, row: indice + 1.1 },
          ext: { width: 56, height: 56 },
        });
      }
    }

    await workbook.xlsx.writeFile(caminho);
  }

  /**
   * Baixa a foto para embutir na planilha.
   *
   * Falha aqui nunca derruba a exportação: uma imagem fora do ar vira célula
   * vazia, não erro. O que importa é a planilha sair.
   */
  private async baixarMiniatura(
    url: string | undefined,
  ): Promise<{ buffer: Buffer; extension: 'jpeg' | 'png' } | null> {
    if (!url) return null;

    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resposta.ok) return null;

      const buffer = Buffer.from(await resposta.arrayBuffer());
      const extensao = url.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
      return { buffer, extension: extensao };
    } catch {
      return null;
    }
  }

  // ── ZIP ──────────────────────────────────────────────────────────────────

  /**
   * Planilha + fotos, nomeadas de forma que o importador reconheça de volta.
   *
   * Escreve em fluxo: um catálogo com milhares de fotos não caberia na
   * memória do servidor de homologação.
   */
  private async escreverZip(
    caminho: string,
    linhas: LinhaExportada[],
    colunas: string[],
  ): Promise<void> {
    const saida = createWriteStream(caminho);
    // O archiver 8 exporta classes, não mais a função-fábrica.
    const zip = new ZipArchive({ zlib: { level: 6 } });

    const pronto = new Promise<void>((resolver, rejeitar) => {
      saida.on('close', () => resolver());
      zip.on('error', rejeitar);
      saida.on('error', rejeitar);
    });

    zip.pipe(saida);

    // Planilha, em memória — texto é leve.
    const cabecalho = colunas.map((coluna) => CABECALHOS[coluna] ?? coluna).join(';');
    const corpo = linhas
      .map((linha) =>
        colunas.map((coluna) => toCsvCell(linha[coluna as keyof LinhaExportada])).join(';'),
      )
      .join('\r\n');

    zip.append(`${BOM}${cabecalho}\r\n${corpo}\r\n`, { name: 'catalogo.csv' });

    for (const linha of linhas) {
      if (!linha.skuFutura) continue;

      for (const [ordem, url] of linha._urls.entries()) {
        const imagem = await this.baixarImagem(url);
        if (!imagem) continue;

        const passagem = new PassThrough();
        passagem.end(imagem.buffer);
        zip.append(passagem, {
          name: `imagens/${linha.skuFutura}_${ordem + 1}.${imagem.extensao}`,
        });
      }
    }

    await zip.finalize();
    await pronto;
  }

  private async baixarImagem(url: string): Promise<{ buffer: Buffer; extensao: string } | null> {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resposta.ok) return null;

      return {
        buffer: Buffer.from(await resposta.arrayBuffer()),
        extensao:
          url
            .split('.')
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, '') || 'jpg',
      };
    } catch {
      return null;
    }
  }
}

/** Número no formato brasileiro, sem casas decimais desnecessárias. */
function formatarNumero(valor: number | undefined): string {
  if (valor === undefined) return '';
  return String(valor).replace('.', ',');
}
