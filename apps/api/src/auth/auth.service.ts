import { hash, verify } from '@node-rs/argon2';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../common/current-user';
import { loadEnv } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Segundos até o access token expirar — o painel usa para renovar antes. */
  expiresIn: number;
}

export interface LoginContext {
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Parâmetros do argon2id recomendados para senha interativa.
 * Custo de memória de 19 MiB é o mínimo sugerido pela OWASP.
 */
const ARGON_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return hash(password, ARGON_OPTIONS);
  }

  async login(email: string, password: string, context: LoginContext): Promise<TokenPair> {
    const user = await this.prisma.adminUser.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { role: true },
    });

    // Mesma mensagem e mesmo custo de tempo para e-mail inexistente e senha
    // errada: não revelamos quais e-mails existem no painel.
    if (!user || !user.active) {
      await this.wasteTime();
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    const valid = await verify(user.passwordHash, password).catch(() => false);
    if (!valid) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }

    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id, context);
  }

  /**
   * Rotaciona o refresh token.
   *
   * Cada refresh gasta a sessão anterior e cria outra. Se um token já gasto
   * voltar, é sinal de roubo: derrubamos todas as sessões do usuário.
   */
  async refresh(refreshToken: string, context: LoginContext): Promise<TokenPair> {
    const tokenHash = this.hashToken(refreshToken);

    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Sessão inválida. Entre novamente.');
    }

    if (session.revokedAt) {
      this.logger.warn(
        `Refresh token reutilizado (usuário ${session.userId}). Derrubando todas as sessões.`,
      );
      await this.revokeAllSessions(session.userId);
      throw new UnauthorizedException('Sessão expirada por segurança. Entre novamente.');
    }

    if (session.expiresAt < new Date() || !session.user.active) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }

    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    return this.issueTokens(session.userId, context);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;

    await this.prisma.adminSession.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Carrega o usuário do token para o guard, sempre fresco do banco. */
  async resolveUser(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.active) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
      permissions: Array.isArray(user.role.permissions) ? (user.role.permissions as string[]) : [],
    };
  }

  /** Decodifica o access token recém-emitido e devolve o usuário completo. */
  async resolveFromAccessToken(token: string): Promise<AuthenticatedUser> {
    const payload = this.verifyAccessToken(token);
    const user = await this.resolveUser(payload.sub);
    if (!user) throw new UnauthorizedException('Sua conta foi desativada.');
    return user;
  }

  verifyAccessToken(token: string): { sub: string } {
    try {
      return this.jwt.verify<{ sub: string }>(token, { secret: this.env.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException('Sessão expirada. Entre novamente.');
    }
  }

  /** Duração do refresh em milissegundos — usada para o cookie e para o banco. */
  get refreshTtlMs(): number {
    return parseDuration(this.env.JWT_REFRESH_TTL);
  }

  private async issueTokens(userId: string, context: LoginContext): Promise<TokenPair> {
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.prisma.adminSession.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        userAgent: context.userAgent?.slice(0, 255) ?? null,
        ip: context.ip ?? null,
        expiresAt,
      },
    });

    // O `expiresIn` do jsonwebtoken aceita string ou segundos; usamos segundos
    // para não depender do formato textual e devolver o mesmo valor ao painel.
    const expiresIn = Math.floor(parseDuration(this.env.JWT_ACCESS_TTL) / 1000);

    const accessToken = this.jwt.sign(
      { sub: userId },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn },
    );

    return { accessToken, refreshToken, expiresIn };
  }

  /**
   * O token guardado é sempre o HMAC, nunca o valor original: quem ler a
   * tabela de sessões não consegue se passar por ninguém.
   */
  private hashToken(token: string): string {
    return createHmac('sha256', this.env.JWT_REFRESH_SECRET).update(token).digest('hex');
  }

  /** Equaliza o tempo de resposta quando o e-mail não existe. */
  private async wasteTime(): Promise<void> {
    await verify(
      '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2E$0000000000000000000000000000000000000000000',
      'senha-invalida',
    ).catch(() => false);
  }
}

/** "15m", "30d", "12h", "45s" → milissegundos. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) throw new Error(`Duração inválida: "${value}". Use algo como "15m" ou "30d".`);

  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];

  return amount * factor;
}
