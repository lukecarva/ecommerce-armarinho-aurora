import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ImageOff, Package, PackageCheck, TrendingDown } from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/layout';
import { Card, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export function DashboardPage() {
  const { user } = useAuth();

  const ativos = useQuery({
    queryKey: ['produtos', 'ativos'],
    queryFn: () => api.products.list({ status: 'ativo', perPage: 1 }),
  });

  const aCompletar = useQuery({
    queryKey: ['produtos', 'a-completar'],
    queryFn: () => api.products.list({ needsContent: true, perPage: 5 }),
  });

  const ruptura = useQuery({
    queryKey: ['estoque-alertas'],
    queryFn: () => api.estoque.alertas({ perPage: 5 }),
  });

  const rascunhos = useQuery({
    queryKey: ['produtos', 'rascunho'],
    queryFn: () => api.products.list({ status: 'rascunho', perPage: 1 }),
  });

  const carregando = ativos.isLoading || aCompletar.isLoading || rascunhos.isLoading;

  return (
    <>
      <PageHeader
        title={`Olá, ${user?.name.split(' ')[0] ?? ''}!`}
        description="Panorama do catálogo. Pedidos e relatórios chegam nas próximas sprints."
      />

      {carregando ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              icon={PackageCheck}
              label="Produtos publicados"
              value={ativos.data?.total ?? 0}
              tone="stock"
            />
            <Metric
              icon={Package}
              label="Rascunhos"
              value={rascunhos.data?.total ?? 0}
              tone="brand"
            />
            <Metric
              icon={ImageOff}
              label="A completar"
              value={aCompletar.data?.total ?? 0}
              tone="accent"
              hint="Sem foto ou sem categoria"
            />
            <Metric
              icon={TrendingDown}
              label="Estoque baixo"
              value={ruptura.data?.total ?? 0}
              tone={(ruptura.data?.total ?? 0) > 0 ? 'price' : 'stock'}
              hint="Publicados no limite ou zerados"
            />
          </div>

          {(ruptura.data?.total ?? 0) > 0 ? (
            <Card
              className="mt-6"
              title="Estoque baixo na vitrine"
              description="Produtos publicados no limite de “últimas unidades” ou já zerados."
              actions={
                <Link
                  to="/produtos"
                  className="text-brand-600 text-sm font-semibold hover:underline"
                >
                  Ver produtos
                </Link>
              }
            >
              <ul className="divide-ink-200 divide-y">
                {(ruptura.data?.items ?? []).map((produto) => (
                  <li key={produto.id} className="flex items-center gap-3 py-2.5">
                    <span className="bg-ink-100 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
                      {produto.imageUrl ? (
                        <img src={produto.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <ImageOff className="text-ink-400 size-4" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/produtos/${produto.id}`}
                        className="text-ink-800 block truncate text-sm font-medium hover:underline"
                      >
                        {produto.name}
                      </Link>
                      <p className="text-ink-500 text-xs">
                        {produto.categoria ?? 'Sem categoria'} · restam {produto.qty}
                      </p>
                    </div>
                    <AlertTriangle
                      className={
                        produto.qty <= 0 ? 'text-price-500 size-4' : 'text-accent-500 size-4'
                      }
                      aria-hidden
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card
            className="mt-6"
            title="Produtos a completar"
            description="Itens que não aparecem na vitrine porque falta foto ou categoria."
            actions={
              <Link
                to="/produtos?needsContent=true"
                className="text-brand-600 text-sm font-semibold hover:underline"
              >
                Ver todos
              </Link>
            }
          >
            {aCompletar.data && aCompletar.data.items.length > 0 ? (
              <ul className="divide-ink-200 divide-y">
                {aCompletar.data.items.map((product) => (
                  <li key={product.id} className="flex items-center gap-3 py-2.5">
                    <span className="bg-ink-100 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <ImageOff className="text-ink-400 size-4" aria-hidden />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/produtos/${product.id}`}
                        className="text-ink-800 block truncate text-sm font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      <p className="text-ink-500 text-xs">
                        {product.imageCount === 0 ? 'Sem foto' : null}
                        {product.imageCount === 0 && !product.category ? ' · ' : null}
                        {!product.category ? 'Sem categoria' : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-500 text-sm">
                Nenhum produto pendente. O catálogo está completo.
              </p>
            )}
          </Card>
        </>
      )}
    </>
  );
}

const TONES = {
  stock: 'bg-stock-50 text-stock-600',
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-accent-50 text-accent-700',
  price: 'bg-price-50 text-price-600',
} as const;

function Metric({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  tone: keyof typeof TONES;
  hint?: string;
}) {
  return (
    <div className="rounded-card shadow-card bg-white p-4">
      <div className="flex items-center gap-3">
        <span className={`rounded-button flex size-9 items-center justify-center ${TONES[tone]}`}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-ink-500 text-xs font-medium tracking-wide uppercase">{label}</p>
          <p className="text-ink-900 text-lg font-bold">{value}</p>
        </div>
      </div>
      {hint ? <p className="text-ink-500 mt-2 text-xs">{hint}</p> : null}
    </div>
  );
}
