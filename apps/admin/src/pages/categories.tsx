import { Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Field, Input, Modal, Select, Spinner, Switch } from '../components/ui';
import { api, type CategoryNode } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

interface Draft {
  id?: string;
  name: string;
  slug: string;
  parentId: string;
  imageUrl: string;
  active: boolean;
}

export function CategoriesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);

  const categories = useQuery({ queryKey: ['categorias'], queryFn: api.categories.list });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categorias'] });

  const save = useMutation({
    mutationFn: (item: Draft) => {
      const body = {
        name: item.name,
        slug: item.slug || undefined,
        parentId: item.parentId || null,
        imageUrl: item.imageUrl || null,
        active: item.active,
      };
      return item.id ? api.categories.update(item.id, body) : api.categories.create(body);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success('Categoria salva.');
      setDraft(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.categories.remove(id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Categoria excluída.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reorder = useMutation({
    mutationFn: api.categories.reorder,
    onSuccess: async () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  /** Troca a categoria de lugar entre os irmãos e reenvia a ordem inteira. */
  function move(siblings: CategoryNode[], index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;

    const ordered = [...siblings];
    const [moved] = ordered.splice(index, 1);
    if (moved) ordered.splice(target, 0, moved);

    reorder.mutate(
      ordered.map((node, position) => ({ id: node.id, parentId: node.parentId, position })),
    );
  }

  const flat = flattenOptions(categories.data ?? []);

  return (
    <>
      <PageHeader
        title="Categorias"
        description="A grade da home segue esta ordem. Arraste com as setas para reorganizar."
        actions={
          can('catalogo:criar') ? (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() =>
                setDraft({ name: '', slug: '', parentId: '', imageUrl: '', active: true })
              }
            >
              Nova categoria
            </Button>
          ) : null
        }
      />

      <Card>
        {categories.isLoading ? (
          <Spinner />
        ) : (categories.data ?? []).length === 0 ? (
          <EmptyState
            title="Nenhuma categoria"
            description="Comece pelas seis categorias do catálogo da loja."
          />
        ) : (
          <Tree
            nodes={categories.data ?? []}
            depth={0}
            onEdit={(node) =>
              setDraft({
                id: node.id,
                name: node.name,
                slug: node.slug,
                parentId: node.parentId ?? '',
                imageUrl: node.imageUrl ?? '',
                active: node.active,
              })
            }
            onRemove={(node) => {
              if (window.confirm(`Excluir a categoria "${node.name}"?`)) remove.mutate(node.id);
            }}
            onMove={move}
            canEdit={can('catalogo:editar')}
            canDelete={can('catalogo:excluir')}
          />
        )}
      </Card>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar categoria' : 'Nova categoria'}
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
          <div className="space-y-4">
            <Field label="Nome" required>
              <Input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                autoFocus
              />
            </Field>

            <Field label="Categoria pai" hint="Deixe vazio para uma categoria principal">
              <Select
                value={draft.parentId}
                onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
              >
                <option value="">Nenhuma (principal)</option>
                {flat
                  .filter((option) => option.id !== draft.id)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Endereço (slug)" hint="Deixe vazio para gerar a partir do nome">
              <Input
                value={draft.slug}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
              />
            </Field>

            <Field label="Imagem (URL)" hint="Use a biblioteca de mídia para obter o endereço">
              <Input
                value={draft.imageUrl}
                onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })}
              />
            </Field>

            <Switch
              label="Visível na vitrine"
              checked={draft.active}
              onChange={(active) => setDraft({ ...draft, active })}
            />
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function Tree({
  nodes,
  depth,
  onEdit,
  onRemove,
  onMove,
  canEdit,
  canDelete,
}: {
  nodes: CategoryNode[];
  depth: number;
  onEdit: (node: CategoryNode) => void;
  onRemove: (node: CategoryNode) => void;
  onMove: (siblings: CategoryNode[], index: number, delta: number) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    <ul className={depth > 0 ? 'border-ink-200 ml-6 border-l pl-3' : ''}>
      {nodes.map((node, index) => (
        <li key={node.id}>
          <div className="border-ink-100 flex items-center gap-2 border-b py-2">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label={`Mover ${node.name} para cima`}
                disabled={index === 0 || !canEdit}
                onClick={() => onMove(nodes, index, -1)}
                className="text-ink-400 hover:text-ink-700 disabled:opacity-30"
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Mover ${node.name} para baixo`}
                disabled={index === nodes.length - 1 || !canEdit}
                onClick={() => onMove(nodes, index, 1)}
                className="text-ink-400 hover:text-ink-700 disabled:opacity-30"
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
            </div>

            {node.imageUrl ? (
              <img src={node.imageUrl} alt="" className="size-8 rounded-md object-cover" />
            ) : (
              <span className="bg-ink-100 size-8 rounded-md" aria-hidden />
            )}

            <div className="min-w-0 flex-1">
              <p className="text-ink-800 truncate text-sm font-medium">
                {node.name}
                {!node.active ? (
                  <span className="text-ink-400 ml-2 text-xs font-normal">(oculta)</span>
                ) : null}
              </p>
              <p className="text-ink-500 truncate text-xs">
                /{node.slug} · {node.productCount} produto(s)
              </p>
            </div>

            {canEdit ? (
              <button
                type="button"
                aria-label={`Editar ${node.name}`}
                onClick={() => onEdit(node)}
                className="text-ink-500 hover:text-brand-600"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            ) : null}

            {canDelete ? (
              <button
                type="button"
                aria-label={`Excluir ${node.name}`}
                onClick={() => onRemove(node)}
                className="text-ink-500 hover:text-price-600"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>

          {node.children.length > 0 ? (
            <Tree
              nodes={node.children}
              depth={depth + 1}
              onEdit={onEdit}
              onRemove={onRemove}
              onMove={onMove}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function flattenOptions(nodes: CategoryNode[], depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
    ...flattenOptions(node.children, depth + 1),
  ]);
}
