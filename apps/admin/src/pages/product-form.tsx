import {
  PRODUCT_STATUSES,
  SALE_UNITS,
  SALE_UNIT_LABELS,
  formatBRL,
  formatQuantity,
  resolvePrice,
  type SaleUnit,
} from '@aurora/types';
import { Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { MediaPicker } from '../components/media-picker';
import { StockPanel } from '../components/stock-panel';
import { PageHeader } from '../components/layout';
import { Card, Field, Input, Legend, Select, Spinner, Switch, Textarea } from '../components/ui';
import { ApiError, api, type ProductDetail } from '../lib/api';
import { useAuth } from '../lib/auth';
import { centsToPriceInput, priceInputToCents, toDateInput } from '../lib/format';
import { useToast } from '../lib/toast';
import { flatten, STATUS_LABELS } from './products-list';

interface ImageDraft {
  mediaId: string;
  url: string;
  alt: string | null;
}

interface VariantDraft {
  id?: string;
  name: string;
  skuFutura: string;
  color: string;
  colorHex: string;
  size: string;
  priceDelta: number;
}

interface TierDraft {
  groupId: string | null;
  minQty: number;
  price: number;
}

interface FormState {
  name: string;
  slug: string;
  skuFutura: string;
  shortDesc: string;
  description: string;
  categoryId: string;
  unit: SaleUnit;
  saleStep: number;
  minQty: number;
  packSize: string;
  price: number;
  promoPrice: number | null;
  promoStartsAt: string;
  promoEndsAt: string;
  status: ProductDetail['status'];
  attributes: Array<{ key: string; value: string }>;
  images: ImageDraft[];
  variants: VariantDraft[];
  priceTiers: TierDraft[];
  collectionIds: string[];
  stockQty: number;
  lowStockThreshold: number;
  seoTitle: string;
  seoDescription: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    slug: '',
    skuFutura: '',
    shortDesc: '',
    description: '',
    categoryId: '',
    unit: 'unidade',
    saleStep: 1,
    minQty: 1,
    packSize: '',
    price: 0,
    promoPrice: null,
    promoStartsAt: '',
    promoEndsAt: '',
    status: 'rascunho',
    attributes: [],
    images: [],
    variants: [],
    priceTiers: [],
    collectionIds: [],
    stockQty: 0,
    lowStockThreshold: 3,
    seoTitle: '',
    seoDescription: '',
  };
}

function toForm(product: ProductDetail): FormState {
  return {
    name: product.name,
    slug: product.slug,
    skuFutura: product.skuFutura ?? '',
    shortDesc: product.shortDesc ?? '',
    description: product.description ?? '',
    categoryId: product.categoryId ?? '',
    unit: product.unit,
    saleStep: product.saleStep,
    minQty: product.minQty,
    packSize: product.packSize ? String(product.packSize) : '',
    price: product.price,
    promoPrice: product.promoPrice,
    promoStartsAt: toDateInput(product.promoStartsAt),
    promoEndsAt: toDateInput(product.promoEndsAt),
    status: product.status,
    attributes: Object.entries(product.attributes ?? {}).map(([key, value]) => ({ key, value })),
    images: product.images.map((image) => ({
      mediaId: image.mediaId,
      url: image.url,
      alt: image.alt,
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      skuFutura: variant.skuFutura ?? '',
      color: variant.color ?? '',
      colorHex: variant.colorHex ?? '',
      size: variant.size ?? '',
      priceDelta: variant.priceDelta,
    })),
    priceTiers: product.priceTiers,
    collectionIds: product.collectionIds,
    stockQty: product.stock.qty,
    lowStockThreshold: product.stock.lowStockThreshold,
    seoTitle: product.seo?.title ?? '',
    seoDescription: product.seo?.description ?? '',
  };
}

