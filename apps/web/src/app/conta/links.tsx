'use client';

import { Button, Container } from '@aurora/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { CampoTexto, Mensagem } from '@/components/conta-ui';
import { chamarConta, useConta } from '@/lib/conta';

/**
 * As telas que chegam por link de e-mail: entrar sem senha, confirmar o
 * e-mail, criar senha nova e pedir o link de recuperação.
 *
 * O token vem na URL e é gasto no primeiro uso. Por isso a chamada roda uma
 * vez só, protegida por `useRef` — no modo de desenvolvimento o React monta o
 * componente duas vezes, e a segunda chamada encontraria o link já usado.
 */

function Moldura({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Container className="max-w-md py-8">
      <h1 className="text-ink-900 mb-4 text-xl font-bold">{titulo}</h1>
      {children}
    </Container>
  );
}

function useToken(): string {
  return useSearchParams().get('token') ?? '';
}

// ───────────────────────────── Entrar pelo link ────────────────────────────

export function EntrarPeloLink() {
  return (
    <Suspense fallback={null}>
      <EntrarPeloLinkInterno />
    </Suspense>
  );
}

function EntrarPeloLinkInterno() {
  const token = useToken();
  const router = useRouter();
  const { recarregar } = useConta();
  const chamou = useRef(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (chamou.current) return;
    chamou.current = true;

    void chamarConta('/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }).then(async (resposta) => {
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }

      await recarregar();
      router.replace('/conta');
    });
  }, [token, recarregar, router]);

  return (
    <Moldura titulo="Entrando…">
      {erro ? (
        <div className="space-y-3">
          <Mensagem tom="erro">{erro}</Mensagem>
          <Link href="/conta" className="text-brand-600 text-sm font-semibold hover:underline">
            Pedir outro link
          </Link>
        </div>
      ) : (
        <p className="text-ink-500 text-sm">Conferindo o seu link.</p>
      )}
    </Moldura>
  );
}

// ───────────────────────────── Confirmar e-mail ────────────────────────────

export function ConfirmarEmail() {
  return (
    <Suspense fallback={null}>
      <ConfirmarEmailInterno />
    </Suspense>
  );
}

function ConfirmarEmailInterno() {
  const token = useToken();
  const { recarregar } = useConta();
  const chamou = useRef(false);
  const [estado, setEstado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    if (chamou.current) return;
    chamou.current = true;

    void chamarConta('/email/verify', { method: 'POST', body: JSON.stringify({ token }) }).then(
      async (resposta) => {
        if (resposta.ok) {
          setEstado({ tom: 'ok', texto: 'E-mail confirmado. Obrigada!' });
          await recarregar();
        } else {
          setEstado({ tom: 'erro', texto: resposta.erro });
        }
      },
    );
  }, [token, recarregar]);

  return (
    <Moldura titulo="Confirmar e-mail">
      {estado ? (
        <Mensagem tom={estado.tom}>{estado.texto}</Mensagem>
      ) : (
        <p className="text-ink-500 text-sm">Conferindo…</p>
      )}
      <Link
        href="/conta"
        className="text-brand-600 mt-4 inline-block text-sm font-semibold hover:underline"
      >
        Ir para minha conta
      </Link>
    </Moldura>
  );
}

// ───────────────────────────── Senha nova ──────────────────────────────────

export function RedefinirSenha() {
  return (
    <Suspense fallback={null}>
      <RedefinirSenhaInterno />
    </Suspense>
  );
}

function RedefinirSenhaInterno() {
  const token = useToken();
  const router = useRouter();
  const { recarregar } = useConta();
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <Moldura titulo="Criar senha nova">
      <form
        className="rounded-card space-y-3 bg-white p-4"
        onSubmit={async (evento) => {
          evento.preventDefault();

          if (senha !== repetida) {
            setErro('As duas senhas não são iguais.');
            return;
          }

          setEnviando(true);
          setErro(null);

          const resposta = await chamarConta('/password/reset', {
            method: 'POST',
            body: JSON.stringify({ token, senha }),
          });

          setEnviando(false);

          if (!resposta.ok) {
            setErro(resposta.erro);
            return;
          }

          await recarregar();
          router.replace('/conta');
        }}
      >
        <CampoTexto
          id="senha"
          rotulo="Senha nova"
          type="password"
          autoComplete="new-password"
          dica="Pelo menos 8 caracteres."
          valor={senha}
          onChange={setSenha}
          required
        />
        <CampoTexto
          id="repetida"
          rotulo="Repita a senha"
          type="password"
          autoComplete="new-password"
          valor={repetida}
          onChange={setRepetida}
          required
        />

        {erro ? <Mensagem tom="erro">{erro}</Mensagem> : null}

        <Button type="submit" full disabled={enviando}>
          {enviando ? 'Salvando…' : 'Salvar e entrar'}
        </Button>

        <p className="text-ink-500 text-xs">
          Por segurança, todos os aparelhos em que sua conta estava aberta vão pedir para entrar de
          novo.
        </p>
      </form>
    </Moldura>
  );
}

// ─────────────────────────── Esqueci a senha ───────────────────────────────

export function EsqueciASenha() {
  const [email, setEmail] = useState('');
  const [resultado, setResultado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  return (
    <Moldura titulo="Esqueci a senha">
      <form
        className="rounded-card space-y-3 bg-white p-4"
        onSubmit={async (evento) => {
          evento.preventDefault();
          setEnviando(true);

          const resposta = await chamarConta<{ mensagem: string }>('/password/forgot', {
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
          Informe o e-mail da conta. Mandamos um link para você criar uma senha nova.
        </p>

        <CampoTexto
          id="email"
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          valor={email}
          onChange={setEmail}
          required
        />

        {resultado ? <Mensagem tom={resultado.tom}>{resultado.texto}</Mensagem> : null}

        <Button type="submit" full disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar link'}
        </Button>

        <Link
          href="/conta"
          className="text-brand-600 block text-center text-sm font-semibold hover:underline"
        >
          Voltar para entrar
        </Link>
      </form>
    </Moldura>
  );
}
