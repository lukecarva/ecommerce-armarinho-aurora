import {
  FIELDS_BY_KIND,
  diffRow,
  guessColumnMap,
  parseRow,
  slugify,
  summarize,
  type ColumnMap,
  type ExistingProduct,
  type ImportOptions,
  type RowDiff,
} from '@aurora/types';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ImportKind, Prisma } from '@prisma/client';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fromCents, fromQuantity, toCents, toCentsOrNull, toQuantity } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import { availabilityFor } from '../catalog/admin-products.service';
import { SpreadsheetParser, type SheetData } from './spreadsheet.parser';

/**
 * Importação de catálogo a partir da planilha do Futura.
 *
 * O fluxo tem duas etapas de propósito: primeiro a **simulação**, que mostra
 * exatamente o que mudaria sem gravar nada, e só depois a aplicação. Um
 * reajuste de preço aplicado por engano em três mil produtos é caro de
 * descobrir e pior ainda de reverter à mão — por isso também guardamos o
 * valor anterior de cada campo alterado, para o desfazer.
 *
 * Regra que protege o trabalho da loja: a importação **nunca** mexe em foto,
 * descrição, categoria da vitrine, SEO ou coleção. Só em nome (quando pedido),
 * preço, unidade e estoque.
 */

/** Quantas linhas do diff a prévia mostra. O resto vira contagem. */
const LINHAS_NA_PREVIA = 200;

/** Tamanho do lote ao gravar. Transações menores em um servidor de 1 vCPU. */
const TAMANHO_DO_LOTE = 200;

