import { Badge, Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/layout';
import {
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Switch,
  Textarea,
} from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, toDateInput } from '../lib/format';
import { useToast } from '../lib/toast';

interface Draft {
  id?: string;
  name: string;
  slug: string;
  type: 'sazonal' | 'oferta' | 'curadoria';
  description: string;
  bannerUrl: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  productIds: string[];
}

const TYPE_LABELS = {
  sazonal: 'Sazonal',
  oferta: 'Ofertas',
  curadoria: 'Curadoria',
} as const;

export function CollectionsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const collections = useQuery({ queryKey: ['colecoes'], queryFn: api.collections.list });

  const products = useQuery({
    queryKey: ['produtos', 'para-colecao'],
    queryFn: () => api.products.list({ perPage: 100, status: 'ativo' }),
    enabled: draft !== null,
  });

  const save = useMutation({
    mutationFn: (item: Draft) => {
      const body = {
        name: item.name,
        slug: item.slug || undefined,
        type: item.type,
        description: item.description || null,
        bannerUrl: item.bannerUrl || null,
        startsAt: item.startsAt || null,
        endsAt: item.endsAt || null,
        active: item.active,
        position: 0,
        productIds: item.productIds,
      };
      return item.id ? api.collections.update(item.id, body) : api.collections.create(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['colecoes'] });
      toast.success('Coleção salva.');
      setDraft(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: api.collections.remove,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['colecoes'] });
      toast.success('Coleção excluída.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function openEdit(id: string) {
    const collection = await api.collections.get(id);
    setDraft({
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      type: collection.type,
      description: '',
      bannerUrl: collection.bannerUrl ?? '',
      startsAt: toDateInput(collection.startsAt),
      endsAt: toDateInput(collection.endsAt),
      active: collection.active,
      productIds: collection.productIds,
    });
  }

  return (
    <>
      <PageHeader
        title="Coleções"
        description="Agrupamentos editoriais. Coleções sazonais entram e saem da vitrine sozinhas nas datas marcadas."
        actions={
          can('catalogo:criar') ? (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() =>
                setDraft({
                  name: '',
                  slug: '',
                  type: 'curadoria',
                  description: '',
                  bannerUrl: '',
                  startsAt: '',
                  endsAt: '',
                  active: true,
                  productIds: [],
                })
              }
            >
              Nova coleção
            </Button>
          ) : null
        }
      />

      <Card>
        {collections.isLoading ? (
          <Spinner />
        ) : (collections.data ?? []).length === 0 ? (
          <EmptyState
            title="Nenhuma coleção"
            description="Crie coleções para campanhas como Natal, Festa Junina ou Ofertas da semana."
          />
        ) : (
          <ul className="divide-ink-200 divide-y">
            {(collections.data ?? []).map((collection) => (
              <li key={collection.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-ink-800 flex items-center gap-2 font-medium">
                    {collection.name}
                    <Badge tone={collection.live ? 'stock' : 'neutral'}>
                      {collection.live ? 'No ar' : 'Fora do ar'}
                    </Badge>
                    <Badge tone="brand">{TYPE_LABELS[collection.type]}</Badge>
                  </p>
                  <p className="text-ink-500 text-xs">
                    /{collection.slug} · {collection.productCount} produto(s)
                    {collection.startsAt
                      ? ` · de ${formatDate(collection.startsAt)} a ${formatDate(collection.endsAt)}`
                      : ''}
                  </p>
                </div>

                {can('catalogo:editar') ? (
                  <button
                    type="button"
                    aria-label={`Editar ${collection.name}`}
                    onClick={() => void openEdit(collection.id)}
                    className="text-ink-500 hover:text-brand-600"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                ) : null}

                {can('catalogo:excluir') ? (
                  <button
                    type="button"
                    aria-label={`Excluir ${collection.name}`}
                    onClick={() => {
                      if (window.confirm(`Excluir a coleção "${collection.name}"?`)) {
                        remove.mutate(collection.id);
                      }
                    }}
                    className="text-ink-500 hover:text-price-600"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        wide
        title={draft?.id ? 'Editar coleção' : 'Nova coleção'}
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={() => draft && save.mutate(draft)} disabled={save.isPending}>
              Salvar
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" required>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                autoFocus
              />
            </Field>

            <Field label="Tipo">
              <Select
                value={draft.type}
                onChange={(event) =>
                  setDraft({ ...draft, type: event.target.value as Draft['type'] })
                }
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Entra em" hint="Deixe vazio para valer imediatamente">
              <Input
                type="date"
                value={draft.startsAt}
                onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
              />
            </Field>

            <Field label="Sai em" hint="Deixe vazio para não sair sozinha">
              <Input
                type="date"
                value={draft.endsAt}
                onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
              />
            </Field>

            <Field label="Banner (URL)" className="sm:col-span-2">
              <Input
                value={draft.bannerUrl}
                onChange={(event) => setDraft({ ...draft, bannerUrl: event.target.value })}
              />
            </Field>

            <Field label="Descrição" className="sm:col-span-2">
              <Textarea
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Field>

            <div className="sm:col-span-2">
              <Switch
                label="Ativa"
                hint="Desativar tira da vitrine mesmo dentro da janela de datas"
                checked={draft.active}
                onChange={(active) => setDraft({ ...draft, active })}
              />
            </div>

            <div className="sm:col-span-2">
              <p className="text-ink-700 mb-2 text-sm font-medium">
                Produtos ({draft.productIds.length})
              </p>

              <div className="rounded-card border-ink-200 max-h-64 overflow-y-auto border p-2">
                {products.isLoading ? (
                  <Spinner label="Carregando produtos…" />
                ) : (
                  (products.data?.items ?? []).map((product) => (
                    <label
                      key={product.id}
                      className="hover:bg-ink-50 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={draft.productIds.includes(product.id)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            productIds: event.target.checked
                              ? [...draft.productIds, product.id]
                              : draft.productIds.filter((item) => item !== product.id),
                          })
                        }
                      />
                      <span className="truncate">{product.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