export function ProductFormPage() {
  const { id } = useParams();
  const isNew = !id || id === 'novo';
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const product = useQuery({
    queryKey: ['produto', id],
    queryFn: () => api.products.get(id!),
    enabled: !isNew,
  });

  const categories = useQuery({ queryKey: ['categorias'], queryFn: api.categories.list });
  const collections = useQuery({ queryKey: ['colecoes'], queryFn: api.collections.list });
  const groups = useQuery({ queryKey: ['grupos'], queryFn: api.customerGroups });

  useEffect(() => {
    if (product.data) setForm(toForm(product.data));
  }, [product.data]);

  const save = useMutation({
    mutationFn: (payload: unknown) =>
      isNew ? api.products.create(payload) : api.products.update(id!, payload),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['produtos'] });
      toast.success('Produto salvo.');
      setErrors({});
      if (isNew) navigate(`/produtos/${saved.id}`, { replace: true });
    },
    onError: (error: Error) => {
      if (error instanceof ApiError) {
        setErrors(Object.fromEntries(error.errors.map((item) => [item.field, item.message])));
      }
      toast.error(error.message);
    },
  });

  const patch = (changes: Partial<FormState>) => setForm((current) => ({ ...current, ...changes }));

  /** Prévia do preço com as mesmas regras da vitrine. */
  const preview = useMemo(
    () =>
      resolvePrice(
        {
          price: form.price,
          promoPrice: form.promoPrice,
          promoStartsAt: form.promoStartsAt || null,
          promoEndsAt: form.promoEndsAt || null,
          tiers: form.priceTiers,
        },
        { quantity: form.minQty },
      ),
    [
      form.price,
      form.promoPrice,
      form.promoStartsAt,
      form.promoEndsAt,
      form.priceTiers,
      form.minQty,
    ],
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    save.mutate({
      name: form.name,
      slug: form.slug || undefined,
      skuFutura: form.skuFutura || null,
      shortDesc: form.shortDesc || null,
      description: form.description || null,
      categoryId: form.categoryId || null,
      unit: form.unit,
      saleStep: form.saleStep,
      minQty: form.minQty,
      packSize: form.packSize ? Number(form.packSize) : null,
      price: form.price,
      promoPrice: form.promoPrice,
      promoStartsAt: form.promoStartsAt || null,
      promoEndsAt: form.promoEndsAt || null,
      attributes: Object.fromEntries(
        form.attributes.filter((item) => item.key.trim()).map((item) => [item.key, item.value]),
      ),
      status: form.status,
      seo:
        form.seoTitle || form.seoDescription
          ? { title: form.seoTitle || null, description: form.seoDescription || null }
          : null,
      images: form.images.map((image) => ({ mediaId: image.mediaId, alt: image.alt })),
      variants: form.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        skuFutura: variant.skuFutura || null,
        color: variant.color || null,
        colorHex: variant.colorHex || null,
        size: variant.size || null,
        priceDelta: variant.priceDelta,
      })),
      priceTiers: form.priceTiers,
      collectionIds: form.collectionIds,
      stock: {
        qty: form.stockQty,
        lowStockThreshold: form.lowStockThreshold,
      },
    });
  }

  function moveImage(from: number, to: number) {
    setForm((current) => {
      const images = [...current.images];
      const [moved] = images.splice(from, 1);
      if (moved) images.splice(to, 0, moved);
      return { ...current, images };
    });
  }

  if (!isNew && product.isLoading) return <Spinner />;

  const readOnly = !can(isNew ? 'catalogo:criar' : 'catalogo:editar');
  const unitLabel = SALE_UNIT_LABELS[form.unit];

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title={isNew ? 'Novo produto' : form.name || 'Produto'}
        description={
          isNew
            ? 'Cadastre o produto. Ele só aparece na vitrine com foto e categoria.'
            : `Código ${form.skuFutura || '—'} · /produto/${form.slug}`
        }
        actions={
          <>
            <Link to="/produtos">
              <Button variant="outline" type="button" icon={<ArrowLeft className="size-4" />}>
                Voltar
              </Button>
            </Link>
            <Button type="submit" disabled={save.isPending || readOnly}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Dados do produto">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" required error={errors.name} className="sm:col-span-2">
                <Input
                  value={form.name}
                  onChange={(event) => patch({ name: event.target.value })}
                  placeholder="Tricoline Estampado 100% Algodão"
                  required
                />
              </Field>

              <Field
                label="Código no Futura"
                hint="Chave usada na importação da planilha do ERP"
                error={errors.skuFutura}
              >
                <Input
                  value={form.skuFutura}
                  onChange={(event) => patch({ skuFutura: event.target.value })}
                  placeholder="10001"
                />
              </Field>

              <Field label="Categoria" error={errors.categoryId}>
                <Select
                  value={form.categoryId}
                  onChange={(event) => patch({ categoryId: event.target.value })}
                >
                  <option value="">Sem categoria</option>
                  {flatten(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Endereço na vitrine (slug)"
                hint="Deixe vazio para gerar a partir do nome"
                className="sm:col-span-2"
                error={errors.slug}
              >
                <Input
                  value={form.slug}
                  onChange={(event) => patch({ slug: event.target.value })}
                  placeholder="tricoline-estampado-100-algodao"
                />
              </Field>

              <Field label="Resumo" hint="Uma linha, exibida no card" className="sm:col-span-2">
                <Input
                  value={form.shortDesc}
                  onChange={(event) => patch({ shortDesc: event.target.value })}
                  placeholder="1,50m largura · 100% algodão"
                />
              </Field>

              <Field label="Descrição" className="sm:col-span-2">
                <Textarea
                  value={form.description}
                  onChange={(event) => patch({ description: event.target.value })}
                  rows={5}
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Como é vendido"
            description="Define o passo do seletor de quantidade e o sufixo do preço na vitrine."
          >
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Unidade" required>
                <Select
                  value={form.unit}
                  onChange={(event) => {
                    const unit = event.target.value as SaleUnit;
                    const step = SALE_UNIT_LABELS[unit].defaultStep;
                    patch({ unit, saleStep: step, minQty: Math.max(step, form.minQty) });
                  }}
                >
                  {SALE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {SALE_UNIT_LABELS[unit].singular}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Passo de venda" hint="0,5 = de meio em meio" error={errors.saleStep}>
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={form.saleStep}
                  onChange={(event) => patch({ saleStep: Number(event.target.value) })}
                />
              </Field>

              <Field label="Quantidade mínima" error={errors.minQty}>
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={form.minQty}
                  onChange={(event) => patch({ minQty: Number(event.target.value) })}
                />
              </Field>

              <Field label="Itens por pacote" hint="Só para venda em pacote">
                <Input
                  type="number"
                  min="1"
                  value={form.packSize}
                  onChange={(event) => patch({ packSize: event.target.value })}
                  placeholder="10"
                />
              </Field>
            </div>

            <p className="rounded-button bg-ink-50 text-ink-600 mt-3 px-3 py-2 text-sm">
              Na vitrine: <strong>{formatBRL(preview.unitPrice)}</strong>
              {unitLabel.priceSuffix} · mínimo de {formatQuantity(form.minQty, form.unit)}
            </p>
          </Card>

          <Card
            title="Imagens"
            description="A primeira imagem é a capa. Arraste para reordenar."
            actions={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPickerOpen(true)}
              >
                Adicionar imagens
              </Button>
            }
          >
            {form.images.length === 0 ? (
              <p className="text-ink-500 text-sm">
                Sem imagem o produto não aparece na vitrine, mesmo publicado.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {form.images.map((image, index) => (
                  <li
                    key={image.mediaId}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null && dragIndex !== index) moveImage(dragIndex, index);
                      setDragIndex(null);
                    }}
                    className="group rounded-card border-ink-200 relative overflow-hidden border"
                  >
                    <img
                      src={image.url}
                      alt={image.alt ?? ''}
                      className="aspect-square w-full object-cover"
                    />

                    {index === 0 ? (
                      <span className="rounded-pill bg-brand-600 absolute top-1 left-1 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white">
                        Capa
                      </span>
                    ) : null}

                    <span className="absolute top-1 right-1 flex gap-1">
                      <span
                        className="text-ink-500 flex size-6 items-center justify-center rounded-md bg-white/90"
                        aria-hidden
                      >
                        <GripVertical className="size-3.5" />
                      </span>
                      <button
                        type="button"
                        aria-label={`Remover imagem ${index + 1}`}
                        onClick={() => patch({ images: form.images.filter((_, i) => i !== index) })}
                        className="text-price-600 flex size-6 items-center justify-center rounded-md bg-white/90"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </span>

                    <div className="flex gap-1 p-1">
                      <button
                        type="button"
                        aria-label="Mover para a esquerda"
                        disabled={index === 0}
                        onClick={() => moveImage(index, index - 1)}
                        className="bg-ink-100 flex-1 rounded py-0.5 text-xs disabled:opacity-40"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        aria-label="Mover para a direita"
                        disabled={index === form.images.length - 1}
                        onClick={() => moveImage(index, index + 1)}
                        className="bg-ink-100 flex-1 rounded py-0.5 text-xs disabled:opacity-40"
                      >
                        →
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Variações"
            description="Cores e tamanhos com código próprio no ERP."
            actions={
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() =>
                  patch({
                    variants: [
                      ...form.variants,
                      { name: '', skuFutura: '', color: '', colorHex: '', size: '', priceDelta: 0 },
                    ],
                  })
                }
              >
                Adicionar
              </Button>
            }
          >
            {form.variants.length === 0 ? (
              <p className="text-ink-500 text-sm">Produto sem variações.</p>
            ) : (
              <ul className="space-y-3">
                {form.variants.map((variant, index) => (
                  <li
                    key={variant.id ?? index}
                    className="rounded-card bg-ink-50 grid gap-3 p-3 sm:grid-cols-5"
                  >
                    <Field label="Nome">
                      <Input
                        value={variant.name}
                        onChange={(event) =>
                          updateVariant(setForm, index, { name: event.target.value })
                        }
                        placeholder="Azul"
                      />
                    </Field>
                    <Field label="Código Futura">
                      <Input
                        value={variant.skuFutura}
                        onChange={(event) =>
                          updateVariant(setForm, index, { skuFutura: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Cor (hex)">
                      <Input
                        value={variant.colorHex}
                        onChange={(event) =>
                          updateVariant(setForm, index, { colorHex: event.target.value })
                        }
                        placeholder="#1B3A8C"
                      />
                    </Field>
                    <Field label="Diferença de preço" hint="Pode ser negativa">
                      <Input
                        value={centsToPriceInput(variant.priceDelta)}
                        onChange={(event) =>
                          updateVariant(setForm, index, {
                            priceDelta: priceInputToCents(event.target.value),
                          })
                        }
                      />
                    </Field>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          patch({ variants: form.variants.filter((_, i) => i !== index) })
                        }
                      >
                        Remover
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="SEO">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Título" hint="Até 70 caracteres">
                <Input
                  value={form.seoTitle}
                  maxLength={70}
                  onChange={(event) => patch({ seoTitle: event.target.value })}
                />
              </Field>
              <Field label="Descrição" hint="Até 180 caracteres">
                <Input
                  value={form.seoDescription}
                  maxLength={180}
                  onChange={(event) => patch({ seoDescription: event.target.value })}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Publicação">
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(event) =>
                  patch({ status: event.target.value as ProductDetail['status'] })
                }
              >
                {PRODUCT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>

            {form.images.length === 0 || !form.categoryId ? (
              <p className="rounded-button bg-accent-50 text-accent-700 mt-3 px-3 py-2 text-xs">
                Faltando {form.images.length === 0 ? 'foto' : ''}
                {form.images.length === 0 && !form.categoryId ? ' e ' : ''}
                {!form.categoryId ? 'categoria' : ''} — o produto fica fora da vitrine até
                completar.
              </p>
            ) : null}
          </Card>

          <Card title="Preço">
            <div className="space-y-4">
              <Field label="Preço de tabela" required error={errors.price}>
                <Input
                  inputMode="decimal"
                  value={centsToPriceInput(form.price)}
                  onChange={(event) => patch({ price: priceInputToCents(event.target.value) })}
                  placeholder="15,90"
                />
              </Field>

              <Field label="Preço promocional" error={errors.promoPrice}>
                <Input
                  inputMode="decimal"
                  value={centsToPriceInput(form.promoPrice)}
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    patch({ promoPrice: value ? priceInputToCents(value) : null });
                  }}
                  placeholder="Sem promoção"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Começa em">
                  <Input
                    type="date"
                    value={form.promoStartsAt}
                    onChange={(event) => patch({ promoStartsAt: event.target.value })}
                  />
                </Field>
                <Field label="Termina em" error={errors.promoEndsAt}>
                  <Input
                    type="date"
                    value={form.promoEndsAt}
                    onChange={(event) => patch({ promoEndsAt: event.target.value })}
                  />
                </Field>
              </div>
            </div>

            <Legend>Faixas por quantidade</Legend>
            <p className="text-ink-500 -mt-2 mb-3 text-xs">
              Ex.: acima de 10 metros, R$ 13,90. Faixas de grupo só valem quando o atacado é ligado
              — na v1 elas não aparecem na vitrine.
            </p>

            {form.priceTiers.map((tier, index) => (
              <div key={index} className="mb-2 grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={tier.minQty}
                  aria-label="Quantidade mínima"
                  onChange={(event) =>
                    updateTier(setForm, index, { minQty: Number(event.target.value) })
                  }
                />
                <Input
                  inputMode="decimal"
                  aria-label="Preço da faixa"
                  value={centsToPriceInput(tier.price)}
                  onChange={(event) =>
                    updateTier(setForm, index, { price: priceInputToCents(event.target.value) })
                  }
                />
                <div className="flex gap-1">
                  <Select
                    aria-label="Grupo"
                    value={tier.groupId ?? ''}
                    onChange={(event) =>
                      updateTier(setForm, index, { groupId: event.target.value || null })
                    }
                  >
                    <option value="">Todos</option>
                    {(groups.data ?? [])
                      .filter((group) => !group.isDefault)
                      .map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                  </Select>
                  <button
                    type="button"
                    aria-label="Remover faixa"
                    onClick={() =>
                      patch({ priceTiers: form.priceTiers.filter((_, i) => i !== index) })
                    }
                    className="text-price-600 shrink-0"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  priceTiers: [
                    ...form.priceTiers,
                    { groupId: null, minQty: 10, price: form.price },
                  ],
                })
              }
            >
              Adicionar faixa
            </Button>
          </Card>

          {isNew ? (
            <Card title="Estoque">
              <p className="text-ink-500 text-sm">
                O estoque é lançado depois de salvar, com motivo e histórico.
              </p>
            </Card>
          ) : (
            <StockPanel productId={id!} unit={form.unit} />
          )}

          <Card title="Coleções">
            {(collections.data ?? []).length === 0 ? (
              <p className="text-ink-500 text-sm">Nenhuma coleção cadastrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {(collections.data ?? []).map((collection) => (
                  <Switch
                    key={collection.id}
                    label={collection.name}
                    checked={form.collectionIds.includes(collection.id)}
                    onChange={(checked) =>
                      patch({
                        collectionIds: checked
                          ? [...form.collectionIds, collection.id]
                          : form.collectionIds.filter((item) => item !== collection.id),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Atributos" description="Largura, composição, gramatura…">
            {form.attributes.map((attribute, index) => (
              <div key={index} className="mb-2 flex gap-2">
                <Input
                  aria-label="Nome do atributo"
                  value={attribute.key}
                  onChange={(event) => updateAttribute(setForm, index, { key: event.target.value })}
                  placeholder="largura"
                />
                <Input
                  aria-label="Valor do atributo"
                  value={attribute.value}
                  onChange={(event) =>
                    updateAttribute(setForm, index, { value: event.target.value })
                  }
                  placeholder="1,50m"
                />
                <button
                  type="button"
                  aria-label="Remover atributo"
                  onClick={() =>
                    patch({ attributes: form.attributes.filter((_, i) => i !== index) })
                  }
                  className="text-price-600 shrink-0"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch({ attributes: [...form.attributes, { key: '', value: '' }] })}
            >
              Adicionar atributo
            </Button>
          </Card>
        </div>
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(assets) =>
          patch({
            images: [
              ...form.images,
              ...assets
                .filter((asset) => !form.images.some((image) => image.mediaId === asset.id))
                .map((asset) => ({ mediaId: asset.id, url: asset.url, alt: asset.alt })),
            ],
          })
        }
      />
    </form>
  );
}

type Setter = React.Dispatch<React.SetStateAction<FormState>>;

function updateVariant(setForm: Setter, index: number, changes: Partial<VariantDraft>) {
  setForm((current) => {
    const variants = [...current.variants];
    const variant = variants[index];
    if (variant) variants[index] = { ...variant, ...changes };
    return { ...current, variants };
  });
}

function updateTier(setForm: Setter, index: number, changes: Partial<TierDraft>) {
  setForm((current) => {
    const priceTiers = [...current.priceTiers];
    const tier = priceTiers[index];
    if (tier) priceTiers[index] = { ...tier, ...changes };
    return { ...current, priceTiers };
  });
}

function updateAttribute(
  setForm: Setter,
  index: number,
  changes: Partial<{ key: string; value: string }>,
) {
  setForm((current) => {
    const attributes = [...current.attributes];
    const attribute = attributes[index];
    if (attribute) attributes[index] = { ...attribute, ...changes };
    return { ...current, attributes };
  });
}
