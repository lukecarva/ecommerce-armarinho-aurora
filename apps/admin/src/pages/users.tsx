import {
  ACTION_LABELS,
  MODULE_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  hasPermission,
} from '@aurora/types';
import { Badge, Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/layout';
import { Card, Field, Input, Modal, Select, Spinner, Switch } from '../components/ui';
import { api, type RoleRow } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';

interface UserDraft {
  id?: string;
  name: string;
  email: string;
  password: string;
  roleId: string;
  active: boolean;
}

export function UsersPage() {
  const { can, user: currentUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleRow | null>(null);

  const users = useQuery({ queryKey: ['usuarios'], queryFn: api.users.list });
  const roles = useQuery({ queryKey: ['papeis'], queryFn: api.users.roles });

  const saveUser = useMutation({
    mutationFn: (item: UserDraft) => {
      const body = {
        name: item.name,
        email: item.email,
        roleId: item.roleId,
        active: item.active,
        ...(item.password ? { password: item.password } : {}),
      };
      return item.id ? api.users.update(item.id, body) : api.users.create(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success('Usuário salvo.');
      setDraft(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveRole = useMutation({
    mutationFn: (role: RoleRow) =>
      api.users.updateRole(role.id, {
        name: role.name,
        description: role.description,
        permissions: role.permissions,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['papeis'] });
      toast.success('Permissões salvas. Quem usa este perfil precisa entrar de novo.');
      setRoleDraft(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (users.isLoading || roles.isLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Usuários e permissões"
        description="Quem acessa o painel e o que cada perfil pode fazer."
        actions={
          can('usuarios:criar') ? (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() =>
                setDraft({
                  name: '',
                  email: '',
                  password: '',
                  roleId: roles.data?.[0]?.id ?? '',
                  active: true,
                })
              }
            >
              Novo usuário
            </Button>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Equipe" className="lg:col-span-2">
          <ul className="divide-ink-200 divide-y">
            {(users.data ?? []).map((user) => (
              <li key={user.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-ink-800 flex items-center gap-2 font-medium">
                    {user.name}
                    {user.id === currentUser?.id ? <Badge tone="brand">você</Badge> : null}
                    {!user.active ? <Badge tone="neutral">inativo</Badge> : null}
                  </p>
                  <p className="text-ink-500 text-xs">
                    {user.email} · {user.role.name} · último acesso{' '}
                    {formatDateTime(user.lastLoginAt)}
                  </p>
                </div>

                {can('usuarios:editar') ? (
                  <button
                    type="button"
                    aria-label={`Editar ${user.name}`}
                    onClick={() =>
                      setDraft({
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        password: '',
                        roleId: user.role.id,
                        active: user.active,
                      })
                    }
                    className="text-ink-500 hover:text-brand-600"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Perfis de acesso">
          <ul className="space-y-2">
            {(roles.data ?? []).map((role) => (
              <li key={role.id} className="rounded-card border-ink-200 border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-ink-800 flex items-center gap-1.5 font-medium">
                      <ShieldCheck className="text-brand-600 size-4" aria-hidden />
                      {role.name}
                    </p>
                    <p className="text-ink-500 text-xs">{role.description}</p>
                    <p className="text-ink-400 mt-1 text-xs">{role._count.users} usuário(s)</p>
                  </div>

                  {can('usuarios:editar') ? (
                    <button
                      type="button"
                      aria-label={`Editar permissões de ${role.name}`}
                      onClick={() => setRoleDraft({ ...role })}
                      className="text-ink-500 hover:text-brand-600"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar usuário' : 'Novo usuário'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={() => draft && saveUser.mutate(draft)} disabled={saveUser.isPending}>
              Salvar
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            <Field label="Nome" required>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                autoFocus
              />
            </Field>

            <Field label="E-mail" required>
              <Input
                type="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              />
            </Field>

            <Field
              label={draft.id ? 'Nova senha' : 'Senha'}
              required={!draft.id}
              hint={
                draft.id
                  ? 'Deixe vazio para manter a atual. Trocar a senha encerra as sessões abertas.'
                  : 'Mínimo de 10 caracteres'
              }
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
              />
            </Field>

            <Field label="Perfil de acesso" required>
              <Select
                value={draft.roleId}
                onChange={(event) => setDraft({ ...draft, roleId: event.target.value })}
              >
                {(roles.data ?? []).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Switch
              label="Ativo"
              hint="Desativar encerra as sessões abertas imediatamente"
              checked={draft.active}
              onChange={(active) => setDraft({ ...draft, active })}
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={roleDraft !== null}
        onClose={() => setRoleDraft(null)}
        wide
        title={`Permissões — ${roleDraft?.name ?? ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setRoleDraft(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => roleDraft && saveRole.mutate(roleDraft)}
              disabled={saveRole.isPending}
            >
              Salvar
            </Button>
          </>
        }
      >
        {roleDraft ? (
          <div className="overflow-x-auto">
            {roleDraft.permissions.includes('*') ? (
              <p className="rounded-button bg-accent-50 text-accent-700 mb-4 px-3 py-2 text-sm">
                Este perfil tem acesso total. Desmarcar qualquer item substitui o acesso total pela
                lista detalhada.
              </p>
            ) : null}

            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-ink-500 text-left text-xs tracking-wide uppercase">
                <tr>
                  <th className="py-2">Módulo</th>
                  {PERMISSION_ACTIONS.map((action) => (
                    <th key={action} className="py-2 text-center">
                      {ACTION_LABELS[action]}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-ink-200 divide-y">
                {PERMISSION_MODULES.map((module) => (
                  <tr key={module}>
                    <td className="text-ink-700 py-2">{MODULE_LABELS[module]}</td>

                    {PERMISSION_ACTIONS.map((action) => {
                      const permission = `${module}:${action}`;
                      const checked = hasPermission(roleDraft.permissions, permission);

                      return (
                        <td key={action} className="py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${MODULE_LABELS[module]} — ${ACTION_LABELS[action]}`}
                            checked={checked}
                            onChange={(event) =>
                              setRoleDraft((current) =>
                                current
                                  ? togglePermission(current, permission, event.target.checked)
                                  : current,
                              )
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * Marcar e desmarcar precisa lidar com os coringas.
 *
 * Desmarcar um item de um perfil que tem `*` exige expandir o coringa na lista
 * concreta primeiro — senão a permissão continuaria valendo pelo atalho.
 */
function togglePermission(role: RoleRow, permission: string, checked: boolean): RoleRow {
  const [module] = permission.split(':');

  let permissions = [...role.permissions];

  if (!checked) {
    if (permissions.includes('*')) {
      permissions = PERMISSION_MODULES.flatMap((item) =>
        PERMISSION_ACTIONS.map((action) => `${item}:${action}`),
      );
    }

    if (permissions.includes(`${module}:*`)) {
      permissions = permissions.filter((item) => item !== `${module}:*`);
      permissions.push(...PERMISSION_ACTIONS.map((action) => `${module}:${action}`));
    }

    permissions = permissions.filter((item) => item !== permission);
  } else if (!permissions.includes(permission)) {
    permissions.push(permission);
  }

  return { ...role, permissions: Array.from(new Set(permissions)) };
}