export interface AnaliseResultado {
  runId: string;
  headers: string[];
  columnMap: ColumnMap;
  deteccao: SheetData['deteccao'];
  resumo: ReturnType<typeof summarize>;
  previa: RowDiff[];
  /** Categorias citadas na planilha que não existem no catálogo. */
  categoriasDesconhecidas: string[];
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private readonly pastaTemp = resolve(process.env.IMPORT_TMP_DIR ?? './tmp/imports');

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: SpreadsheetParser,
  ) {}

  /** Só lê o cabeçalho, para a tela de mapeamento aparecer antes de tudo. */
  async inspecionar(arquivo: { buffer: Buffer; originalname: string }, kind: ImportKind) {
    const dados = await this.parser.parse(arquivo);

    return {
      headers: dados.headers,
      deteccao: dados.deteccao,
      totalLinhas: dados.rows.length,
      columnMap: guessColumnMap(dados.headers, FIELDS_BY_KIND[kind]),
      amostra: dados.rows.slice(0, 5),
    };
  }

  /**
   * Simulação: lê tudo, compara com o catálogo e devolve o que mudaria.
   * Nada é gravado — o arquivo fica guardado para a aplicação reusar.
   */
  async simular(
    arquivo: { buffer: Buffer; originalname: string },
    kind: ImportKind,
    columnMap: ColumnMap,
    opcoes: ImportOptions,
    ator: { id: string; name: string },
  ): Promise<AnaliseResultado> {
    this.assertMapeamento(columnMap, kind);

    const dados = await this.parser.parse(arquivo);
    const { diffs, categoriasDesconhecidas } = await this.calcularDiffs(dados, columnMap, opcoes);
    const resumo = summarize(diffs);

    const run = await this.prisma.importRun.create({
      data: {
        filename: arquivo.originalname,
        kind,
        status: 'simulado',
        dryRun: true,
        rowsTotal: resumo.total,
        rowsCreated: resumo.criar,
        rowsUpdated: resumo.atualizar,
        rowsSkipped: resumo.semMudanca + resumo.ignorar,
        rowsError: resumo.erro,
        report: {
          resumo,
          columnMap,
          opcoes,
          deteccao: dados.deteccao,
          categoriasDesconhecidas,
          previa: diffs.slice(0, LINHAS_NA_PREVIA),
          erros: diffs.filter((d) => d.acao === 'erro').slice(0, 500),
        } as unknown as Prisma.InputJsonValue,
        actorId: ator.id,
        actorName: ator.name,
      },
    });

    await this.guardarArquivo(run.id, arquivo.buffer);

    return {
      runId: run.id,
      headers: dados.headers,
      columnMap,
      deteccao: dados.deteccao,
      resumo,
      previa: diffs.slice(0, LINHAS_NA_PREVIA),
      categoriasDesconhecidas,
    };
  }

  /**
   * Aplica uma simulação já revisada.
   *
   * Relê o arquivo guardado em vez de confiar na prévia: entre simular e
   * aplicar, alguém pode ter mexido no catálogo, e o que vale é o estado atual.
   */
  async aplicar(runId: string, ator: { id: string; name: string }) {
    const run = await this.prisma.importRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Importação não encontrada.');

    if (run.status !== 'simulado') {
      throw new BadRequestException(
        `Esta importação está como "${run.status}" e não pode ser aplicada de novo.`,
      );
    }

    const relatorio = (run.report ?? {}) as {
      columnMap?: ColumnMap;
      opcoes?: ImportOptions;
    };
    const columnMap = relatorio.columnMap;
    if (!columnMap) throw new BadRequestException('Simulação sem mapeamento de colunas.');

    const buffer = await this.lerArquivo(runId);
    const dados = await this.parser.parse({ buffer, originalname: run.filename });

    await this.prisma.importRun.update({
      where: { id: runId },
      data: { status: 'processando', dryRun: false, actorId: ator.id, actorName: ator.name },
    });

    try {
      const { diffs } = await this.calcularDiffs(dados, columnMap, relatorio.opcoes ?? {});
      const aplicaveis = diffs.filter((d) => d.acao === 'criar' || d.acao === 'atualizar');

      const snapshot = await this.gravar(dados, columnMap, relatorio.opcoes ?? {}, aplicaveis);
      const resumo = summarize(diffs);

      const finalizado = await this.prisma.importRun.update({
        where: { id: runId },
        data: {
          status: 'concluido',
          finishedAt: new Date(),
          rowsTotal: resumo.total,
          rowsCreated: resumo.criar,
          rowsUpdated: resumo.atualizar,
          rowsSkipped: resumo.semMudanca + resumo.ignorar,
          rowsError: resumo.erro,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });

      await this.apagarArquivo(runId);
      return finalizado;
    } catch (erro) {
      await this.prisma.importRun.update({
        where: { id: runId },
        data: {
          status: 'falhou',
          finishedAt: new Date(),
          error: erro instanceof Error ? erro.message : String(erro),
        },
      });
      throw erro;
    }
  }

  /**
   * Desfaz uma importação, devolvendo cada campo ao valor anterior.
   *
   * Produtos criados pela importação são arquivados, não apagados: podem já
   * ter recebido foto e descrição no meio do caminho.
   */
  async desfazer(runId: string, ator: { id: string; name: string }) {
    const run = await this.prisma.importRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Importação não encontrada.');

    if (run.status !== 'concluido') {
      throw new BadRequestException('Só é possível desfazer uma importação concluída.');
    }

    const snapshot = (run.snapshot ?? { produtos: [], criados: [] }) as unknown as Snapshot;

    for (const lote of emLotes(snapshot.produtos, TAMANHO_DO_LOTE)) {
      await this.prisma.$transaction(
        lote.map((anterior) =>
          this.prisma.product.update({
            where: { id: anterior.id },
            data: {
              ...(anterior.name !== undefined ? { name: anterior.name } : {}),
              ...(anterior.price !== undefined ? { price: fromCents(anterior.price) } : {}),
              ...(anterior.promoPrice !== undefined
                ? {
                    promoPrice:
                      anterior.promoPrice === null ? null : fromCents(anterior.promoPrice),
                  }
                : {}),
              ...(anterior.unit !== undefined ? { unit: anterior.unit } : {}),
            },
          }),
        ),
      );
    }

    for (const lote of emLotes(snapshot.estoques, TAMANHO_DO_LOTE)) {
      await this.prisma.$transaction(
        lote.map((anterior) =>
          this.prisma.inventory.update({
            where: { id: anterior.id },
            data: {
              qty: fromQuantity(anterior.qty),
              availability: anterior.availability,
            },
          }),
        ),
      );
    }

    if (snapshot.criados.length > 0) {
      await this.prisma.product.updateMany({
        where: { id: { in: snapshot.criados } },
        data: { status: 'arquivado' },
      });
    }

    return this.prisma.importRun.update({
      where: { id: runId },
      data: { status: 'desfeito', actorId: ator.id, actorName: ator.name },
    });
  }

  async historico(pagina: number, porPagina: number) {
    const [items, total] = await Promise.all([
      this.prisma.importRun.findMany({
        orderBy: { startedAt: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
      this.prisma.importRun.count(),
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
    return this.prisma.importRun.findUniqueOrThrow({ where: { id } });
  }

  // ── Perfis de mapeamento ─────────────────────────────────────────────────

  listarPerfis() {
    return this.prisma.importProfile.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  }

  /**
   * Salva o mapeamento para reuso.
   *
   * Sobrescreve o perfil de mesmo nome e tipo: o operador que ajusta o
   * mapeamento e salva de novo espera atualizar, não criar uma cópia.
   */
  salvarPerfil(entrada: {
    name: string;
    kind: ImportKind;
    columnMap: ColumnMap;
    options: ImportOptions;
  }) {
    return this.prisma.importProfile.upsert({
      where: { name_kind: { name: entrada.name, kind: entrada.kind } },
      create: {
        name: entrada.name,
        kind: entrada.kind,
        columnMap: entrada.columnMap as unknown as Prisma.InputJsonValue,
        options: entrada.options as unknown as Prisma.InputJsonValue,
      },
      update: {
        columnMap: entrada.columnMap as unknown as Prisma.InputJsonValue,
        options: entrada.options as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async removerPerfil(id: string): Promise<void> {
    await this.prisma.importProfile.delete({ where: { id } });
  }

  // ───────────────────────────── Internos ──────────────────────────────────

  private assertMapeamento(columnMap: ColumnMap, kind: ImportKind): void {
    const campos = Object.values(columnMap);

    if (!campos.includes('skuFutura')) {
      throw new BadRequestException(
        'Aponte qual coluna tem o código do Futura — é por ele que casamos com o catálogo.',
      );
    }

    const permitidos = FIELDS_BY_KIND[kind];
    const invalido = campos.find((campo) => campo && !permitidos.includes(campo));

    if (invalido) {
      throw new BadRequestException(
        `O campo "${invalido}" não faz parte de uma importação de ${kind}.`,
      );
    }
  }

  /** Lê todas as linhas e compara com o catálogo, sem gravar nada. */
  private async calcularDiffs(dados: SheetData, columnMap: ColumnMap, opcoes: ImportOptions) {
    const linhas = dados.rows.map((bruta, indice) =>
      // +2: a planilha começa na linha 1 com o cabeçalho.
      parseRow(bruta, columnMap, indice + 2, opcoes),
    );

    const skus = [...new Set(linhas.map((l) => l.skuFutura).filter((s): s is string => !!s))];
    const existentes = await this.carregarExistentes(skus);

    const categoriasCitadas = [
      ...new Set(linhas.map((l) => l.categoria).filter((c): c is string => !!c)),
    ];
    const categoriasConhecidas = await this.carregarCategorias(categoriasCitadas);

    const diffs = linhas.map((linha) =>
      diffRow(linha, linha.skuFutura ? existentes.get(linha.skuFutura) : undefined, opcoes),
    );

    return {
      diffs,
      categoriasDesconhecidas: categoriasCitadas.filter(
        (nome) => !categoriasConhecidas.has(slugify(nome)),
      ),
    };
  }

  private async carregarExistentes(skus: string[]): Promise<Map<string, ExistingProduct>> {
    const mapa = new Map<string, ExistingProduct>();

    // Em lotes: um `IN` com vinte mil itens derruba o planejador do Postgres.
    for (const lote of emLotes(skus, 1000)) {
      const produtos = await this.prisma.product.findMany({
        where: { skuFutura: { in: lote } },
        select: {
          id: true,
          skuFutura: true,
          name: true,
          price: true,
          promoPrice: true,
          unit: true,
          inventory: { where: { variantId: null }, select: { qty: true }, take: 1 },
        },
      });

      for (const produto of produtos) {
        if (!produto.skuFutura) continue;
        mapa.set(produto.skuFutura, {
          id: produto.id,
          skuFutura: produto.skuFutura,
          name: produto.name,
          price: toCents(produto.price),
          promoPrice: toCentsOrNull(produto.promoPrice),
          unit: produto.unit,
          qty: toQuantity(produto.inventory[0]?.qty),
        });
      }
    }

    return mapa;
  }

  private async carregarCategorias(nomes: string[]): Promise<Map<string, string>> {
    if (nomes.length === 0) return new Map();

    const categorias = await this.prisma.category.findMany({
      where: { slug: { in: nomes.map((nome) => slugify(nome)) } },
      select: { id: true, slug: true },
    });

    return new Map(categorias.map((categoria) => [categoria.slug, categoria.id]));
  }

  /** Grava as mudanças em lotes e devolve o snapshot para o desfazer. */
  private async gravar(
    dados: SheetData,
    columnMap: ColumnMap,
    opcoes: ImportOptions,
    aplicaveis: RowDiff[],
  ): Promise<Snapshot> {
    const porLinha = new Map(aplicaveis.map((diff) => [diff.linha, diff]));

    const linhas = dados.rows
      .map((bruta, indice) => parseRow(bruta, columnMap, indice + 2, opcoes))
      .filter((linha) => porLinha.has(linha.linha));

    const skus = [...new Set(linhas.map((l) => l.skuFutura).filter((s): s is string => !!s))];
    const existentes = await this.carregarExistentes(skus);
    const categorias = await this.carregarCategorias([
      ...new Set(linhas.map((l) => l.categoria).filter((c): c is string => !!c)),
    ]);

    const snapshot: Snapshot = { produtos: [], estoques: [], criados: [] };

    for (const lote of emLotes(linhas, TAMANHO_DO_LOTE)) {
      await this.prisma.$transaction(async (tx) => {
        for (const linha of lote) {
          if (!linha.skuFutura) continue;
          const existente = existentes.get(linha.skuFutura);
          const diff = porLinha.get(linha.linha);
          if (!diff) continue;

          if (!existente) {
            const criado = await this.criarProduto(tx, linha, categorias);
            if (criado) snapshot.criados.push(criado);
            continue;
          }

          const anterior = await this.atualizarProduto(tx, linha, existente, diff, opcoes);
          if (anterior) snapshot.produtos.push(anterior);

          const estoque = await this.atualizarEstoque(tx, linha, existente.id);
          if (estoque) snapshot.estoques.push(estoque);
        }
      });
    }

    return snapshot;
  }

  private async criarProduto(
    tx: Prisma.TransactionClient,
    linha: ReturnType<typeof parseRow>,
    categorias: Map<string, string>,
  ): Promise<string | null> {
    if (linha.price === undefined) return null;

    const categoriaId = linha.categoria ? categorias.get(slugify(linha.categoria)) : undefined;
    const nome = linha.name ?? `Produto ${linha.skuFutura}`;

    // Slug pode colidir com produto já cadastrado à mão; o sufixo resolve
    // sem interromper a importação inteira por causa de um nome repetido.
    let slug = linha.slug ?? slugify(nome);
    if (await tx.product.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${slug}-${linha.skuFutura}`;
    }

    const produto = await tx.product.create({
      data: {
        skuFutura: linha.skuFutura,
        name: nome,
        slug,
        categoryId: categoriaId ?? null,
        unit: linha.unit ?? 'unidade',
        saleStep: fromQuantity(linha.saleStep ?? 1),
        minQty: fromQuantity(linha.minQty ?? 1),
        packSize: linha.packSize ?? null,
        price: fromCents(linha.price),
        promoPrice: linha.promoPrice ? fromCents(linha.promoPrice) : null,
        shortDesc: linha.shortDesc ?? null,
        // Nasce fora da vitrine: sem foto e sem curadoria, não é para aparecer.
        status: 'rascunho',
        needsContent: true,
      },
    });

    if (linha.qty !== undefined) {
      await tx.inventory.create({
        data: {
          productId: produto.id,
          qty: fromQuantity(linha.qty),
          availability: linha.availability ?? availabilityFor(linha.qty, 3),
          source: 'import',
        },
      });
    }

    return produto.id;
  }

  private async atualizarProduto(
    tx: Prisma.TransactionClient,
    linha: ReturnType<typeof parseRow>,
    existente: ExistingProduct,
    diff: RowDiff,
    opcoes: ImportOptions,
  ): Promise<SnapshotProduto | null> {
    const data: Prisma.ProductUpdateInput = {};
    const anterior: SnapshotProduto = { id: existente.id };

    if (opcoes.atualizarNome && diff.mudancas.name) {
      data.name = linha.name;
      anterior.name = existente.name;
    }

    if (diff.mudancas.price && linha.price !== undefined) {
      data.price = fromCents(linha.price);
      anterior.price = existente.price;

      await tx.priceHistory.create({
        data: {
          productId: existente.id,
          oldPrice: fromCents(existente.price),
          newPrice: fromCents(linha.price),
          source: 'import',
        },
      });
    }

    if (diff.mudancas.promoPrice) {
      data.promoPrice = linha.promoPrice === null ? null : fromCents(linha.promoPrice!);
      anterior.promoPrice = existente.promoPrice;
    }

    if (diff.mudancas.unit && linha.unit) {
      data.unit = linha.unit;
      anterior.unit = existente.unit;
    }

    if (Object.keys(data).length === 0) return null;

    await tx.product.update({ where: { id: existente.id }, data });
    return anterior;
  }

  private async atualizarEstoque(
    tx: Prisma.TransactionClient,
    linha: ReturnType<typeof parseRow>,
    productId: string,
  ): Promise<SnapshotEstoque | null> {
    if (linha.qty === undefined) return null;

    const atual = await tx.inventory.findFirst({ where: { productId, variantId: null } });
    const disponibilidade = linha.availability ?? availabilityFor(linha.qty, 3);

    if (!atual) {
      await tx.inventory.create({
        data: {
          productId,
          qty: fromQuantity(linha.qty),
          availability: disponibilidade,
          source: 'import',
        },
      });
      return null;
    }

    const anterior: SnapshotEstoque = {
      id: atual.id,
      qty: toQuantity(atual.qty),
      availability: atual.availability,
    };

    await tx.inventory.update({
      where: { id: atual.id },
      data: {
        qty: fromQuantity(linha.qty),
        availability: disponibilidade,
        source: 'import',
      },
    });

    await tx.inventoryMovement.create({
      data: {
        inventoryId: atual.id,
        delta: fromQuantity(linha.qty - anterior.qty),
        reason: 'Importação de planilha',
      },
    });

    return anterior;
  }

  // ── Arquivo temporário ───────────────────────────────────────────────────
  //
  // A simulação guarda o arquivo para a aplicação reusar. Fica em disco, e
  // não no banco, porque é transitório e pode ter alguns megabytes.

  private async guardarArquivo(runId: string, buffer: Buffer): Promise<void> {
    await mkdir(this.pastaTemp, { recursive: true });
    await writeFile(join(this.pastaTemp, `${runId}.bin`), buffer);
  }

  private async lerArquivo(runId: string): Promise<Buffer> {
    try {
      return await readFile(join(this.pastaTemp, `${runId}.bin`));
    } catch {
      throw new BadRequestException(
        'O arquivo desta simulação não está mais disponível. Envie a planilha de novo.',
      );
    }
  }

  private async apagarArquivo(runId: string): Promise<void> {
    await rm(join(this.pastaTemp, `${runId}.bin`), { force: true }).catch((erro: unknown) => {
      this.logger.warn(`Não consegui remover o temporário de ${runId}`, erro);
    });
  }
}

// ─────────────────────────────── Tipos internos ────────────────────────────

interface SnapshotProduto {
  id: string;
  name?: string;
  price?: number;
  promoPrice?: number | null;
  unit?: ExistingProduct['unit'];
}

interface SnapshotEstoque {
  id: string;
  qty: number;
  availability: 'em_estoque' | 'ultimas_unidades' | 'sob_consulta' | 'esgotado';
}

interface Snapshot {
  produtos: SnapshotProduto[];
  estoques: SnapshotEstoque[];
  /** Ids dos produtos criados, para o desfazer arquivá-los. */
  criados: string[];
}

/** Divide uma lista em pedaços — usado para não estourar transação nem `IN`. */
export function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let indice = 0; indice < itens.length; indice += tamanho) {
    lotes.push(itens.slice(indice, indice + tamanho));
  }
  return lotes;
}
