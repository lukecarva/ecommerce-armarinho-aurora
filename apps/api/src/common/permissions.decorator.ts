import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'aurora:permissions';
export const PUBLIC_KEY = 'aurora:public';

/**
 * Exige permissões para acessar a rota.
 *
 * `@RequirePermissions('catalogo:editar')` — todas as permissões listadas são
 * exigidas. Coringas (`catalogo:*`, `*`) são resolvidos no guard.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Marca uma rota como pública, dispensando o AuthGuard global. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
