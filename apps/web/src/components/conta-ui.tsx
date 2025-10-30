'use client';

import { Button, Container, cn } from '@aurora/ui';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useCarrinho } from '@/lib/carrinho';
import { chamarConta, useConta } from '@/lib/conta';

/**
 * Peças comuns da área do cliente.
 */

/** Cabeçalho com volta, como as telas internas do design. */
export function AreaDaConta({
  titulo,
  voltar = '/conta',
  children,
}: {
  titulo: string;
  voltar?: string;
  children: ReactNode;
}) {
  return (
    <Container className="py-5">
      <Link
        href={voltar}
        className="text-ink-500 hover:text-ink-700 mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar
      </Link>
      <h1 className="text-ink-900 mb-5 text-xl font-bold">{titulo}</h1>
      {children}
    </Container>
  );
}

/**
 * Só mostra o conteúdo para quem está logado.
 *
 * Quem cai numa tela interna sem sessão — link antigo, sessão expirada — vai
 * para a entrada e volta para onde estava depois de entrar.
 */
export function ExigeConta({ children }: { children: ReactNode }) {
  const { cliente, pronto } = useConta();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pronto && !cliente) router.replace(`/conta?voltar=${encodeURIComponent(pathname)}`);
  }, [pronto, cliente, router, pathname]);

  if (!pronto || !cliente) {
    return <p className="text-ink-500 py-10 text-center text-sm">Carregando…</p>;
  }

  return <>{children}</>;
}

export function CampoTexto({
  id,
  rotulo,
  valor,
  onChange,
  dica,
  ...props
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  dica?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div>
      <label htmlFor={id} className="text-ink-700 mb-1 block text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
        className="rounded-button border-ink-300 text-ink-900 disabled:bg-ink-100 h-11 w-full border px-3 text-base outline-none"
        {...props}
      />
      {dica ? <p className="text-ink-500 mt-1 text-xs">{dica}</p> : null}
    </div>
  );
}

export function Mensagem({
  tom = 'aviso',
  children,
}: {
  tom?: 'ok' | 'erro' | 'aviso';
  children: ReactNode;
}) {
  return (
    <p
      role={tom === 'erro' ? 'alert' : 'status'}
      className={cn(
        'rounded-md px-3 py-2 text-sm',
        tom === 'erro' && 'bg-price-50 text-price-700',
        tom === 'ok' && 'bg-stock-50 text-stock-700',
        tom === 'aviso' && 'bg-accent-100 text-ink-700',
      )}
    >
      {children}
    </p>
  );
}

/** Onde o "pedir de novo" deixa os itens que não voltaram, para o carrinho contar. */
const CHAVE_INDISPONIVEIS = 'aurora:pedir-de-novo';

/**
 * "Pedir de novo": põe no carrinho o que ainda está à venda e leva até ele.
 *
 * É o segundo dos três toques do critério de aceite — Conta, Pedir de novo,
 * Finalizar. O que saiu do catálogo não volta, e o carrinho diz quais foram,
 * para a pessoa não achar que a loja esqueceu um item.
 */
export function BotaoPedirDeNovo({ code, className }: { code: string; className?: string }) {
  const router = useRouter();
  const { recarregar } = useCarrinho();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir() {
    setOcupado(true);
    setErro(null);

    const resposta = await chamarConta<{ adicionados: number; indisponiveis: string[] }>(
      `/orders/${encodeURIComponent(code)}/reorder`,
      { method: 'POST' },
    );

    if (!resposta.ok) {
      setErro(resposta.erro);
      setOcupado(false);
      return;
    }

    try {
      sessionStorage.setItem(CHAVE_INDISPONIVEIS, JSON.stringify(resposta.dados.indisponiveis));
    } catch {
      // Sem armazenamento, o carrinho só não mostra o aviso dos que faltaram.
    }

    await recarregar();
    router.push('/carrinho');
  }

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void pedir()}
        disabled={ocupado}
        icon={<RefreshCw className={cn('size-4', ocupado && 'animate-spin')} aria-hidden />}
      >
        {ocupado ? 'Colocando no carrinho…' : 'Pedir de novo'}
      </Button>
      {erro ? <p className="text-price-600 mt-1 text-xs">{erro}</p> : null}
    </div>
  );
}

/** No carrinho: avisa quais itens do pedido antigo não voltaram. Lido uma vez só. */
export function AvisoPedirDeNovo() {
  const [indisponiveis, setIndisponiveis] = useState<string[]>([]);

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(CHAVE_INDISPONIVEIS);
      sessionStorage.removeItem(CHAVE_INDISPONIVEIS);
      const lista: unknown = guardado ? JSON.parse(guardado) : [];
      if (Array.isArray(lista)) setIndisponiveis(lista.map(String));
    } catch {
      // Conteúdo estranho no armazenamento: sem aviso, sem erro.
    }
  }, []);

  if (indisponiveis.length === 0) return null;

  return (
    <Mensagem>
      Não estão mais à venda e ficaram de fora: {indisponiveis.join(', ')}. Se precisar, pergunte
      pelo WhatsApp — a loja pode ter algo parecido.
    </Mensagem>
  );
}
