'use client';

import { formatPhoneBR } from '@aurora/types';
import { Button } from '@aurora/ui';
import { useEffect, useState } from 'react';
import { AreaDaConta, CampoTexto, ExigeConta, Mensagem } from '@/components/conta-ui';
import { chamarConta, useConta } from '@/lib/conta';

interface Perfil {
  name: string;
  email: string | null;
  phone: string;
  emailVerified: boolean;
  temSenha: boolean;
  acceptsMarketing: boolean;
}

type Retorno = { tom: 'ok' | 'erro'; texto: string } | null;

export default function DadosPage() {
  return (
    <AreaDaConta titulo="Meus dados">
      <ExigeConta>
        <Dados />
      </ExigeConta>
    </AreaDaConta>
  );
}

function Dados() {
  const { recarregar } = useConta();
  const [perfil, setPerfil] = useState<Perfil | null>(null);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceitaMarketing, setAceitaMarketing] = useState(false);
  const [retornoDados, setRetornoDados] = useState<Retorno>(null);

  useEffect(() => {
    void chamarConta<Perfil>('/profile').then((resposta) => {
      if (!resposta.ok) return;
      setPerfil(resposta.dados);
      setNome(resposta.dados.name);
      setTelefone(formatPhoneBR(resposta.dados.phone));
      setAceitaMarketing(resposta.dados.acceptsMarketing);
    });
  }, []);

  if (!perfil) return <p className="text-ink-500 text-sm">Carregando…</p>;

  return (
    <div className="max-w-lg space-y-5">
      <form
        className="rounded-card space-y-3 bg-white p-4"
        onSubmit={async (evento) => {
          evento.preventDefault();

          const resposta = await chamarConta<Perfil>('/profile', {
            method: 'PATCH',
            body: JSON.stringify({ nome, telefone, aceitaMarketing }),
          });

          if (resposta.ok) {
            setPerfil(resposta.dados);
            setRetornoDados({ tom: 'ok', texto: 'Dados salvos.' });
            await recarregar();
          } else {
            setRetornoDados({ tom: 'erro', texto: resposta.erro });
          }
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
          id="telefone"
          rotulo="WhatsApp"
          inputMode="tel"
          autoComplete="tel"
          valor={telefone}
          onChange={setTelefone}
          required
        />
        <CampoTexto
          id="email"
          rotulo="E-mail"
          valor={perfil.email ?? ''}
          onChange={() => undefined}
          disabled
          dica={
            perfil.emailVerified
              ? 'Confirmado. Para trocar o e-mail da conta, fale com a loja.'
              : 'Ainda não confirmado — veja o link que mandamos na sua caixa de entrada.'
          }
        />

        <label className="text-ink-700 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={aceitaMarketing}
            onChange={(evento) => setAceitaMarketing(evento.target.checked)}
            className="mt-1"
          />
          <span>Quero receber cupons e novidades por e-mail.</span>
        </label>

        {retornoDados ? <Mensagem tom={retornoDados.tom}>{retornoDados.texto}</Mensagem> : null}

        <Button type="submit" full>
          Salvar
        </Button>
      </form>

      <TrocarSenha
        temSenha={perfil.temSenha}
        aoTrocar={() => setPerfil({ ...perfil, temSenha: true })}
      />
    </div>
  );
}

/**
 * Conta criada só pelo link de entrada não tem senha: a primeira é definida
 * sem pedir a atual. As outras sessões caem; esta continua aberta.
 */
function TrocarSenha({ temSenha, aoTrocar }: { temSenha: boolean; aoTrocar: () => void }) {
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [retorno, setRetorno] = useState<Retorno>(null);

  return (
    <form
      className="rounded-card space-y-3 bg-white p-4"
      onSubmit={async (evento) => {
        evento.preventDefault();

        const resposta = await chamarConta('/password', {
          method: 'POST',
          body: JSON.stringify({ atual: temSenha ? atual : undefined, nova }),
        });

        if (resposta.ok) {
          setAtual('');
          setNova('');
          setRetorno({
            tom: 'ok',
            texto: 'Senha trocada. Os outros aparelhos vão pedir para entrar de novo.',
          });
          aoTrocar();
        } else {
          setRetorno({ tom: 'erro', texto: resposta.erro });
        }
      }}
    >
      <h2 className="text-ink-900 font-bold">{temSenha ? 'Trocar senha' : 'Criar uma senha'}</h2>

      {!temSenha ? (
        <p className="text-ink-600 text-sm">
          Você entra pelo link do e-mail. Com uma senha, dá para entrar sem abrir a caixa de
          entrada.
        </p>
      ) : (
        <CampoTexto
          id="atual"
          rotulo="Senha atual"
          type="password"
          autoComplete="current-password"
          valor={atual}
          onChange={setAtual}
          required
        />
      )}

      <CampoTexto
        id="nova"
        rotulo="Senha nova"
        type="password"
        autoComplete="new-password"
        dica="Pelo menos 8 caracteres."
        valor={nova}
        onChange={setNova}
        required
      />

      {retorno ? <Mensagem tom={retorno.tom}>{retorno.texto}</Mensagem> : null}

      <Button type="submit" variant="outline" full>
        {temSenha ? 'Trocar senha' : 'Criar senha'}
      </Button>
    </form>
  );
}
