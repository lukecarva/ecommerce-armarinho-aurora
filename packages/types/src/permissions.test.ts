import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLES,
  allPermissions,
  expandPermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from './permissions.js';

describe('hasPermission', () => {
  it('aceita a permissão exata', () => {
    expect(hasPermission(['catalogo:editar'], 'catalogo:editar')).toBe(true);
    expect(hasPermission(['catalogo:editar'], 'catalogo:excluir')).toBe(false);
  });

  it('aceita o coringa do módulo', () => {
    expect(hasPermission(['catalogo:*'], 'catalogo:excluir')).toBe(true);
    expect(hasPermission(['catalogo:*'], 'pedidos:ver')).toBe(false);
  });

  it('aceita o coringa geral do dono da loja', () => {
    expect(hasPermission(['*'], 'usuarios:excluir')).toBe(true);
  });

  it('nega quando não há nenhuma permissão', () => {
    expect(hasPermission([], 'catalogo:ver')).toBe(false);
  });

  it('não confunde módulos com prefixo parecido', () => {
    // "importacao:*" não pode liberar "exportacao:*"
    expect(hasPermission(['importacao:*'], 'exportacao:criar')).toBe(false);
  });
});

describe('hasAllPermissions / hasAnyPermission', () => {
  const gerente = ['catalogo:*', 'pedidos:*', 'relatorios:ver'];

  it('exige todas na versão "all"', () => {
    expect(hasAllPermissions(gerente, ['catalogo:editar', 'pedidos:ver'])).toBe(true);
    expect(hasAllPermissions(gerente, ['catalogo:editar', 'usuarios:criar'])).toBe(false);
  });

  it('basta uma na versão "any"', () => {
    expect(hasAnyPermission(gerente, ['usuarios:criar', 'catalogo:ver'])).toBe(true);
    expect(hasAnyPermission(gerente, ['usuarios:criar', 'configuracoes:editar'])).toBe(false);
  });
});

describe('expandPermissions', () => {
  it('expande o coringa geral em todas as permissões', () => {
    expect(expandPermissions(['*'])).toHaveLength(allPermissions().length);
  });

  it('expande o coringa do módulo apenas naquele módulo', () => {
    const expanded = expandPermissions(['catalogo:*']);
    expect(expanded).toEqual([
      'catalogo:ver',
      'catalogo:criar',
      'catalogo:editar',
      'catalogo:excluir',
    ]);
  });
});

describe('DEFAULT_ROLES', () => {
  it('o vendedor atende pedido mas não mexe no catálogo', () => {
    const vendedor = DEFAULT_ROLES.find((role) => role.name === 'Vendedor');
    expect(vendedor).toBeDefined();
    expect(hasPermission(vendedor!.permissions, 'pedidos:editar')).toBe(true);
    expect(hasPermission(vendedor!.permissions, 'catalogo:ver')).toBe(true);
    expect(hasPermission(vendedor!.permissions, 'catalogo:editar')).toBe(false);
  });

  it('somente o dono administra usuários', () => {
    for (const role of DEFAULT_ROLES) {
      const podeAdministrarUsuarios = hasPermission(role.permissions, 'usuarios:criar');
      expect(podeAdministrarUsuarios).toBe(role.name === 'Dono');
    }
  });

  it('nenhum papel além do dono altera configurações da loja', () => {
    const comAcesso = DEFAULT_ROLES.filter((role) =>
      hasPermission(role.permissions, 'configuracoes:editar'),
    ).map((role) => role.name);

    expect(comAcesso).toEqual(['Dono']);
  });
});
