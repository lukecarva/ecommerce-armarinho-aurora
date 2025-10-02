import { encode as encodeBlurhash } from 'blurhash';
import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { StorageService } from './storage.service';

export interface ImageVariant {
  /** Rótulo usado no `srcset` da vitrine. */
  label: string;
  width: number;
  format: 'webp' | 'avif';
  url: string;
  key: string;
  size: number;
}

export interface ProcessedImage {
  key: string;
  url: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  blurhash: string | null;
  variants: ImageVariant[];
}

/**
 * Larguras geradas para cada imagem de produto.
 *
 * AVIF comprime melhor, mas custa caro para codificar — em uma carga de
 * centenas de fotos isso vira minutos. Por isso o AVIF sai só nas duas
 * larguras que a vitrine realmente serve no card e na página do produto;
 * as demais ficam em WebP, que já é bem suportado.
 */
const VARIANTS: Array<{ label: string; width: number; formats: Array<'webp' | 'avif'> }> = [
  { label: 'thumb', width: 320, formats: ['webp'] },
  { label: 'card', width: 640, formats: ['webp', 'avif'] },
  { label: 'detalhe', width: 1024, formats: ['webp', 'avif'] },
  { label: 'zoom', width: 1600, formats: ['webp'] },
];

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const MAX_BYTES = 15 * 1024 * 1024;

@Injectable()
export class ImageService {
  constructor(private readonly storage: StorageService) {}

  /**
   * Processa e envia uma imagem: original saneado + derivações responsivas.
   *
   * O original é reescrito pelo `sharp` mesmo quando não muda de formato.
   * Isso corrige a orientação EXIF (foto de celular deitada) e descarta
   * metadados — incluindo geolocalização, que não tem por que ir para a web.
   */
  async process(
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    folder = 'produtos',
  ): Promise<ProcessedImage> {
    this.assertAcceptable(file);

    const source = sharp(file.buffer, { failOn: 'error' }).rotate();
    const metadata = await source.metadata();

    if (!metadata.width || !metadata.height) {
      throw new BadRequestException('Não foi possível ler as dimensões da imagem.');
    }

    const originalBuffer = await source.clone().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const originalKey = this.storage.buildKey(folder, file.originalname, 'jpg');
    const originalUrl = await this.storage.put(originalKey, originalBuffer, 'image/jpeg');

    const variants: ImageVariant[] = [];

    for (const variant of VARIANTS) {
      // Não aumentamos a imagem: subir uma foto de 400px não gera 1600px.
      if (variant.width > metadata.width) continue;

      for (const format of variant.formats) {
        const buffer = await sharp(file.buffer)
          .rotate()
          .resize({ width: variant.width, withoutEnlargement: true })
          [format]({ quality: format === 'avif' ? 55 : 78 })
          .toBuffer();

        const key = this.storage.buildKey(folder, file.originalname, format);
        const url = await this.storage.put(key, buffer, `image/${format}`);

        variants.push({
          label: variant.label,
          width: variant.width,
          format,
          url,
          key,
          size: buffer.length,
        });
      }
    }

    return {
      key: originalKey,
      url: originalUrl,
      mime: 'image/jpeg',
      size: originalBuffer.length,
      width: metadata.width,
      height: metadata.height,
      blurhash: await this.blurhash(file.buffer),
      variants,
    };
  }

  /**
   * Gera os ícones do PWA a partir do logo enviado no painel.
   *
   * É o que permite trocar a marca sem tocar em código: quem sobe o logo
   * ganha favicon, ícone de instalação e ícone do iOS na mesma ação.
   */
  async generateAppIcons(
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    background = '#1B3A8C',
  ): Promise<Array<{ size: number; url: string; key: string; purpose: string }>> {
    this.assertAcceptable(file);

    const targets = [
      { size: 512, purpose: 'pwa' },
      { size: 192, purpose: 'pwa' },
      { size: 180, purpose: 'apple-touch' },
      { size: 32, purpose: 'favicon' },
      { size: 16, purpose: 'favicon' },
    ];

    const icons = [];

    for (const target of targets) {
      const buffer = await sharp(file.buffer)
        .rotate()
        .resize({
          width: target.size,
          height: target.size,
          fit: 'contain',
          // Ícone de app não pode ter fundo transparente no iOS: fica preto.
          background,
        })
        .png()
        .toBuffer();

      const key = this.storage.buildKey('marca/icones', `icone-${target.size}.png`, 'png');
      const url = await this.storage.put(key, buffer, 'image/png');

      icons.push({ size: target.size, url, key, purpose: target.purpose });
    }

    return icons;
  }

  private assertAcceptable(file: { mimetype: string; size: number }): void {
    if (!ACCEPTED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        `Formato não aceito (${file.mimetype}). Envie JPG, PNG, WebP ou AVIF.`,
      );
    }

    if (file.size > MAX_BYTES) {
      throw new BadRequestException('A imagem passa de 15 MB. Reduza antes de enviar.');
    }
  }

  /**
   * Placeholder borrado exibido enquanto a foto carrega — evita o salto de
   * layout que penaliza o CLS.
   */
  private async blurhash(buffer: Buffer): Promise<string | null> {
    try {
      const { data, info } = await sharp(buffer)
        .rotate()
        .raw()
        .ensureAlpha()
        .resize(32, 32, { fit: 'inside' })
        .toBuffer({ resolveWithObject: true });

      return encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
    } catch {
      // Sem blurhash a imagem ainda funciona; não vale falhar o upload por isso.
      return null;
    }
  }
}
