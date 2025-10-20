import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import unzipper from 'unzipper';
import { MediaService } from '../../media/media.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Importação de ZIP: planilha + fotos.
 *
 * É o que torna a carga inicial do catálogo viável. Subir centenas de fotos
 * uma a uma, associando cada uma ao produto certo, levaria semanas — aqui a
 * associação vem do próprio nome do arquivo.
 *
 * Convenção de nome, a mesma que o exportador gera:
 *   `12345.jpg`    → capa do produto de código 12345
 *   `12345_1.jpg`  → primeira imagem
 *   `12345_2.jpg`  → segunda, e assim por diante
 */

const IMAGENS = /\.(jpe?g|png|webp|avif)$/i;
const PLANILHAS = /\.(csv|txt|tsv|xlsx|xlsm)$/i;

/** Teto do ZIP inteiro. Acima disso, dividir em partes. */
const MAX_ZIP_BYTES = 300 * 1024 * 1024;
/** Teto de uma imagem, igual ao do upload avulso. */
const MAX_IMAGEM_BYTES = 15 * 1024 * 1024;

export interface ConteudoDoZip {
  planilha: { buffer: Buffer; originalname: string } | null;
  imagens: Array<{ sku: string; ordem: number; buffer: Buffer; originalname: string }>;
  ignorados: string[];
}

export interface ResultadoDasImagens {
  enviadas: number;
  vinculadas: number;
  semProduto: string[];
  erros: Array<{ arquivo: string; motivo: string }>;
}

@Injectable()
export class ZipService {
  private readonly logger = new Logger(ZipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  /**
   * Abre o ZIP separando a planilha das fotos.
   *
   * A leitura é entrada por entrada, e não com o arquivo inteiro em memória:
   * o servidor de homologação tem teto de 400 MB, e um ZIP de catálogo passa
   * fácil disso.
   */
  async abrir(buffer: Buffer): Promise<ConteudoDoZip> {
    if (buffer.length > MAX_ZIP_BYTES) {
      throw new BadRequestException(
        `O ZIP tem ${(buffer.length / 1024 / 1024).toFixed(0)} MB, acima do limite de 300 MB. ` +
          'Divida em partes menores.',
      );
    }

    let diretorio: unzipper.CentralDirectory;
    try {
      diretorio = await unzipper.Open.buffer(buffer);
    } catch {
      throw new BadRequestException('Não consegui abrir o ZIP. O arquivo pode estar corrompido.');
    }

    const conteudo: ConteudoDoZip = { planilha: null, imagens: [], ignorados: [] };

    for (const entrada of diretorio.files) {
      if (entrada.type === 'Directory') continue;

      const nome = entrada.path.split('/').pop() ?? entrada.path;

      // Metadados do macOS e arquivos ocultos não interessam.
      if (nome.startsWith('.') || entrada.path.includes('__MACOSX')) continue;

      if (PLANILHAS.test(nome) && !conteudo.planilha) {
        conteudo.planilha = { buffer: await entrada.buffer(), originalname: nome };
        continue;
      }

      if (IMAGENS.test(nome)) {
        if (entrada.uncompressedSize > MAX_IMAGEM_BYTES) {
          conteudo.ignorados.push(`${nome} (passa de 15 MB)`);
          continue;
        }

        const referencia = this.lerNome(nome);
        if (!referencia) {
          conteudo.ignorados.push(`${nome} (nome não começa com o código do produto)`);
          continue;
        }

        conteudo.imagens.push({
          ...referencia,
          buffer: await entrada.buffer(),
          originalname: nome,
        });
        continue;
      }

      conteudo.ignorados.push(nome);
    }

    if (!conteudo.planilha && conteudo.imagens.length === 0) {
      throw new BadRequestException(
        'O ZIP não tem planilha nem imagem reconhecível. ' +
          'As fotos precisam se chamar CODIGO.jpg ou CODIGO_1.jpg.',
      );
    }

    conteudo.imagens.sort((a, b) => a.sku.localeCompare(b.sku) || a.ordem - b.ordem);
    return conteudo;
  }

  /**
   * Processa e vincula as imagens aos produtos.
   *
   * Imagem cujo código não existe no catálogo é reportada, não descartada em
   * silêncio: quase sempre é erro de digitação no nome do arquivo, e o
   * operador precisa saber para corrigir.
   */
  async vincular(
    imagens: ConteudoDoZip['imagens'],
    uploadedById: string | null,
  ): Promise<ResultadoDasImagens> {
    const resultado: ResultadoDasImagens = {
      enviadas: 0,
      vinculadas: 0,
      semProduto: [],
      erros: [],
    };

    const skus = [...new Set(imagens.map((imagem) => imagem.sku))];
    const produtos = new Map<string, { id: string; imagens: number }>();

    for (const lote of dividir(skus, 500)) {
      const encontrados = await this.prisma.product.findMany({
        where: { skuFutura: { in: lote } },
        select: { id: true, skuFutura: true, _count: { select: { images: true } } },
      });

      for (const produto of encontrados) {
        if (produto.skuFutura) {
          produtos.set(produto.skuFutura, { id: produto.id, imagens: produto._count.images });
        }
      }
    }

    for (const imagem of imagens) {
      const produto = produtos.get(imagem.sku);

      if (!produto) {
        if (!resultado.semProduto.includes(imagem.sku)) resultado.semProduto.push(imagem.sku);
        continue;
      }

      try {
        // Sequencial de propósito: o processamento das derivações é pesado em
        // CPU, e paralelizar num servidor de 1 vCPU só piora tudo.
        const asset = await this.media.upload(
          {
            buffer: imagem.buffer,
            mimetype: mimeDe(imagem.originalname),
            originalname: imagem.originalname,
            size: imagem.buffer.length,
          },
          'produtos',
          uploadedById,
        );
        resultado.enviadas += 1;

        await this.prisma.productImage.create({
          data: {
            productId: produto.id,
            mediaId: asset.id,
            position: produto.imagens,
          },
        });
        produto.imagens += 1;
        resultado.vinculadas += 1;
      } catch (erro) {
        this.logger.warn(`Falha ao processar ${imagem.originalname}`, erro);
        resultado.erros.push({
          arquivo: imagem.originalname,
          motivo: erro instanceof Error ? erro.message : 'Erro ao processar a imagem',
        });
      }
    }

    // Produto que ganhou foto pode ter deixado de estar incompleto.
    await this.revisarPendencias([...produtos.values()].map((produto) => produto.id));

    return resultado;
  }

  /** "12345_2.jpg" → { sku: "12345", ordem: 2 } */
  private lerNome(nome: string): { sku: string; ordem: number } | null {
    const semExtensao = nome.replace(IMAGENS, '');
    const casado = /^([A-Za-z0-9.-]+?)(?:[_-](\d+))?$/.exec(semExtensao);

    if (!casado?.[1]) return null;
    return { sku: casado[1], ordem: casado[2] ? Number(casado[2]) : 0 };
  }

  /** Tira `needsContent` de quem já tem foto e categoria. */
  private async revisarPendencias(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    for (const lote of dividir(ids, 500)) {
      await this.prisma.product.updateMany({
        where: { id: { in: lote }, categoryId: { not: null }, images: { some: {} } },
        data: { needsContent: false },
      });
    }
  }
}

function mimeDe(nome: string): string {
  const extensao = nome.split('.').pop()?.toLowerCase();
  return (
    {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      avif: 'image/avif',
    }[extensao ?? ''] ?? 'application/octet-stream'
  );
}

function dividir<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}
