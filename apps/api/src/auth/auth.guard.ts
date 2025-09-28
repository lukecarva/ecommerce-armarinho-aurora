import { hasAllPermissions } from '@aurora/types';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithUser } from '../common/current-user';
import { PERMISSIONS_KEY, PUBLIC_KEY } from '../common/permissions.decorator';
import { AuthService } from './auth.service';

/**
 * Guard global: autentica e checa permissão.
 *
 * O usuário é carregado do banco a cada requisição, e não lido do JWT. Custa
 * uma consulta, mas garante que tirar a permissão de alguém tem efeito
 * imediato — não em 15 minutos, quando o token dele expirar.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearer(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Faça login para continuar.');
    }

    const payload = this.auth.verifyAccessToken(token);
    const user = await this.auth.resolveUser(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Sua conta foi desativada.');
    }

    request.user = user;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required && required.length > 0 && !hasAllPermissions(user.permissions, required)) {
      throw new ForbiddenException(
        `Seu perfil (${user.roleName}) não tem permissão para esta ação.`,
      );
    }

    return true;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
