import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  type ClienteDaSessao,
  CUSTOMER_COOKIE,
  CustomerAuthService,
} from './customer-auth.service';

/**
 * Exige cliente logado na vitrine.
 *
 * Separado do guard do painel de propósito: o painel autentica por cabeçalho
 * `Authorization` e checa permissão; a vitrine autentica por cookie e não tem
 * papéis. Um guard que tentasse fazer os dois seria um lugar a mais para uma
 * rota do painel aceitar sessão de cliente por engano.
 *
 * Rotas que usam este guard também levam `@Public()`, para o guard global do
 * painel deixá-las passar.
 */
@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly auth: CustomerAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestComCliente>();
    const cookies = request.cookies as Record<string, string> | undefined;

    const cliente = await this.auth.resolver(cookies?.[CUSTOMER_COOKIE]);
    if (!cliente) throw new UnauthorizedException('Entre na sua conta para continuar.');

    request.cliente = cliente;
    return true;
  }
}

export interface RequestComCliente extends Request {
  cliente?: ClienteDaSessao;
}

/** `@ClienteAtual() cliente: ClienteDaSessao` numa rota com `CustomerGuard`. */
export const ClienteAtual = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClienteDaSessao => {
    const request = context.switchToHttp().getRequest<RequestComCliente>();
    return request.cliente!;
  },
);

/** Token de sessão cru, para a troca de senha manter a sessão atual viva. */
export function tokenDaSessao(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, string> | undefined;
  return cookies?.[CUSTOMER_COOKIE];
}
