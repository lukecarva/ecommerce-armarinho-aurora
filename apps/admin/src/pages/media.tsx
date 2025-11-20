import { Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Field, Input, Modal, Pagination, Spinner } from '../components/ui';
import { api, type MediaAsset } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatBytes, formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';

export function MediaPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<MediaAsset | null>(null);
  const [alt, setAlt] = useState('');

  const list = useQuery({
    queryKey: ['media', { page, search }],
    queryFn: () => api.media.list({ page, perPage: 30, search: search || undefined }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['media'] });

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      const uploaded: MediaAsset[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(await api.media.upload(file));
      }
      return uploaded;
    },
    onSuccess: async (uploaded) => {
      await invalidate();
      toast.success(`${uploaded.length} imagem(ns) enviada(s).`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveAlt = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      api.media.updateAlt(id, value || null),
    onSuccess: async () => {
      await invalidate();
      toast.success('Texto alternativo salvo.');
      setDetail(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: api.media.remove,
    onSuccess: async () => {
      await invalidate();
      toast.success('Imagem removida.');
      setDetail(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Mídia"
        description="Todas as imagens da loja. Cada envio gera automaticamente as versões responsivas."
        actions={
          can('midia:criar') ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files?.length) upload.mutate(event.target.files);
                  event.target.value = '';
                }}
              />
              <Button
                icon={<Upload className="size-4" />}
                onClick={() => fileInput.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? 'Enviando…' : 'Enviar imagens'}
              </Button>
            </>
          ) : null
        }
      />

      <Card className="mb-4">
        <Input
          placeholder="Buscar por texto alternativo ou nome do arquivo"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="max-w-md"
        />
      </Card>

      <Card>
        {list.isLoading ? (
          <Spinner />
        ) : (list.data?.items ?? []).length === 0 ? (
          <EmptyState
            title="Biblioteca vazia"
            description="Envie as fotos dos produtos para começar a montar o catálogo."
          />
        ) : (
          <>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              {(list.data?.items ?? []).map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDetail(asset);
                      setAlt(asset.alt ?? '');
                    }}
                    className="rounded-card border-ink-200 hover:border-brand-500 block w-full overflow-hidden border"
                  >
                    <span className="bg-ink-100 block aspect-square">
                      <img
                        src={asset.url}
                        alt={asset.alt ?? ''}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-4">
              <Pagination
                page={list.data!.page}
                totalPages={list.data!.totalPages}
                total={list.data!.total}
                onChange={setPage}
              />
            </div>
          </>
        )}
      </Card>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title="Detalhes da imagem"
        footer={
          detail ? (
            <>
              {can('midia:excluir') ? (
                <Button
                  variant="danger"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => {
                    if (window.confirm('Remover esta imagem definitivamente?')) {
                      remove.mutate(detail.id);
                    }
                  }}
                >
                  Excluir
                </Button>
              ) : null}
              <Button
                onClick={() => saveAlt.mutate({ id: detail.id, value: alt })}
                disabled={saveAlt.isPending || !can('midia:editar')}
              >
                Salvar
              </Button>
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="space-y-4">
            <img
              src={detail.url}
              alt={detail.alt ?? ''}
              className="rounded-card max-h-64 w-full object-contain"
            />

            <Field
              label="Texto alternativo"
              hint="Descreve a imagem para leitores de tela e para o Google"
            >
              <Input value={alt} onChange={(event) => setAlt(event.target.value)} />
            </Field>

            <dl className="text-ink-600 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-ink-400 text-xs uppercase">Dimensões</dt>
                <dd>
                  {detail.width} × {detail.height}
                </dd>
              </div>
              <div>
                <dt className="text-ink-400 text-xs uppercase">Tamanho</dt>
                <dd>{formatBytes(detail.size)}</dd>
              </div>
              <div>
                <dt className="text-ink-400 text-xs uppercase">Pasta</dt>
                <dd>{detail.folder}</dd>
              </div>
              <div>
                <dt className="text-ink-400 text-xs uppercase">Enviada em</dt>
                <dd>{formatDateTime(detail.createdAt)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
