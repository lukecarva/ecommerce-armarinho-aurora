'use client';

import { formatBRL, formatPhoneBR, formatQuantity, type StoreStatus } from '@aurora/types';
import { Button, QuantityStepper, cn } from '@aurora/ui';
import { ImageOff, MessageCircle, Tag, Trash2, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AvisoPedirDeNovo } from '@/components/conta-ui';
import { useCarrinho, type ItemDoCarrinho } from '@/lib/carrinho';
import { chamarConta, useConta } from '@/lib/conta';
import type { DeliveryMethodSummary } from '@/lib/api';

/**
 * Carrinho e fechamento do pedido.
 *
 * O passo final desta loja não é um pagamento: é abrir o WhatsApp com a
 * mensagem pronta. Duas consequências moldam o código abaixo.
 *
 * **A aba abre antes da resposta do servidor.** O navegador só permite abrir
 * uma janela durante o gesto que a pessoa fez; se esperássemos o `POST`
 * terminar, o bloqueador de pop-up mataria a aba e a venda pararia aqui. Por
 * isso a aba nasce vazia no clique e recebe o endereço quando o pedido volta.
 *
 * **Fora do horário o botão continua funcionando.** A mensagem espera na fila
 * do WhatsApp; o que muda é o aviso, para ninguém ficar esperando resposta às
 * onze da noite de sábado.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export function Checkout({
  formasDeEntrega,
  storeStatus,
}: {
  formasDeEntrega: DeliveryMethodSummary[];
  storeStatus: StoreStatus;
}) {
  const { carrinho, pronto, ocupado, erro } = useCarrinho();

  if (!pronto) return <p className="text-ink-500 py-10 text-center text-sm">Carregando…</p>;

  if (carrinho.items.length === 0) {
    return (
      <div className="rounded-card border-ink-300 border border-dashed bg-white px-6 py-10 text-center">
        <p className="text-ink-700 font-medium">Seu carrinho está vazio.</p>
        <p className="text-ink-500 mt-1 text-sm">
          Escolha os tecidos e aviamentos e volte aqui para fechar pelo WhatsApp.
        </p>
        <Link
          href="/categorias"
          className="text-brand-600 mt-6 inline-block text-sm font-semibold hover:underline"
        >
          Ver o catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-3">
        <AvisoPedirDeNovo />
        {erro ? <Aviso>{erro}</Aviso> : null}
        {carrinho.items.map((item) => (
          <LinhaDoCarrinho key={item.id} item={item} desabilitado={ocupado} />
        ))}
      </div>

      <div className="space-y-4 lg:sticky lg:top-20">
        <Cupom />
        <Resumo />
        <FormularioDoPedido formasDeEntrega={formasDeEntrega} storeStatus={storeStatus} />
      </div>
    </div>
  );
}

function LinhaDoCarrinho({ item, desabilitado }: { item: ItemDoCarrinho; desabilitado: boolean }) {
  const { alterar, remover } = useCarrinho();

  return (
    <article
      className={cn(
        'rounded-card shadow-card flex gap-3 bg-white p-3',
        item.indisponivel && 'opacity-70',
      )}
    >
      <Link
        href={`/produto/${item.slug}`}
        className="bg-ink-100 size-20 shrink-0 overflow-hidden rounded-md"
      >
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="text-ink-400 flex size-full items-center justify-center">
            <ImageOff className="size-5" aria-hidden />
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/produto/${item.slug}`}
              className="text-ink-800 line-clamp-2 text-sm font-semibold hover:underline"
            >
              {item.name}
            </Link>
            {item.variantName ? <p className="text-ink-500 text-xs">{item.variantName}</p> : null}
          </div>

          <button
            type="button"
            aria-label={`Remover ${item.name}`}
            onClick={() => void remover(item.id)}
            disabled={desabilitado}
            className="text-ink-400 hover:text-price-500 shrink-0"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>

        {item.indisponivel ? (
          <p className="text-price-600 mt-2 flex items-center gap-1.5 text-xs font-medium">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            Saiu do catálogo. Não entra no total — remova ou fale com a gente.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <QuantityStepper
              value={item.qty}
              onChange={(qty) => void alterar(item.id, qty)}
              unit={item.unit}
              rules={item.quantidade}
              disabled={desabilitado}
              className="origin-left scale-90"
            />

            <div className="text-right">
              <p className="text-ink-900 font-bold">{formatBRL(item.lineTotal)}</p>
              <p className="text-ink-500 text-xs">
                {formatQuantity(item.qty, item.unit)} × {formatBRL(item.unitPrice)}
              </p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function Cupom() {
  const { carrinho, aplicarCupom, removerCupom, ocupado } = useCarrinho();
  const [codigo, setCodigo] = useState('');

  if (carrinho.coupon) {
    return (
      <div className="rounded-card flex items-center justify-between bg-white p-3">
        <span className="text-stock-700 flex items-center gap-2 text-sm font-medium">
          <Tag className="size-4" aria-hidden />
          {carrinho.coupon.code} — {formatBRL(carrinho.coupon.discount)} de desconto
        </span>
        <button
          type="button"
          aria-label="Remover cupom"
          onClick={() => void removerCupom()}
          disabled={ocupado}
          className="text-ink-400 hover:text-ink-700"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <form
      className="rounded-card bg-white p-3"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (codigo.trim()) void aplicarCupom(codigo);
      }}
    >
      <label htmlFor="cupom" className="text-ink-700 mb-2 block text-sm font-semibold">
        Tem um cupom?
      </label>

      <div className="flex gap-2">
        <input
          id="cupom"
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          placeholder="Código"
          autoComplete="off"
          className="rounded-button border-ink-300 text-ink-900 h-11 flex-1 border px-3 text-base uppercase outline-none"
        />
        <Button type="submit" variant="outline" disabled={ocupado || !codigo.trim()}>
          Aplicar
        </Button>
      </div>

      {carrinho.couponError ? (
        <p className="text-price-600 mt-2 text-xs">{carrinho.couponError.message}</p>
      ) : null}
    </form>
  );
}

function Resumo() {
  const { carrinho } = useCarrinho();

  return (
    <div className="rounded-card space-y-2 bg-white p-4 text-sm">
      <div className="text-ink-600 flex justify-between">
        <span>Subtotal ({carrinho.itemCount} itens)</span>
        <span>{formatBRL(carrinho.subtotal)}</span>
      </div>

      {carrinho.discount > 0 ? (
        <div className="text-stock-700 flex justify-between">
          <span>Desconto</span>
          <span>−{formatBRL(carrinho.discount)}</span>
        </div>
      ) : null}

      <div className="border-ink-200 text-ink-900 flex justify-between border-t pt-2 text-lg font-bold">
        <span>Total</span>
        <span>{formatBRL(carrinho.total)}</span>
      </div>

      <p className="text-ink-500 text-xs">
        Valor estimado. A entrega por motoboy é combinada no WhatsApp.
      </p>
    </div>
  );
}

function FormularioDoPedido({
  formasDeEntrega,
  storeStatus,
}: {
  formasDeEntrega: DeliveryMethodSummary[];
  storeStatus: StoreStatus;
}) {
  const { carrinho, recarregar } = useCarrinho();
  const { cliente } = useConta();

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [entregaId, setEntregaId] = useState(formasDeEntrega[0]?.id ?? '');
  const [bairro, setBairro] = useState('');
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Quem tem conta não digita de novo o que a loja já sabe: nome, WhatsApp,
  // e-mail e o bairro do endereço padrão. Só preenche campo vazio — o que a
  // pessoa já digitou nesta visita nunca é sobrescrito.
  useEffect(() => {
    if (!cliente) return;

    setNome((atual) => atual || cliente.name);
    setTelefone((atual) => atual || formatPhoneBR(cliente.phone));
    setEmail((atual) => atual || (cliente.email ?? ''));

    void chamarConta<Array<{ district: string; isDefault: boolean }>>('/addresses').then(
      (resposta) => {
        if (!resposta.ok) return;
        const padrao = resposta.dados.find((endereco) => endereco.isDefault) ?? resposta.dados[0];
        if (padrao) setBairro((atual) => atual || padrao.district);
      },
    );
  }, [cliente]);

  const entrega = formasDeEntrega.find((forma) => forma.id === entregaId);
  const vendaveis = carrinho.items.filter((item) => !item.indisponivel);
  const podeEnviar =
    vendaveis.length > 0 && nome.trim().length >= 2 && telefone.trim().length >= 10;

  async function finalizar() {
    if (enviando) return;

    // A aba nasce agora, dentro do clique. Abrir depois da resposta do
    // servidor seria abrir fora do gesto — e o navegador bloquearia.
    const aba = window.open('', '_blank');

    setEnviando(true);
    setErro(null);

    try {
      const resposta = await fetch(`${API}/orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          telefone,
          email,
          deliveryMethodId: entregaId,
          deliveryNote: entrega?.asksAddress ? bairro : '',
          observacao,
        }),
      });

      const dados: unknown = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        aba?.close();
        setErro(mensagemDe(dados) ?? 'Não foi possível registrar seu pedido.');
        return;
      }

      const pedido = dados as { code: string; publicToken: string; whatsappUrl: string };

      // O clique é registrado sem segurar a navegação: é métrica, não parte do
      // caminho da cliente.
      void fetch(
        `${API}/orders/${pedido.code}/whatsapp?t=${encodeURIComponent(pedido.publicToken)}`,
        { method: 'POST', credentials: 'include', keepalive: true },
      );

      await recarregar();

      if (aba) aba.location.href = pedido.whatsappUrl;
      // Bloqueador de pop-up mesmo assim: navega na própria aba, sem perder o
      // pedido, que já está gravado.
      else window.location.href = pedido.whatsappUrl;
    } catch {
      aba?.close();
      setErro('Sem conexão. Seu carrinho continua salvo — tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="rounded-card space-y-3 bg-white p-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        void finalizar();
      }}
    >
      <h2 className="text-ink-900 font-bold">Seus dados</h2>

      <Campo id="nome" rotulo="Nome" valor={nome} onChange={setNome} autoComplete="name" required />
      <Campo
        id="telefone"
        rotulo="WhatsApp"
        valor={telefone}
        onChange={setTelefone}
        inputMode="tel"
        autoComplete="tel"
        placeholder="(11) 90000-0000"
        required
      />
      <Campo
        id="email"
        rotulo="E-mail (opcional)"
        valor={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
      />

      <fieldset className="pt-1">
        <legend className="text-ink-900 mb-2 font-bold">Como quer receber?</legend>

        <div className="space-y-2">
          {formasDeEntrega.map((forma) => (
            <label
              key={forma.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm',
                forma.id === entregaId ? 'border-brand-600 bg-brand-50' : 'border-ink-300',
              )}
            >
              <input
                type="radio"
                name="entrega"
                value={forma.id}
                checked={forma.id === entregaId}
                onChange={() => setEntregaId(forma.id)}
                className="mt-1"
              />
              <span className="min-w-0 flex-1">
                <span className="text-ink-800 flex justify-between gap-2 font-semibold">
                  {forma.label}
                  <span className="text-brand-700 shrink-0">{forma.priceLabel}</span>
                </span>
                {forma.description ? (
                  <span className="text-ink-500 mt-0.5 block text-xs">{forma.description}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {entrega?.asksAddress ? (
        <Campo
          id="bairro"
          rotulo="Bairro ou referência (opcional)"
          valor={bairro}
          onChange={setBairro}
          placeholder="Centro"
        />
      ) : null}

      <Campo
        id="observacao"
        rotulo="Observação (opcional)"
        valor={observacao}
        onChange={setObservacao}
        placeholder="Ex.: preciso até sexta"
      />

      {!storeStatus.isOpen ? <Aviso>{storeStatus.message}</Aviso> : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

      <Button
        type="submit"
        variant="whatsapp"
        size="lg"
        full
        disabled={!podeEnviar || enviando}
        icon={<MessageCircle className="size-5" aria-hidden />}
      >
        {enviando ? 'Gerando seu pedido…' : 'Finalizar pelo WhatsApp'}
      </Button>

      <p className="text-ink-500 text-center text-xs">
        Sem pagamento pelo site. Você conversa com a loja para combinar tudo.
      </p>
    </form>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  onChange,
  ...props
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  // `value` e `onChange` do input nativo ficam de fora: aqui eles trabalham
  // com texto, não com o evento.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div>
      <label htmlFor={id} className="text-ink-700 mb-1 block text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
        className="rounded-button border-ink-300 text-ink-900 h-11 w-full border px-3 text-base outline-none"
        {...props}
      />
    </div>
  );
}

function Aviso({
  children,
  tom = 'atencao',
}: {
  children: React.ReactNode;
  tom?: 'atencao' | 'erro';
}) {
  return (
    <p
      role={tom === 'erro' ? 'alert' : undefined}
      className={cn(
        'rounded-md px-3 py-2 text-xs',
        tom === 'erro' ? 'bg-price-50 text-price-700' : 'bg-accent-100 text-ink-700',
      )}
    >
      {children}
    </p>
  );
}

function mensagemDe(dados: unknown): string | null {
  if (!dados || typeof dados !== 'object' || !('message' in dados)) return null;

  const mensagem = (dados as { message: unknown }).message;
  // O Zod devolve uma lista de problemas; a primeira já diz o que corrigir.
  if (Array.isArray(mensagem)) return String(mensagem[0]);

  return typeof mensagem === 'string' ? mensagem : null;
}
