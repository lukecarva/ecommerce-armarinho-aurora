import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Pagination, Select, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';

const ACTION_LABELS: Record<string, string> = {
  criar: 'criou',
  editar: 'editou',
  excluir: 'excluiu',
  reordenar: 'reordenou',
  upload: 'enviou',
  login: 'entrou no painel',
  logout: 'saiu do painel',
};

const ENTITY_LABELS: Record<string, string> = {
  produto: 'produto',
  categoria: 'categoria',
  colecao: 'coleção',
  midia: 'mídia',
  usuario: 'usuário',
  papel: 'perfil de acesso',
  configuracao: 'configuração',
  sessao: 'sessão',
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');

  const audit = useQuery({
    queryKey: ['auditoria', { page, entity }],
    queryFn: () => api.users.audit({ page, perPage: 30, entity: entity || undefined }),
  });

  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Registro de tudo que foi alterado no painel, com autor, data e o que mudou."
      />

      <Card className="mb-4">
        <Select
          className="max-w-xs"
          value={entity}
          onChange={(event) => {
            setEntity(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas as áreas</option>
          {Object.entries(ENTITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Card>

      <Card>
        {audit.isLoading ? (
          <Spinner />
        ) : (audit.data?.items ?? []).length === 0 ? (
          <EmptyState title="Nada registrado ainda" />
        ) : (
          <ul className="divide-ink-200 divide-y">
            {(audit.data?.items ?? []).map((entry) => (
              <li key={entry.id} className="py-3">
                <p className="text-ink-800 text-sm">
                  <strong>{entry.actor?.name ?? 'Sistema'}</strong>{' '}
                  {ACTION_LABELS[entry.action] ?? entry.action}{' '}
                  {ENTITY_LABELS[entry.entity] ?? entry.entity}
                </p>

                <p className="text-ink-500 text-xs">
                  {formatDateTime(entry.createdAt)}
                  {entry.ip ? ` · ${entry.ip}` : ''}
                </p>

                {entry.diff ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {Object.entries(entry.diff).map(([field, change]) => (
                      <li key={field} className="text-ink-600 text-xs">
                        <span className="font-medium">{field}:</span>{' '}
                        <span className="text-ink-400 line-through">{render(change?.de)}</span> →{' '}
                        <span>{render(change?.para)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {audit.data ? (
        <div className="mt-4">
          <Pagination
            page={audit.data.page}
            totalPages={audit.data.totalPages}
            total={audit.data.total}
            onChange={setPage}
          />
        </div>
      ) : null}
    </>
  );
}

function render(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
