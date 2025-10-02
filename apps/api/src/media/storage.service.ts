import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import { loadEnv } from '../config/env';

/**
 * Armazenamento de arquivos compatível com S3.
 *
 * Em desenvolvimento aponta para o MinIO do Docker Compose; em produção, para
 * o Cloudflare R2. A única diferença é a configuração — o código é o mesmo,
 * então o que funciona na máquina do dev funciona no servidor.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly env = loadEnv();
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({
      endpoint: this.env.S3_ENDPOINT,
      region: this.env.S3_REGION,
      forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: this.env.S3_ACCESS_KEY_ID,
        secretAccessKey: this.env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  /**
   * Monta um caminho previsível e sem colisão.
   * Ex.: "produtos/2026/09/a1b2c3d4e5f6.webp"
   */
  buildKey(folder: string, originalName: string, extension?: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const ext = extension ?? (extname(originalName).toLowerCase().replace('.', '') || 'bin');
    const id = randomBytes(8).toString('hex');

    return `${sanitizeFolder(folder)}/${year}/${month}/${id}.${ext}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Imagens de catálogo são imutáveis: o nome muda a cada upload, então
        // o cache pode ser agressivo sem risco de servir versão velha.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return this.publicUrl(key);
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
    } catch (error) {
      // Falhar ao apagar um arquivo não pode impedir a remoção do registro.
      this.logger.warn(`Não foi possível remover "${key}" do armazenamento`, error);
    }
  }

  publicUrl(key: string): string {
    return `${this.env.S3_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }
}

function sanitizeFolder(folder: string): string {
  const clean = folder
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');

  return clean.length > 0 ? clean : 'geral';
}
