'use client';

import {
  buildProductInquiryUrl,
  formatBRL,
  formatUnitPriceSuffix,
  normalizeQuantity,
  type SaleUnit,
} from '@aurora/types';
import { AvailabilityBadge, Button, QuantityStepper, buttonVariants, cn } from '@aurora/ui';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  MessageCircle,
  ShoppingCart,
  ZoomIn,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { BotaoFavorito } from '@/components/favoritos';
import { useCarrinho } from '@/lib/carrinho';
import type { ProdutoDetalhe } from '@/lib/api';

/**
 * Página de produto.
 *
 * O bloco inteiro é cliente porque tudo aqui reage a escolha: a foto que se
 * troca, a variação, a quantidade e o valor que ela produz. O conteúdo
 * indexável — nome, preço, ficha e dados estruturados — é renderizado no
 * servidor, na página que envolve este componente.
 */

export function DetalheDoProduto({
  produto,
  whatsapp,
  urlDaPagina,
}: {
  produto: ProdutoDetalhe;
  whatsapp: string;
  urlDaPagina: string;
}) {
  const { adicionar, ocupado } = useCarrinho();
  const [adicionado, setAdicionado] = useState(false);
  const [variacaoId, setVariacaoId] = useState<string | null>(produto.variants[0]?.id ?? null);
  const regras = { step: produto.quantidade.step, min: produto.quantidade.min };
  const [quantidade, setQuantidade] = useState(() => normalizeQuantity(regras.min, regras));

  const variacao = produto.variants.find((item) => item.id === variacaoId) ?? null;
  const precoUnitario = variacao?.price ?? produto.price;
  const disponibilidade = variacao?.availability ?? produto.availability;
  const esgotado = disponibilidade === 'esgotado';

  // Centavos inteiros do começo ao fim: o total é o preço unitário vezes a
  // quantidade, arredondado uma única vez. É este número que vai para o
  // WhatsApp — a loja e a cliente veem exatamente o mesmo valor.
  const total = Math.round(precoUnitario * quantidade);

  const linkWhatsApp = buildProductInquiryUrl(whatsapp, {
    name: produto.name,
    url: urlDaPagina,
    price: precoUnitario,
    variantName: variacao?.name ?? null,
    quantity: quantidade,
    unit: produto.unit,
    lineTotal: total,
  });

  async function adicionarAoCarrinho() {
    await adicionar({ productId: produto.id, variantId: variacaoId, qty: quantidade });

    // Confirmação no próprio botão: um aviso que some sozinho é mais discreto
    // que empurrar a pessoa para o carrinho no meio da escolha.
    setAdicionado(true);
    setTimeout(() => setAdicionado(false), 2500);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-8">
      <Galeria produto={produto} destaque={variacao?.imageUrl ?? null} />

      <div>
        <h1 className="text-ink-900 text-xl font-bold md:text-2xl">{produto.name}</h1>

        {produto.sku ? <p className="text-ink-400 mt-1 text-xs">Código {produto.sku}</p> : null}

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
          <span className="text-price-500 text-3xl font-bold">{formatBRL(precoUnitario)}</span>
          <span className="text-ink-500">{formatUnitPriceSuffix(produto.unit)}</span>
          {produto.compareAt ? (
            <span className="text-ink-400 text-sm line-through">
              {formatBRL(produto.compareAt)}
            </span>
          ) : null}
          {produto.descontoPercent > 0 ? (
            <span className="bg-price-500 rounded-pill px-2 py-0.5 text-xs font-bold text-white">
              {produto.descontoPercent}% OFF
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <AvailabilityBadge availability={disponibilidade} />
          {produto.packSize && produto.packSize > 1 ? (
            <span className="text-ink-500 text-sm">Pacote com {produto.packSize} un</span>
          ) : null}
        </div>

        {produto.shortDesc ? (
          <p className="text-ink-600 mt-4 text-sm">{produto.shortDesc}</p>
        ) : null}

        {produto.variants.length > 0 ? (
          <SeletorDeVariacao
            variacoes={produto.variants}
            selecionada={variacaoId}
            onChange={(id) => setVariacaoId(id)}
          />
        ) : null}

        <div className="mt-5">
          <p className="text-ink-700 mb-2 text-sm font-semibold">Quantidade</p>
          <QuantityStepper
            value={quantidade}
            onChange={setQuantidade}
            unit={produto.unit}
            rules={regras}
            disabled={esgotado}
          />
          {produto.quantidade.step !== 1 ? (
            <p className="text-ink-500 mt-2 text-xs">
              Vendido de {formatarPasso(produto.quantidade.step, produto.unit)} em{' '}
              {formatarPasso(produto.quantidade.step, produto.unit)}.
            </p>
          ) : null}
        </div>

        <div className="border-ink-200 mt-5 flex items-baseline justify-between border-t pt-4">
          <span className="text-ink-600 text-sm">Total</span>
          <span className="text-ink-900 text-2xl font-bold" aria-live="polite">
            {formatBRL(total)}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            full
            size="lg"
            disabled={esgotado || ocupado}
            onClick={() => void adicionarAoCarrinho()}
            icon={
              adicionado ? (
                <Check className="size-5" aria-hidden />
              ) : (
                <ShoppingCart className="size-5" aria-hidden />
              )
            }
          >
            {adicionado ? 'Adicionado!' : 'Adicionar ao carrinho'}
          </Button>

          <BotaoFavorito
            produtoId={produto.id}
            className="border-ink-300 size-12 shrink-0 border bg-white"
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          {esgotado ? (
            <span
              className={cn(
                buttonVariants({ variant: 'whatsapp', size: 'lg', full: true }),
                'pointer-events-none opacity-50',
              )}
              aria-disabled
            >
              Indisponível no momento
            </span>
          ) : (
            <a
              href={linkWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'whatsapp', size: 'lg', full: true })}
            >
              <MessageCircle className="size-5" aria-hidden />
              Comprar pelo WhatsApp
            </a>
          )}
        </div>

        <p className="text-ink-500 mt-2 text-center text-xs">
          Comprar pelo WhatsApp envia só este item. Para juntar vários, use o carrinho.
        </p>

        <FichaTecnica produto={produto} />
      </div>
    </div>
  );
}

