'use client';

import { formatBRL } from '@aurora/types';
import { Button, Container, cn } from '@aurora/ui';
import {
  Bell,
  ChevronRight,
  Heart,
  HelpCircle,
  Info,
  LogOut,
  MapPin,
  Package,
  Ticket,
  User,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { BotaoPedirDeNovo, CampoTexto, Mensagem } from '@/components/conta-ui';
import { chamarConta, useConta } from '@/lib/conta';

export default function ContaPage() {
  return (
    <Suspense fallback={<Carregando />}>
      <Conta />
    </Suspense>
  );
}

function Conta() {
  const { cliente, pronto } = useConta();

  if (!pronto) return <Carregando />;
  return cliente ? <PainelDaConta /> : <EntrarOuCriar />;
}

function Carregando() {
  return <p className="text-ink-500 py-10 text-center text-sm">Carregando…</p>;
}

// ─────────────────────────────── Logado ────────────────────────────────────

interface PedidoResumo {
  code: string;
  statusLabel: string;
  createdAt: string;
  itemCount: number;
  total: number;
  finalValue: number | null;
}

const MENU: Array<{ href: string; rotulo: string; icone: LucideIcon; avisos?: boolean }> = [
  { href: '/conta/dados', rotulo: 'Meus dados', icone: User },
  { href: '/conta/pedidos', rotulo: 'Meus pedidos', icone: Package },
  { href: '/favoritos', rotulo: 'Meus favoritos', icone: Heart },
  { href: '/conta/cupons', rotulo: 'Cupons', icone: Ticket },
  { href: '/conta/enderecos', rotulo: 'Endereços', icone: MapPin },
  { href: '/conta/notificacoes', rotulo: 'Notificações', icone: Bell, avisos: true },
  { href: '/conta/ajuda', rotulo: 'Ajuda e suporte', icone: HelpCircle },
  { href: '/conta/sobre', rotulo: 'Sobre', icone: Info },
];

function PainelDaConta() {
  const { cliente, naoLidas, sair } = useConta();
  const [pedidos, setPedidos] = useState<PedidoResumo[] | null>(null);
  const [reenviado, setReenviado] = useState<string | null>(null);

  useEffect(() => {
    void chamarConta<{ items: PedidoResumo[] }>('/orders').then((resposta) => {
      setPedidos(resposta.ok ? resposta.dados.items.slice(0, 3) : []);
    });
  }, []);

  async function reenviar() {
    const resposta = await chamarConta('/email/resend', { method: 'POST' });
    setReenviado(
      resposta.ok ? 'Enviamos o link de novo. Veja sua caixa de entrada.' : resposta.erro,
    );
  }

  if (!cliente) return null;

  return (
    <Container className="py-5">
      <h1 className="text-ink-900 text-xl font-bold">Olá, {cliente.name.split(' ')[0]}!</h1>
      <p className="text-ink-500 mb-5 text-sm">{cliente.email}</p>

      {!cliente.emailVerified ? (
        <div className="mb-5 space-y-2">
          <Mensagem>
            Confirme seu e-mail pelo link que enviamos. É por ele que você recupera a conta se
            esquecer a senha.
          </Mensagem>
          {reenviado ? (
            <p className="text-ink-600 text-xs">{reenviado}</p>
          ) : (
            <button
              type="button"
              onClick={() => void reenviar()}
              className="text-brand-600 text-sm font-semibold hover:underline"
            >
              Reenviar o link de confirmação
            </button>
          )}
        </div>
      ) : null}

      {pedidos && pedidos.length > 0 ? (
        <section className="mb-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-ink-900 font-bold">Últimos pedidos</h2>
            <Link href="/conta/pedidos" className="text-brand-600 text-sm font-semibold">
              Ver todos
            </Link>
          </div>

          <div className="space-y-2">
            {pedidos.map((pedido) => (
              <article
                key={pedido.code}
                className="rounded-card shadow-card flex flex-wrap items-center justify-between gap-3 bg-white p-3"
              >
                <Link href={`/conta/pedidos/${pedido.code}`} className="min-w-0">
                  <p className="text-ink-900 text-sm font-bold">{pedido.code}</p>
                  <p className="text-ink-500 text-xs">
                    {new Date(pedido.createdAt).toLocaleDateString('pt-BR')} · {pedido.statusLabel}{' '}
                    · {formatBRL(pedido.finalValue ?? pedido.total)}
                  </p>
                </Link>
                <BotaoPedirDeNovo code={pedido.code} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <nav
        aria-label="Minha conta"
        className="rounded-card shadow-card divide-ink-100 divide-y bg-white"
      >
        {MENU.map((item) => {
          const Icone = item.icone;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="hover:bg-ink-50 flex items-center gap-3 px-4 py-3.5"
            >
              <Icone className="text-brand-600 size-5 shrink-0" aria-hidden />
              <span className="text-ink-800 flex-1 text-sm font-medium">{item.rotulo}</span>
              {item.avisos && naoLidas > 0 ? (
                <span className="bg-price-500 rounded-pill px-2 py-0.5 text-xs font-bold text-white">
                  {naoLidas}
                </span>
              ) : null}
              <ChevronRight className="text-ink-400 size-4" aria-hidden />
            </Link>
          );
        })}
      </nav>

      <Button
        variant="ghost"
        full
        className="mt-4"
        onClick={() => void sair()}
        icon={<LogOut className="size-4" aria-hidden />}
      >
        Sair da conta
      </Button>
    </Container>
  );
}

// ───────────────────────────── Sem sessão ──────────────────────────────────

type Modo = 'entrar' | 'criar' | 'link';

function EntrarOuCriar() {
  const params = useSearchParams();
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('entrar');

  // Quem foi mandado para cá por uma tela interna volta para ela ao entrar.
  const voltar = params.get('voltar');
  const destinoSeguro = voltar?.startsWith('/') && !voltar.startsWith('//') ? voltar : null;

  function depoisDeEntrar() {
    if (destinoSeguro) router.push(destinoSeguro);
  }

  return (
    <Container className="max-w-md py-6">
      <h1 className="text-ink-900 mb-1 text-xl font-bold">Minha conta</h1>
      <p className="text-ink-500 mb-5 text-sm">
        Com conta, seus dados já vêm preenchidos no pedido, seus favoritos vão junto para qualquer
        aparelho e você pede de novo em um toque.
      </p>

      <div role="tablist" className="bg-ink-100 rounded-button mb-5 grid grid-cols-2 p-1">
        {(['entrar', 'criar'] as const).map((aba) => (
          <button
            key={aba}
            type="button"
            role="tab"
            aria-selected={modo === aba || (aba === 'entrar' && modo === 'link')}
            onClick={() => setModo(aba)}
            className={cn(
              'rounded-button py-2 text-sm font-semibold',
              modo === aba || (aba === 'entrar' && modo === 'link')
                ? 'text-ink-900 bg-white shadow-sm'
                : 'text-ink-500',
            )}
          >
            {aba === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        ))}
      </div>

      {modo === 'entrar' ? (
        <FormEntrar aoEntrar={depoisDeEntrar} aoPedirLink={() => setModo('link')} />
      ) : modo === 'link' ? (
        <FormLink aoVoltar={() => setModo('entrar')} />
      ) : (
        <FormCriar aoCriar={depoisDeEntrar} />
      )}
    </Container>
  );
}

function FormEntrar({ aoEntrar, aoPedirLink }: { aoEntrar: () => void; aoPedirLink: () => void }) {
  const { entrar } = useConta();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      className="rounded-card space-y-3 bg-white p-4"
      onSubmit={async (evento) => {
        evento.preventDefault();
        setEnviando(true);
        setErro(null);

        const resposta = await entrar(email, senha);
        setEnviando(false);

        if (resposta.ok) aoEntrar();
        else setErro(resposta.erro);
      }}
    >
      <CampoTexto
        id="email"
        rotulo="E-mail"
        type="email"
        autoComplete="email"
        valor={email}
        onChange={setEmail}
        required
      />
      <CampoTexto
        id="senha"
        rotulo="Senha"
        type="password"
        autoComplete="current-password"
        valor={senha}
        onChange={setSenha}
        required
      />

      {erro ? <Mensagem tom="erro">{erro}</Mensagem> : null}

      <Button type="submit" full disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </Button>

      <div className="flex flex-wrap justify-between gap-2 pt-1 text-sm">
        <Link href="/conta/esqueci" className="text-brand-600 font-semibold hover:underline">
          Esqueci a senha
        </Link>
        <button
          type="button"
          onClick={aoPedirLink}
          className="text-brand-600 font-semibold hover:underline"
        >
          Entrar sem senha
        </button>
      </div>
    </form>
  );
}

function FormLink({ aoVoltar }: { aoVoltar: () => void }) {
  const [email, setEmail] = useState('');
  const [resultado, setResultado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      className="rounded-card space-y-3 bg-white p-4"
      onSubmit={async (evento) => {
        evento.preventDefault();
        setEnviando(true);

        const resposta = await chamarConta<{ mensagem: string }>('/magic-link', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });

        setEnviando(false);
        setResultado(
          resposta.ok
            ? { tom: 'ok', texto: resposta.dados.mensagem }
            : { tom: 'erro', texto: resposta.erro },
        );
      }}
    >
      <p className="text-ink-600 text-sm">
        Mandamos um link para o seu e-mail. É só tocar nele para entrar — sem senha.
      </p>

      <CampoTexto
        id="email-link"
        rotulo="E-mail"
        type="email"
        autoComplete="email"
        valor={email}
        onChange={setEmail}
        required
      />

      {resultado ? <Mensagem tom={resultado.tom}>{resultado.texto}</Mensagem> : null}

      <Button type="submit" full disabled={enviando}>
        {enviando ? 'Enviando…' : 'Receber link de acesso'}
      </Button>

      <button
        type="button"
        onClick={aoVoltar}
        className="text-brand-600 w-full text-sm font-semibold hover:underline"
      >
        Entrar com senha
      </button>
    </form>
  );
}

function FormCriar({ aoCriar }: { aoCriar: () => void }) {
  const { cadastrar } = useConta();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [aceitaTermos, setAceitaTermos] = useState(false);
  const [aceitaMarketing, setAceitaMarketing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <form
      className="rounded-card space-y-3 bg-white p-4"
      onSubmit={async (evento) => {
        evento.preventDefault();
        setEnviando(true);
        setErro(null);

        const resposta = await cadastrar({
          nome,
          email,
          telefone,
          senha,
          aceitaMarketing,
          aceitaTermos,
        });
        setEnviando(false);

        if (resposta.ok) aoCriar();
        else setErro(resposta.erro);
      }}
    >
      <CampoTexto
        id="nome"
        rotulo="Nome"
        autoComplete="name"
        valor={nome}
        onChange={setNome}
        required
      />
      <CampoTexto
        id="email-novo"
        rotulo="E-mail"
        type="email"
        autoComplete="email"
        valor={email}
        onChange={setEmail}
        required
      />
      <CampoTexto
        id="telefone"
        rotulo="WhatsApp"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(11) 90000-0000"
        valor={telefone}
        onChange={setTelefone}
        required
      />
      <CampoTexto
        id="senha-nova"
        rotulo="Senha"
        type="password"
        autoComplete="new-password"
        dica="Pelo menos 8 caracteres. Uma frase curta é mais fácil de lembrar e mais difícil de adivinhar."
        valor={senha}
        onChange={setSenha}
        required
      />

      <label className="text-ink-700 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={aceitaTermos}
          onChange={(evento) => setAceitaTermos(evento.target.checked)}
          className="mt-1"
          required
        />
        <span>
          Concordo que a Armarinho Aurora guarde meus dados para atender meus pedidos, e sei que
          posso pedir para vê-los ou apagá-los quando quiser.
        </span>
      </label>

      <label className="text-ink-700 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={aceitaMarketing}
          onChange={(evento) => setAceitaMarketing(evento.target.checked)}
          className="mt-1"
        />
        <span>Quero receber cupons e novidades por e-mail. (Opcional)</span>
      </label>

      {erro ? <Mensagem tom="erro">{erro}</Mensagem> : null}

      <Button type="submit" full disabled={enviando || !aceitaTermos}>
        {enviando ? 'Criando…' : 'Criar conta'}
      </Button>
    </form>
  );
}
