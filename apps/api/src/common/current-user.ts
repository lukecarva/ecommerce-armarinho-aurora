import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Identidade do usuário autenticado, anexada à requisição pelo AuthGuard. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/** `@CurrentUser() user: AuthenticatedUser` no controller. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);

/** IP real do cliente, respeitando o proxy reverso. Usado na auditoria. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return request.ip ?? null;
}
