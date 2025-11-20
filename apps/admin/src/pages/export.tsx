import { PRODUCT_STATUSES } from '@aurora/types';
import { Badge, Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Field, Select, Spinner, Switch } from '../components/ui';
import { api, type ExportFormat } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatBytes, formatDate, formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';
import { flatten, STATUS_LABELS } from './products-list';

const FORMATOS: Array<{ valor: ExportFormat; rotulo: string; ajuda: string }> = [
  {
    valor: 'csv',
    rotulo: 'CSV',
    ajuda: 'Abre no Excel e no Google Sheets. É o formato que o importador aceita de volta.',
  },
  {
    valor: 'xlsx',
    rotulo: 'Excel com miniaturas',
    ajuda: 'Planilha com a foto embutida em cada linha. Mais pesada de gerar.',
  },
  {
    valor: 'zip',
    rotulo: 'ZIP com as fotos',
    ajuda: 'Planilha + todas as imagens em resolução original. É o backup completo do catálogo.',
  },
];

export function ExportPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [formato, setFormato] = useState<ExportFormat>('csv');
  const [filtros, setFiltros] = useState<{
    categoryId?: string;
    status?: string;
    needsContent?: boolean;
    comFoto?: boolean;
  }>({});

  const categorias = useQuery({ queryKey: ['categorias'], queryFn: api.categories.list });
  const lista = useQuery({
    queryKey: ['exportacoes'],
    queryFn: () => api.exportar.listar({ perPage: 10 }),
  });

  /**
   * Enquanto houver exportação em andamento, consultamos de novo.
   * Um ZIP com muitas fotos leva minutos e o painel precisa acompanhar.
   */
  const processando = useMemo(
    () => (lista.data?.items ?? []).some((run) => run.status === 'processando'),
    [lista.data],
  );

  useEffect(() => {
    if (!processando) return;
    const intervalo = setInterval(() => void lista.refetch(), 3000);
    return () => clearInterval(intervalo);
  }, [processando, lista]);

  const solicitar = useMutation({
    mutationFn: () =>
      api.exportar.solicitar({
        format: formato,
        filtros: {
          ...(filtros.categoryId ? { categoryId: filtros.categoryId } : {}),
          ...(filtros.status ? { status: filtros.status } : {}),
          ...(filtros.needsContent !== undefined ? { needsContent: filtros.needsContent } : {}),
          ...(filtros.comFoto !== undefined ? { comFoto: filtros.comFoto } : {}),
        },
        colunas: [],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exportacoes'] });
      toast.success('Exportação solicitada. O arquivo aparece aqui quando ficar pronto.');
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const baixar = useMutation({
    mutationFn: ({ id, nome }: { id: string; nome: string }) => api.exportar.baixar(id, nome),
    onError: (erro: Error) => toast.error(erro.message),
  });

  return (
    <>
      <PageHeader
        title="Exportar catálogo"
        description="Sai no mesmo formato que o importador aceita de volta — dá para editar no Excel e reimportar."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Nova exportação" className="lg:col-span-1">
          <div className="space-y-4">
            <Field label="Formato" hint={FORMATOS.find((f) => f.valor === formato)?.ajuda}>
              <Select
                value={formato}
                onChange={(evento) => setFormato(evento.target.value as ExportFormat)}
              >
                {FORMATOS.map((item) => (
                  <option key={item.valor} value={item.valor}>
                    {item.rotulo}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Categoria">
              <Select
                value={filtros.categoryId ?? ''}
                onChange={(evento) =>
                  setFiltros((atual) => ({
                    ...atual,
                    categoryId: evento.target.value || undefined,
                  }))
                }
              >
                <option value="">Todas</option>
                {flatten(categorias.data ?? []).map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Status">
              <Select
                value={filtros.status ?? ''}
                onChange={(evento) =>
                  setFiltros((atual) => ({ ...atual, status: evento.target.value || undefined }))
                }
              >
                <option value="">Todos, menos arquivados</option>
                {PRODUCT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>

            <Switch
              label="Só os que faltam completar"
              hint="Produtos sem foto ou sem categoria"
              checked={filtros.needsContent === true}
              onChange={(marcado) =>
                setFiltros((atual) => ({ ...atual, needsContent: marcado || undefined }))
              }
            />

            <Switch
              label="Só os que já têm foto"
              checked={filtros.comFoto === true}
              onChange={(marcado) =>
                setFiltros((atual) => ({ ...atual, comFoto: marcado || undefined }))
              }
            />

            <Button
              full
              disabled={!can('exportacao:criar') || solicitar.isPending}
              icon={<FileSpreadsheet className="size-4" />}
              onClick={() => solicitar.mutate()}
            >
              {solicitar.isPending ? 'Solicitando…' : 'Gerar exportação'}
            </Button>
          </div>
        </Card>

        <Card title="Arquivos gerados" className="lg:col-span-2">
          {lista.isLoading ? (
            <Spinner />
          ) : (lista.data?.items ?? []).length === 0 ? (
            <EmptyState
              title="Nenhuma exportação ainda"
              description="Gere um arquivo para editar o catálogo em massa ou guardar como backup."
            />
          ) : (
            <ul className="divide-ink-200 divide-y">
              {(lista.data?.items ?? []).map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-800 flex flex-wrap items-center gap-2 font-medium">
                      Catálogo · {run.format.toUpperCase()}
                      <Badge
                        tone={
                          run.status === 'concluido'
                            ? 'stock'
                            : run.status === 'processando'
                              ? 'brand'
                              : 'neutral'
                        }
                      >
                        {run.status === 'processando' ? 'gerando…' : run.status}
                      </Badge>
                    </p>
                    <p className="text-ink-500 text-xs">
                      {formatDateTime(run.createdAt)}
                      {run.actorName ? ` · ${run.actorName}` : ''}
                      {run.status === 'concluido'
                        ? ` · ${run.rowsTotal} produtos · ${formatBytes(run.fileSize ?? 0)}`
                        : ''}
                      {run.expiresAt && run.status === 'concluido'
                        ? ` · disponível até ${formatDate(run.expiresAt)}`
                        : ''}
                    </p>
                    {run.error ? <p className="text-price-600 text-xs">{run.error}</p> : null}
                  </div>

                  {run.status === 'concluido' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Download className="size-4" />}
                      disabled={baixar.isPending}
                      onClick={() =>
                        baixar.mutate({
                          id: run.id,
                          nome: `catalogo-${run.createdAt.slice(0, 10)}.${run.format}`,
                        })
                      }
                    >
                      Baixar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
