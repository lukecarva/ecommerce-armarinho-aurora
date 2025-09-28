import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../common/audit.service';
import { clientIp, CurrentUser, type AuthenticatedUser } from '../common/current-user';
import { Public } from '../common/permissions.decorator';
import { LIMITES, RateLimitService } from '../common/rate-limit.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  password: z.string().min(1, 'Informe a senha'),
});
type LoginInput = z.infer<typeof loginSchema>;

/** Cookie httpOnly que carrega o refresh token. O painel nunca o lê em JS. */
const REFRESH_COOKIE = 'cp_refresh';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly limite: RateLimitService,
  ) {}

  @Public()
  @Post('login')
  @UsePipes(new ZodValidationPipe(loginSchema))
  @ApiOkResponse({ description: 'Autentica no painel e devolve o access token.' })
  async login(
    @Body() body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Duas chaves: por IP barra quem testa muitas contas da mesma máquina; por
    // e-mail barra quem testa muitas senhas na mesma conta a partir de vários
    // IPs. O painel dá acesso a pedidos e dados de clientes — é o alvo que
    // mais compensa atacar.
    const ip = clientIp(request) ?? 'desconhecido';
    this.limite.consumir(
      `painel:login:ip:${ip}`,
      LIMITES.loginPorIp.limite,
      LIMITES.loginPorIp.janelaMs,
    );
    this.limite.consumir(
      `painel:login:email:${body.email}`,
      LIMITES.loginPorEmail.limite,
      LIMITES.loginPorEmail.janelaMs,
    );

    const tokens = await this.auth.login(body.email, body.password, {
      userAgent: request.headers['user-agent'],
      ip: clientIp(request),
    });

    this.limite.liberar(`painel:login:email:${body.email}`);

    this.setRefreshCookie(response, tokens.refreshToken);
    const user = await this.auth.resolveFromAccessToken(tokens.accessToken);

    await this.audit.record({
      actorId: user.id,
      entity: 'sessao',
      entityId: user.id,
      action: 'login',
      ip: clientIp(request),
    });

    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user };
  }

  @Public()
  @Post('refresh')
  @ApiOkResponse({ description: 'Rotaciona a sessão e devolve um novo access token.' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const current = this.readRefreshCookie(request);

    if (!current) {
      response.clearCookie(REFRESH_COOKIE, { path: '/' });
      throw new UnauthorizedException('Sessão não encontrada. Entre novamente.');
    }

    const tokens = await this.auth.refresh(current, {
      userAgent: request.headers['user-agent'],
      ip: clientIp(request),
    });

    this.setRefreshCookie(response, tokens.refreshToken);
    const user = await this.auth.resolveFromAccessToken(tokens.accessToken);

    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn, user };
  }

  @Public()
  @Post('logout')
  @ApiOkResponse({ description: 'Encerra a sessão atual.' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(this.readRefreshCookie(request));
    response.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @ApiOkResponse({ description: 'Usuário autenticado, com papel e permissões.' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      // `lax` basta: o refresh só é usado em POST originado do próprio painel.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: this.auth.refreshTtlMs,
    });
  }
}
