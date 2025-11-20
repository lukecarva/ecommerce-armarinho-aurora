import { Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, type MediaAsset } from '../lib/api';
import { useToast } from '../lib/toast';
import { EmptyState, Input, Modal, Pagination, Spinner } from './ui';

/**
 * Seletor da biblioteca de mídia.
 *
 * Permite reaproveitar uma imagem já enviada e também subir novas sem sair da
 * tela do produto — o fluxo de cadastro em série depende disso para não virar
 * um vaivém entre telas.
 */
export function MediaPicker({
  open,
  onClose,
  onSelect,
  folder = 'produtos',
  multiple = true,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (assets: MediaAsset[]) => void;
  folder?: string;
  multiple?: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MediaAsset[]>([]);

  const list = useQuery({
    queryKey: ['media', { page, search }],
    queryFn: () => api.media.list({ page, perPage: 24, search: search || undefined }),
    enabled: open,
  });

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      const uploaded: MediaAsset[] = [];
      // Sequencial de propósito: o processamento é pesado em CPU e paralelizar
      // no cliente só serviria para estourar o servidor de imagem.
      for (const file of Array.from(files)) {
        uploaded.push(await api.media.upload(file, folder));
      }
      return uploaded;
    },
    onSuccess: async (uploaded) => {
      await queryClient.invalidateQueries({ queryKey: ['media'] });
      toast.success(`${uploaded.length} imagem(ns) enviada(s).`);
      setSelected((current) => (multiple ? [...current, ...uploaded] : uploaded.slice(-1)));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggle(asset: MediaAsset) {
    setSelected((current) => {
      const exists = current.some((item) => item.id === asset.id);
      if (exists) return current.filter((item) => item.id !== asset.id);
      return multiple ? [...current, asset] : [asset];
    });
  }

  function confirm() {
    onSelect(selected);
    setSelected([]);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Biblioteca de mídia"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={selected.length === 0}>
            Usar {selected.length > 0 ? `(${selected.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nome do arquivo ou texto alternativo"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) upload.mutate(event.target.files);
            event.target.value = '';
          }}
        />

        <Button
          variant="secondary"
          onClick={() => fileInput.current?.click()}
          disabled={upload.isPending}
          icon={<Upload className="size-4" aria-hidden />}
        >
          {upload.isPending ? 'Enviando…' : 'Enviar imagens'}
        </Button>
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : list.data && list.data.items.length > 0 ? (
        <>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {list.data.items.map((asset) => {
              const isSelected = selected.some((item) => item.id === asset.id);
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => toggle(asset)}
                    aria-pressed={isSelected}
                    className={`rounded-card block w-full overflow-hidden border-2 transition-colors ${
                      isSelected ? 'border-brand-600' : 'hover:border-ink-300 border-transparent'
                    }`}
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
              );
            })}
          </ul>

          <div className="mt-4">
            <Pagination
              page={list.data.page}
              totalPages={list.data.totalPages}
              total={list.data.total}
              onChange={setPage}
            />
          </div>
        </>
      ) : (
        <EmptyState
          title="Nenhuma imagem ainda"
          description="Envie as fotos dos produtos para começar."
        />
      )}
    </Modal>
  );
}
