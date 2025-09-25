import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Carrega o `.env` único da raiz do monorepo.
 *
 * Precisa acontecer antes de qualquer leitura de `process.env` — inclusive
 * antes do Nest subir, porque o `bootstrap` já lê a porta e a URL do banco.
 * Um `.env` dentro do app, se existir, tem prioridade (útil em container).
 */
export function loadEnvFiles(): void {
  loadDotenv({ path: resolve(process.cwd(), '.env'), quiet: true });
  loadDotenv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
}

/**
 * Validação do ambiente na subida.
 *
 * Falhar aqui é melhor que descobrir em produção que faltou um segredo:
 * o processo não sobe com configuração incompleta.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(3333),
  API_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // ── Autenticação do painel ────────────────────────────────────────────────
  JWT_ACCESS_SECRET: z.string().min(16, 'Use um segredo com pelo menos 16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'Use um segredo com pelo menos 16 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // ── Armazenamento de mídia (MinIO em dev, Cloudflare R2 em produção) ──────
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('aurora'),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((value) => value === 'true'),
  S3_PUBLIC_URL: z.string().url(),

  STORE_WHATSAPP: z.string().default('5511999990000'),

  /**
   * Atacado. Desligado na v1: as tabelas de preço por grupo existem e são
   * editáveis no painel, mas nada de atacado aparece na vitrine.
   */
  WHOLESALE_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),

  STORE_NAME: z.string().default('Armarinho Aurora'),
  /** Base pública da vitrine — usada nos links dentro dos e-mails. */
  SITE_URL: z.string().url().default('http://localhost:3000'),

  // ── E-mail transacional ──────────────────────────────────────────────────
  /**
   * `log` não envia nada: registra a mensagem inteira no log do serviço.
   *
   * É o padrão enquanto a loja não tem e-mail oficial e servidor SMTP. O
   * fluxo do pedido roda completo e verificável, e ligar o envio de verdade
   * vira troca de variável de ambiente, não mudança de código.
   */
  MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_USER: z.string().default(''),
  MAIL_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('Armarinho Aurora <nao-responda@armarinhoaurora.com.br>'),
  /**
   * Fora de produção, TODO e-mail vai para este endereço.
   *
   * É a trava que impede um teste em homologação de mandar mensagem para a
   * caixa de uma cliente de verdade.
   */
  MAIL_CATCH_ALL: z.string().default(''),
  /** Para onde vai o aviso de pedido novo. Vazio desliga a notificação. */
  MAIL_TEAM: z.string().default(''),

  /**
   * Teto de pedidos por IP a cada hora.
   *
   * Sem pagamento no site, criar pedido é grátis para quem quiser encher o
   * kanban de lixo. Não substitui o reCAPTCHA previsto no plano — que
   * depende de chaves do Google ainda não fornecidas —, mas já barra o
   * script ingênuo.
   */
  ORDER_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuração de ambiente inválida:\n${issues}\n\nCopie o .env.example para .env e ajuste.`,
    );
  }

  return parsed.data;
}
