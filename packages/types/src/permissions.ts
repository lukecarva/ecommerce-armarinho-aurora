/**
 * Controle de acesso do painel (RBAC).
 *
 * Uma permissão é `modulo:acao`. Coringas encurtam a configuração:
 * `*` libera tudo e `catalogo:*` libera o módulo inteiro. O mesmo arquivo é
 * usado pela API (para bloquear) e pelo painel (para esconder o que a pessoa
 * não pode fazer) — assim os dois nunca discordam sobre quem pode o quê.
 *
 * A verificação no servidor é a que vale; o painel apenas evita mostrar
 * botões que resultariam em 403.
 */

export const PERMISSION_MODULES = [
  'catalogo',
  'midia',
  'estoque',
  'importacao',
  'exportacao',
  'pedidos',
  'clientes',
  'cupons',
  'cms',
  'cursos',
  'tarefas',
  'relatorios',
  'identidade',
  'configuracoes',
  'usuarios',
] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const PERMISSION_ACTIONS = ['ver', 'criar', 'editar', 'excluir'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type Permission = `${PermissionModule}:${PermissionAction}`;

export const MODULE_LABELS: Record<PermissionModule, string> = {
  catalogo: 'Catálogo',
  midia: 'Mídia',
  estoque: 'Estoque',
  importacao: 'Importação',
  exportacao: 'Exportação',
  pedidos: 'Pedidos',
  clientes: 'Clientes',
  cupons: 'Cupons',
  cms: 'Conteúdo do site',
  cursos: 'Cursos e workshops',
  tarefas: 'Tarefas internas',
  relatorios: 'Relatórios',
  identidade: 'Identidade visual',
  configuracoes: 'Configurações',
  usuarios: 'Usuários e permissões',
};

export const ACTION_LABELS: Record<PermissionAction, string> = {
  ver: 'Ver',
  criar: 'Criar',
  editar: 'Editar',
  excluir: 'Excluir',
};

/** Todas as permissões concretas, para montar a tela de papéis. */
export function allPermissions(): Permission[] {
  return PERMISSION_MODULES.flatMap((module) =>
    PERMISSION_ACTIONS.map((action) => `${module}:${action}` as Permission),
  );
}

/**
 * A pessoa tem a permissão exigida?
 *
 * Aceita a permissão exata, o coringa do módulo (`catalogo:*`) e o coringa
 * geral (`*`).
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;

  const [module] = required.split(':');
  return module !== undefined && granted.includes(`${module}:*`);
}

/** Exige todas as permissões da lista. */
export function hasAllPermissions(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  return required.every((permission) => hasPermission(granted, permission));
}

/** Basta uma das permissões da lista. */
export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  return required.some((permission) => hasPermission(granted, permission));
}

/**
 * Expande coringas para a lista concreta — usado para exibir, na tela de
 * papéis, exatamente o que um papel permite.
 */
export function expandPermissions(granted: readonly string[]): Permission[] {
  return allPermissions().filter((permission) => hasPermission(granted, permission));
}

/** Papéis que a loja usa no dia a dia, semeados na instalação. */
export const DEFAULT_ROLES: Array<{
  name: string;
  description: string;
  permissions: string[];
}> = [
  {
    name: 'Dono',
    description: 'Acesso total, inclusive usuários e configurações',
    permissions: ['*'],
  },
  {
    name: 'Gerente',
    description: 'Catálogo, pedidos, clientes, promoções e relatórios',
    permissions: [
      'catalogo:*',
      'midia:*',
      'estoque:*',
      'importacao:*',
      'exportacao:*',
      'pedidos:*',
      'clientes:*',
      'cupons:*',
      'cms:*',
      'cursos:*',
      'tarefas:*',
      'relatorios:ver',
    ],
  },
  {
    name: 'Vendedor',
    description: 'Atende os pedidos que chegam do site',
    permissions: [
      'pedidos:ver',
      'pedidos:editar',
      'clientes:ver',
      'catalogo:ver',
      'tarefas:ver',
      'tarefas:editar',
    ],
  },
  {
    name: 'Estoquista',
    description: 'Ajusta estoque e importa planilhas do Futura',
    permissions: ['catalogo:ver', 'estoque:*', 'importacao:*', 'exportacao:ver'],
  },
  {
    name: 'Marketing',
    description: 'Banners, coleções, cupons e SEO',
    permissions: ['cms:*', 'cupons:*', 'midia:*', 'catalogo:ver', 'relatorios:ver'],
  },
];
