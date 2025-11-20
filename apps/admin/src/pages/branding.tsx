import { Button, Logo } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/layout';
import { Card, Field, Input, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

const SLOTS = [
  {
    key: 'logoPrincipal',
    label: 'Logo principal',
    hint: 'Usado no topo do site e do painel. Também gera o favicon e os ícones do app.',
    dark: true,
  },
  { key: 'logoRodape', label: 'Logo do rodapé', hint: 'Versão para fundo escuro.', dark: true },
  {
    key: 'logoMono',
    label: 'Logo monocromática',
    hint: 'Uma cor só, para impressos.',
    dark: false,
  },
  {
    key: 'ogImage',
    label: 'Imagem de compartilhamento',
    hint: '1200×630, aparece no WhatsApp e nas redes.',
    dark: false,
  },
] as const;

const COLORS = [
  { key: 'corPrimaria', label: 'Cor primária', hint: 'Header, rodapé e navegação' },
  { key: 'corSecundaria', label: 'Cor de destaque', hint: 'Botões de ação' },
  { key: 'corDestaque', label: 'Cor de preço', hint: 'Preços e promoções' },
] as const;

export function BrandingPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [colors, setColors] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const branding = useQuery({ queryKey: ['branding'], queryFn: api.settings.getBranding });

  useEffect(() => {
    if (branding.data) {
      setColors({
        corPrimaria: branding.data.corPrimaria,
        corSecundaria: branding.data.corSecundaria,
        corDestaque: branding.data.corDestaque,
      });
    }
  }, [branding.data]);

  const upload = useMutation({
    mutationFn: ({ slot, file }: { slot: string; file: File }) =>
      api.settings.uploadBrand(slot, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['branding'] });
      toast.success('Marca atualizada. O site já reflete a mudança.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveColors = useMutation({
    mutationFn: () => api.settings.updateBranding(colors),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['branding'] });
      toast.success('Cores salvas.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (branding.isLoading) return <Spinner />;

  const readOnly = !can('identidade:editar');
  const data = branding.data;

  return (
    <>
      <PageHeader
        title="Identidade visual"
        description="Logo, favicon e cores da loja. Nada aqui exige alterar código ou publicar de novo."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Arquivos da marca">
          <div className="space-y-5">
            {SLOTS.map((slot) => {
              const url = data?.[slot.key] ?? null;

              return (
                <div key={slot.key} className="flex items-start gap-4">
                  <div
                    className={`rounded-card flex size-20 shrink-0 items-center justify-center overflow-hidden p-2 ${
                      slot.dark ? 'bg-brand-600' : 'bg-ink-100'
                    }`}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={slot.label}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : slot.dark ? (
                      <Logo variant="onDark" />
                    ) : (
                      <span className="text-ink-400 text-xs">Sem arquivo</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-ink-800 text-sm font-medium">{slot.label}</p>
                    <p className="text-ink-500 text-xs">{slot.hint}</p>

                    <input
                      ref={(element) => {
                        inputs.current[slot.key] = element;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload.mutate({ slot: slot.key, file });
                        event.target.value = '';
                      }}
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={readOnly || upload.isPending}
                      icon={<Upload className="size-4" />}
                      onClick={() => inputs.current[slot.key]?.click()}
                    >
                      {url ? 'Substituir' : 'Enviar'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {(data?.iconesPwa.length ?? 0) > 0 ? (
            <div className="border-ink-200 mt-6 border-t pt-4">
              <p className="text-ink-800 text-sm font-medium">Ícones do aplicativo</p>
              <p className="text-ink-500 mb-3 text-xs">
                Gerados automaticamente a partir do logo principal.
              </p>
              <ul className="flex flex-wrap items-end gap-3">
                {data!.iconesPwa.map((icon) => (
                  <li key={icon.size} className="text-center">
                    <img
                      src={icon.url}
                      alt={`Ícone ${icon.size}px`}
                      className="border-ink-200 rounded-md border"
                      style={{ width: Math.min(icon.size, 48), height: Math.min(icon.size, 48) }}
                    />
                    <span className="text-ink-500 mt-1 block text-[0.625rem]">{icon.size}px</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <Card
          title="Cores"
          description="Aplicadas na vitrine e no painel."
          actions={
            <Button
              size="sm"
              disabled={readOnly || saveColors.isPending}
              onClick={() => saveColors.mutate()}
            >
              Salvar cores
            </Button>
          }
        >
          <div className="space-y-4">
            {COLORS.map((color) => (
              <Field key={color.key} label={color.label} hint={color.hint}>
                <div className="flex gap-2">
                  <input
                    type="color"
                    aria-label={color.label}
                    value={colors[color.key] ?? '#000000'}
                    onChange={(event) =>
                      setColors((current) => ({ ...current, [color.key]: event.target.value }))
                    }
                    className="rounded-button border-ink-300 h-10 w-14 cursor-pointer border"
                  />
                  <Input
                    value={colors[color.key] ?? ''}
                    onChange={(event) =>
                      setColors((current) => ({ ...current, [color.key]: event.target.value }))
                    }
                    placeholder="#1B3A8C"
                  />
                </div>
              </Field>
            ))}
          </div>

          <div className="rounded-card border-ink-200 mt-6 overflow-hidden border">
            <p className="border-ink-200 bg-ink-50 text-ink-500 border-b px-3 py-2 text-xs font-medium">
              Prévia
            </p>
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ backgroundColor: colors.corPrimaria }}
            >
              <span className="text-sm font-bold text-white">Armarinho Aurora</span>
              <span
                className="rounded-button px-3 py-1 text-xs font-bold"
                style={{ backgroundColor: colors.corSecundaria, color: '#0f172a' }}
              >
                Adicionar
              </span>
            </div>
            <p className="px-4 py-3">
              <span className="text-lg font-bold" style={{ color: colors.corDestaque }}>
                R$ 15,90
              </span>
              <span className="text-ink-500 ml-1 text-sm">/metro</span>
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