/**
 * Galeria com contador, como no design.
 *
 * As setas só aparecem com mais de uma foto; no celular a faixa de miniaturas
 * rola de lado. O "zoom" é o link para a imagem em tamanho cheio: é o gesto
 * que a pessoa já conhece do celular, e não custa nada em JavaScript.
 */
function Galeria({ produto, destaque }: { produto: ProdutoDetalhe; destaque: string | null }) {
  const [indice, setIndice] = useState(0);
  const imagens = produto.images;

  // Escolher uma variação com foto própria manda a galeria para ela.
  const atual = useMemo(() => {
    if (destaque) {
      const daVariacao = imagens.findIndex((imagem) => imagem.url === destaque);
      if (daVariacao >= 0) return daVariacao;
    }
    return Math.min(indice, Math.max(0, imagens.length - 1));
  }, [destaque, imagens, indice]);

  if (imagens.length === 0) {
    return (
      <div className="rounded-card bg-ink-100 text-ink-400 flex aspect-square items-center justify-center">
        <ImageOff className="size-10" aria-hidden />
        <span className="sr-only">Produto sem foto</span>
      </div>
    );
  }

  const imagem = imagens[atual]!;

  return (
    <div>
      <div className="rounded-card bg-ink-100 relative overflow-hidden">
        <a
          href={imagem.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir a foto em tamanho real"
          className="block aspect-square"
        >
          <img
            src={imagem.url}
            alt={imagem.alt ?? produto.name}
            width={imagem.width ?? undefined}
            height={imagem.height ?? undefined}
            // A foto principal é o maior elemento da tela: carrega antes de tudo.
            fetchPriority="high"
            className="size-full object-cover"
          />
          <span className="text-ink-600 absolute right-2 bottom-2 rounded-full bg-white/90 p-2 backdrop-blur">
            <ZoomIn className="size-4" aria-hidden />
          </span>
        </a>

        {imagens.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() => setIndice((atual - 1 + imagens.length) % imagens.length)}
              className="text-ink-700 absolute top-1/2 left-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 backdrop-blur"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Próxima foto"
              onClick={() => setIndice((atual + 1) % imagens.length)}
              className="text-ink-700 absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 backdrop-blur"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>

            <span className="rounded-pill absolute top-2 left-2 bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
              {atual + 1}/{imagens.length}
            </span>
          </>
        ) : null}
      </div>

      {imagens.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {imagens.map((item, posicao) => (
            <button
              key={item.url}
              type="button"
              aria-label={`Ver foto ${posicao + 1}`}
              aria-current={posicao === atual}
              onClick={() => setIndice(posicao)}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                posicao === atual ? 'border-brand-600' : 'border-transparent',
              )}
            >
              <img src={item.url} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SeletorDeVariacao({
  variacoes,
  selecionada,
  onChange,
}: {
  variacoes: ProdutoDetalhe['variants'];
  selecionada: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="mt-5">
      <legend className="text-ink-700 mb-2 text-sm font-semibold">Escolha a opção</legend>

      <div className="flex flex-wrap gap-2">
        {variacoes.map((variacao) => {
          const marcada = variacao.id === selecionada;
          const esgotada = variacao.availability === 'esgotado';

          return (
            <button
              key={variacao.id}
              type="button"
              aria-pressed={marcada}
              disabled={esgotada}
              onClick={() => onChange(variacao.id)}
              className={cn(
                'rounded-pill flex items-center gap-2 border px-3 py-2 text-sm transition-colors',
                marcada
                  ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold'
                  : 'border-ink-300 text-ink-700 bg-white',
                esgotada && 'text-ink-400 line-through opacity-60',
              )}
            >
              {variacao.colorHex ? (
                <span
                  aria-hidden
                  className="border-ink-300 size-4 rounded-full border"
                  style={{ backgroundColor: variacao.colorHex }}
                />
              ) : null}
              {variacao.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function FichaTecnica({ produto }: { produto: ProdutoDetalhe }) {
  if (!produto.description && produto.attributes.length === 0 && !produto.marca) return null;

  return (
    <section className="mt-8">
      {produto.description ? (
        <>
          <h2 className="text-ink-900 mb-2 text-base font-bold">Descrição</h2>
          <p className="text-ink-600 mb-6 text-sm whitespace-pre-line">{produto.description}</p>
        </>
      ) : null}

      {produto.attributes.length > 0 || produto.marca ? (
        <>
          <h2 className="text-ink-900 mb-2 text-base font-bold">Ficha técnica</h2>
          <dl className="rounded-card divide-ink-200 divide-y bg-white text-sm">
            {produto.marca ? (
              <div className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-500">Marca</dt>
                <dd className="text-ink-800 text-right font-medium">{produto.marca.name}</dd>
              </div>
            ) : null}
            {produto.attributes.map((atributo) => (
              <div key={atributo.chave} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-500 capitalize">{atributo.chave}</dt>
                <dd className="text-ink-800 text-right font-medium">{atributo.valor}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
    </section>
  );
}

/** "0,5 metro" — o passo escrito por extenso, para a linha de aviso. */
function formatarPasso(step: number, unit: SaleUnit): string {
  const numero = step.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return unit === 'metro' ? `${numero} m` : numero;
}
