'use client';

import {
  AVAILABILITIES,
  DEFAULT_SCHEDULE,
  buildOrderWhatsAppLink,
  defaultRulesFor,
  formatBRL,
  getStoreStatus,
  multiplyQuantity,
} from '@aurora/types';
import {
  AvailabilityBadge,
  Badge,
  Button,
  Container,
  PriceTag,
  ProductCard,
  QuantityStepper,
  Skeleton,
  StoreStatusBadge,
  type ProductCardProduct,
} from '@aurora/ui';
import { MessageCircle, ShoppingCart } from 'lucide-react';
import { useState } from 'react';

/**
 * Vitrine do design system.
 *
 * Faz o papel do Storybook nesta fase: mostra cada componente com dados
 * reais, no navegador, sem trazer mais 200 MB de dependências. Se o time
 * sentir falta de isolamento por componente, o Storybook entra depois sem
 * mudar nada aqui.
 */

const PRODUTOS: ProductCardProduct[] = [
  {
    id: '1',
    name: 'Tricoline Estampado 100% Algodão',
    slug: 'tricoline-estampado-100-algodao',
    price: 1590,
    unit: 'metro',
    availability: 'em_estoque',
    highlight: '1,50m largura',
  },
  {
    id: '2',
    name: 'Fio Amigurumi Círculo 125m',
    slug: 'fio-amigurumi-circulo-125m',
    price: 1690,
    compareAt: 2190,
    unit: 'unidade',
    availability: 'ultimas_unidades',
    highlight: '125m',
  },
  {
    id: '3',
    name: 'Botão de Pérola',
    slug: 'botao-de-perola',
    price: 1199,
    unit: 'pacote',
    availability: 'sob_consulta',
    highlight: 'Pacote com 10 un',
  },
];

export default function DesignSystemPage() {
  const [quantidade, setQuantidade] = useState(1);
  const [favoritos, setFavoritos] = useState<string[]>([]);

  const tecido = PRODUTOS[0]!;
  const total = multiplyQuantity(tecido.price, quantidade);

  const { url, compact, message } = buildOrderWhatsAppLink('5511999990000', {
    code: 'CP-2026-0001',
    items: [
      {
        name: tecido.name,
        quantity: quantidade,
        unit: 'metro',
        unitPrice: tecido.price,
        lineTotal: total,
      },
    ],
    subtotal: total,
    total,
    deliveryLabel: 'Retirar na loja',
    orderUrl: 'https://armarinhoaurora.com.br/p/CP-2026-0001',
  });

  return (
    <Container className="space-y-10 py-8">
      <header>
        <h1 className="text-ink-900 text-2xl font-bold">Design system</h1>
        <p className="text-ink-600 mt-1 text-sm">
          Componentes e tokens da Armarinho Aurora — Sprint 0.
        </p>
      </header>

      <Section title="Cores da marca">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch className="bg-brand-600" name="brand-600" hex="#1B3A8C" onDark />
          <Swatch className="bg-accent-400" name="accent-400" hex="#FDC300" />
          <Swatch className="bg-price-500" name="price-500" hex="#E30613" onDark />
          <Swatch className="bg-whatsapp" name="whatsapp" hex="#25D366" onDark />
        </div>
      </Section>

      <Section title="Botões">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<ShoppingCart className="size-4" />}>Adicionar</Button>
          <Button variant="secondary">Ver detalhes</Button>
          <Button variant="whatsapp" icon={<MessageCircle className="size-4" />}>
            Comprar pelo WhatsApp
          </Button>
          <Button variant="outline">Continuar comprando</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button disabled>Indisponível</Button>
        </div>
      </Section>

      <Section title="Disponibilidade" hint="Nunca exibimos a quantidade exata em estoque.">
        <div className="flex flex-wrap gap-2">
          {AVAILABILITIES.map((availability) => (
            <AvailabilityBadge key={availability} availability={availability} />
          ))}
          <Badge tone="price">23% OFF</Badge>
          <Badge tone="brand">Novidade</Badge>
        </div>
      </Section>

      <Section title="Status da loja" hint="Seg a sex 9h–18h · Sáb 9h–16h · Dom fechado">
        <div className="flex flex-wrap gap-3">
          <StoreStatusBadge status={getStoreStatus(DEFAULT_SCHEDULE)} />
          <StoreStatusBadge
            status={getStoreStatus(DEFAULT_SCHEDULE, new Date('2026-09-08T15:00:00Z'))}
          />
          <StoreStatusBadge
            status={getStoreStatus(DEFAULT_SCHEDULE, new Date('2026-09-13T15:00:00Z'))}
          />
        </div>
        <p className="text-ink-600 mt-2 text-sm">
          {getStoreStatus(DEFAULT_SCHEDULE, new Date('2026-09-13T15:00:00Z')).message}
        </p>
      </Section>

      <Section title="Preço por unidade de venda">
        <div className="space-y-2">
          <PriceTag price={1590} unit="metro" size="lg" />
          <PriceTag price={3590} unit="unidade" />
          <PriceTag price={1690} compareAt={2190} unit="unidade" showDiscount />
          <PriceTag price={1199} unit="pacote" size="sm" />
        </div>
      </Section>

      <Section
        title="Seletor de quantidade"
        hint="Tecido anda de meio em meio metro; o valor digitado é normalizado."
      >
        <QuantityStepper
          value={quantidade}
          onChange={setQuantidade}
          unit="metro"
          rules={defaultRulesFor('metro')}
        />
        <p className="text-ink-600 mt-3 text-sm">
          {quantidade} × {formatBRL(tecido.price)} ={' '}
          <strong className="text-ink-900">{formatBRL(total)}</strong>
        </p>
      </Section>

      <Section title="Card de produto">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PRODUTOS.map((produto) => (
            <ProductCard
              key={produto.id}
              product={produto}
              showDiscount
              isFavorite={favoritos.includes(produto.id)}
              onToggleFavorite={(item) =>
                setFavoritos((current) =>
                  current.includes(item.id)
                    ? current.filter((id) => id !== item.id)
                    : [...current, item.id],
                )
              }
              onAdd={() => undefined}
            />
          ))}
        </div>

        <div className="mt-4 max-w-md">
          <ProductCard product={PRODUTOS[1]!} layout="list" showDiscount />
        </div>
      </Section>

      <Section
        title="Mensagem do WhatsApp"
        hint={`Formato ${compact ? 'compacto' : 'completo'} — escolhido pelo tamanho do carrinho.`}
      >
        <pre className="rounded-card text-ink-700 shadow-card overflow-x-auto bg-white p-4 text-sm whitespace-pre-wrap">
          {message}
        </pre>
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
          <Button variant="whatsapp" icon={<MessageCircle className="size-4" />}>
            Abrir no WhatsApp
          </Button>
        </a>
      </Section>

      <Section title="Carregamento">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-card shadow-card bg-white p-3">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="mt-3 h-4 w-4/5" />
              <Skeleton className="mt-2 h-4 w-1/2" />
            </div>
          ))}
        </div>
      </Section>
    </Container>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-ink-800 text-base font-bold">{title}</h2>
      {hint ? <p className="text-ink-500 mt-0.5 mb-3 text-sm">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function Swatch({
  className,
  name,
  hex,
  onDark = false,
}: {
  className: string;
  name: string;
  hex: string;
  onDark?: boolean;
}) {
  return (
    <div className={`rounded-card p-4 ${className} ${onDark ? 'text-white' : 'text-ink-900'}`}>
      <p className="text-sm font-bold">{name}</p>
      <p className="text-xs opacity-80">{hex}</p>
    </div>
  );
}
