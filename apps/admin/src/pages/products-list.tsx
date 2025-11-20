import { AVAILABILITY_LABELS, formatBRL, SALE_UNIT_LABELS } from '@aurora/types';
import { Badge, Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageOff, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Input, Pagination, Select, Spinner } from '../components/ui';
import { api, type CategoryNode, type ProductListItem } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

export const STATUS_LABELS: Record<ProductListItem['status'], string> = {
  rascunho: 'Rascunho',
  ativo: 'Publicado',
  inativo: 'Inativo',
  arquivado: 'Arquivado',
};

export function ProductsListPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const [selected, setSelected] = useState<string[]>([]);

  const page = Number(params.get('page') ?? 1);
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const needsContent = params.get('needsContent') ?? '';

  const categories = useQuery({ queryKey: ['categorias'], queryFn: api.categories.list });

  const products = useQuery({
    queryKey: ['produtos', { page, search, status, categoryId, needsContent }],
    queryFn: () =>
      api.products.list({
        page,
        perPage: 20,
        search: search || undefined,
        status: status || undefined,
        categoryId: categoryId || undefined,
        needsContent: needsContent || undefined,
      }),
  });

  const bulk = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.products.bulk({ ids: selected, ...body }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['produtos'] });
      toast.success(`${result.updated} produto(s) atualizado(s).`);
      setSelected([]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const flatCategories = useMemo(() => flatten(categories.data ?? []), [categories.data]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Trocar filtro sempre volta para a primeira página.
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  const items = products.data?.items ?? [];
  const allSelected = items.length > 0 && selected.length === items.length;

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo da loja. Produtos sem foto ou categoria não aparecem na vitrine."
        actions={
          can('catalogo:criar') ? (
            <Link to="/produtos/novo">
              <Button icon={<Plus className="size-4" aria-hidden />}>Novo produto</Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Buscar por nome ou código do Futura"
            defaultValue={search}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setParam('search', event.currentTarget.value);
            }}
            onBlur={(event) => setParam('search', event.target.value)}
          />

          <Select value={status} onChange={(event) => setParam('status', event.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>

          <Select
            value={categoryId}
            onChange={(event) => setParam('categoryId', event.target.value)}
          >
            <option value="">Todas as categorias</option>
            {flatCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>

          <Select
            value={needsContent}
            onChange={(event) => setParam('needsContent', event.target.value)}
          >
            <option value="">Completos e pendentes</option>
            <option value="true">Só os que faltam completar</option>
            <option value="false">Só os completos</option>
          </Select>
        </div>
      </Card>

      {selected.length > 0 && can('catalogo:editar') ? (
        <div className="rounded-card bg-brand-50 mb-4 flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="text-brand-700 text-sm font-medium">
            {selected.length} selecionado(s)
          </span>

          <Select
            className="max-w-44"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) bulk.mutate({ status: event.target.value });
              event.target.value = '';
            }}
          >
            <option value="">Alterar status…</option>
            <option value="ativo">Publicar</option>
            <option value="rascunho">Voltar a rascunho</option>
            <option value="inativo">Desativar</option>
          </Select>

          <Select
            className="max-w-56"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) bulk.mutate({ categoryId: event.target.value });
              event.target.value = '';
            }}
          >
            <option value="">Mover para categoria…</option>
            {flatCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const input = window.prompt(
                'Reajuste percentual (ex.: 10 para +10%, -5 para -5%)',
                '',
              );
              const percent = Number(input?.replace(',', '.'));
              if (Number.isFinite(percent) && percent !== 0) {
                bulk.mutate({ priceAdjustPercent: percent });
              }
            }}
          >
            Reajustar preço
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
            Limpar seleção
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {products.isLoading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhum produto encontrado"
            description="Ajuste os filtros ou cadastre o primeiro produto."
          />
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-ink-200 bg-ink-50 text-ink-500 border-b text-left text-xs tracking-wide uppercase">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={allSelected}
                      onChange={(event) =>
                        setSelected(event.target.checked ? items.map((item) => item.id) : [])
                      }
                    />
                  </th>
                  <th className="px-3 py-2.5">Produto</th>
                  <th className="px-3 py-2.5">Categoria</th>
                  <th className="px-3 py-2.5">Preço</th>
                  <th className="px-3 py-2.5">Estoque</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>

              <tbody className="divide-ink-200 divide-y">
                {items.map((product) => (
                  <tr key={product.id} className="hover:bg-ink-50">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${product.name}`}
                        checked={selected.includes(product.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, product.id]
                              : current.filter((id) => id !== product.id),
                          )
                        }
                      />
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="bg-ink-100 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <ImageOff className="text-ink-400 size-4" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0">
                          <Link
                            to={`/produtos/${product.id}`}
                            className="text-ink-800 block truncate font-medium hover:underline"
                          >
                            {product.name}
                          </Link>
                          <p className="text-ink-500 truncate text-xs">
                            {product.skuFutura ? `#${product.skuFutura} · ` : ''}
                            {SALE_UNIT_LABELS[product.unit].priceSuffix.replace('/', 'por ')}
                            {product.variantCount > 0
                              ? ` · ${product.variantCount} variação(ões)`
                              : ''}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="text-ink-600 px-3 py-2.5">{product.category?.name ?? '—'}</td>

                    <td className="px-3 py-2.5">
                      <span className="text-ink-900 font-medium">
                        {formatBRL(product.effectivePrice)}
                      </span>
                      {product.compareAt ? (
                        <span className="text-ink-400 ml-1 text-xs line-through">
                          {formatBRL(product.compareAt)}
                        </span>
                      ) : null}
                    </td>

                    <td className="px-3 py-2.5">
                      <span className="text-ink-600">
                        {AVAILABILITY_LABELS[product.availability]}
                      </span>
                      <span className="text-ink-400 block text-xs">{product.stockQty}</span>
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={product.status === 'ativo' ? 'stock' : 'neutral'}>
                          {STATUS_LABELS[product.status]}
                        </Badge>
                        {product.needsContent ? <Badge tone="warning">A completar</Badge> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {products.data ? (
        <div className="mt-4">
          <Pagination
            page={products.data.page}
            totalPages={products.data.totalPages}
            total={products.data.total}
            onChange={(next) => setParam('page', String(next))}
          />
        </div>
      ) : null}
    </>
  );
}

/** Achata a árvore para o `<select>`, mantendo a hierarquia visível. */
export function flatten(nodes: CategoryNode[], depth = 0): Array<{ id: string; label: string }> {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
    ...flatten(node.children, depth + 1),
  ]);
}
