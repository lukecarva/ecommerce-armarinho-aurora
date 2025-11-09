'use client';

import { formatAddressLine, formatCep, isValidCep, UFS } from '@aurora/types';
import { Button } from '@aurora/ui';
import { MapPin, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AreaDaConta, CampoTexto, ExigeConta, Mensagem } from '@/components/conta-ui';
import { chamarConta } from '@/lib/conta';

interface Endereco {
  id: string;
  label: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  uf: string;
  reference: string | null;
  isDefault: boolean;
}

type Rascunho = Omit<Endereco, 'id' | 'isDefault' | 'label' | 'complement' | 'reference'> & {
  label: string;
  complement: string;
  reference: string;
  isDefault: boolean;
};

const VAZIO: Rascunho = {
  label: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: 'São Paulo',
  uf: 'SP',
  reference: '',
  isDefault: false,
};

export default function EnderecosPage() {
  return (
    <AreaDaConta titulo="Endereços">
      <ExigeConta>
        <Enderecos />
      </ExigeConta>
    </AreaDaConta>
  );
}

function Enderecos() {
  const [lista, setLista] = useState<Endereco[] | null>(null);
  const [editando, setEditando] = useState<{ id: string | null; dados: Rascunho } | null>(null);

  async function carregar() {
    const resposta = await chamarConta<Endereco[]>('/addresses');
    if (resposta.ok) setLista(resposta.dados);
  }

  useEffect(() => {
    void carregar();
  }, []);

  if (!lista) return <p className="text-ink-500 text-sm">Carregando…</p>;

  return (
    <div className="max-w-lg space-y-3">
      <p className="text-ink-500 text-sm">
        O endereço adianta o trabalho da loja na entrega por motoboy. O valor da entrega é combinado
        pelo WhatsApp.
      </p>

      {lista.map((endereco) => (
        <article key={endereco.id} className="rounded-card shadow-card bg-white p-4">
          <div className="flex items-start gap-3">
            <MapPin className="text-brand-600 mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-ink-900 text-sm font-semibold">
                {endereco.label ?? 'Endereço'}
                {endereco.isDefault ? (
                  <span className="bg-brand-50 text-brand-700 rounded-pill ml-2 px-2 py-0.5 text-xs">
                    padrão
                  </span>
                ) : null}
              </p>
              <p className="text-ink-600 text-sm">{formatAddressLine(endereco)}</p>
              <p className="text-ink-400 text-xs">CEP {formatCep(endereco.cep)}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<Pencil className="size-4" aria-hidden />}
              onClick={() =>
                setEditando({
                  id: endereco.id,
                  dados: {
                    ...endereco,
                    label: endereco.label ?? '',
                    complement: endereco.complement ?? '',
                    reference: endereco.reference ?? '',
                  },
                })
              }
            >
              Editar
            </Button>
            {!endereco.isDefault ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const resposta = await chamarConta<Endereco[]>(
                    `/addresses/${endereco.id}/default`,
                    {
                      method: 'POST',
                    },
                  );
                  if (resposta.ok) setLista(resposta.dados);
                }}
              >
                Tornar padrão
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-4" aria-hidden />}
              onClick={async () => {
                const resposta = await chamarConta<Endereco[]>(`/addresses/${endereco.id}`, {
                  method: 'DELETE',
                });
                if (resposta.ok) setLista(resposta.dados);
              }}
            >
              Remover
            </Button>
          </div>
        </article>
      ))}

      {editando ? (
        <FormEndereco
          inicial={editando.dados}
          id={editando.id}
          aoSalvar={async () => {
            setEditando(null);
            await carregar();
          }}
          aoCancelar={() => setEditando(null)}
        />
      ) : (
        <Button full variant="outline" onClick={() => setEditando({ id: null, dados: VAZIO })}>
          Adicionar endereço
        </Button>
      )}
    </div>
  );
}

function FormEndereco({
  inicial,
  id,
  aoSalvar,
  aoCancelar,
}: {
  inicial: Rascunho;
  id: string | null;
  aoSalvar: () => Promise<void>;
  aoCancelar: () => void;
}) {
  const [dados, setDados] = useState<Rascunho>(inicial);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function campo<K extends keyof Rascunho>(chave: K) {
    return (valor: Rascunho[K]) => setDados((atual) => ({ ...atual, [chave]: valor }));
  }

  /**
   * Preenche rua, bairro e cidade a partir do CEP.
   *
   * Só completa o que estiver vazio ou for o que o próprio CEP tinha posto:
   * quem já corrigiu o nome da rua à mão não pode perder a correção porque
   * saiu do campo do CEP de novo.
   */
  async function completarPeloCep(cep: string) {
    if (!isValidCep(cep)) return;

    setBuscandoCep(true);
    const resposta = await chamarConta<{
      endereco: { street: string; district: string; city: string; uf: string } | null;
    }>(`/cep/${cep.replace(/\D/g, '')}`);
    setBuscandoCep(false);

    const endereco = resposta.ok ? resposta.dados.endereco : null;
    if (!endereco) return;

    setDados((atual) => ({
      ...atual,
      street: atual.street || endereco.street,
      district: atual.district || endereco.district,
      city: endereco.city || atual.city,
      uf: endereco.uf || atual.uf,
    }));
  }

  return (
    <form
      className="rounded-card space-y-3 bg-white p-4"
      onSubmit={async (evento) => {
        evento.preventDefault();
        setErro(null);

        const resposta = await chamarConta(id ? `/addresses/${id}` : '/addresses', {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(dados),
        });

        if (resposta.ok) await aoSalvar();
        else setErro(resposta.erro);
      }}
    >
      <h2 className="text-ink-900 font-bold">{id ? 'Editar endereço' : 'Novo endereço'}</h2>

      <CampoTexto
        id="cep"
        rotulo="CEP"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        valor={dados.cep}
        onChange={campo('cep')}
        onBlur={(evento) => void completarPeloCep(evento.target.value)}
        dica={buscandoCep ? 'Buscando o endereço…' : 'A rua e o bairro vêm sozinhos.'}
        required
      />
      <CampoTexto
        id="street"
        rotulo="Rua"
        autoComplete="address-line1"
        valor={dados.street}
        onChange={campo('street')}
        required
      />

      <div className="grid grid-cols-[7rem_1fr] gap-3">
        <CampoTexto
          id="number"
          rotulo="Número"
          valor={dados.number}
          onChange={campo('number')}
          required
        />
        <CampoTexto
          id="complement"
          rotulo="Complemento"
          autoComplete="address-line2"
          valor={dados.complement}
          onChange={campo('complement')}
        />
      </div>

      <CampoTexto
        id="district"
        rotulo="Bairro"
        valor={dados.district}
        onChange={campo('district')}
        required
      />

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <CampoTexto
          id="city"
          rotulo="Cidade"
          autoComplete="address-level2"
          valor={dados.city}
          onChange={campo('city')}
          required
        />
        <div>
          <label htmlFor="uf" className="text-ink-700 mb-1 block text-sm font-medium">
            UF
          </label>
          <select
            id="uf"
            value={dados.uf}
            onChange={(evento) => campo('uf')(evento.target.value)}
            className="rounded-button border-ink-300 text-ink-900 h-11 w-full border bg-white px-2 text-base"
          >
            {UFS.map((uf) => (
              <option key={uf}>{uf}</option>
            ))}
          </select>
        </div>
      </div>

      <CampoTexto
        id="reference"
        rotulo="Ponto de referência"
        placeholder="Portão azul, perto da padaria"
        valor={dados.reference}
        onChange={campo('reference')}
      />
      <CampoTexto
        id="label"
        rotulo="Apelido"
        placeholder="Casa, ateliê…"
        valor={dados.label}
        onChange={campo('label')}
      />

      <label className="text-ink-700 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={dados.isDefault}
          onChange={(evento) => campo('isDefault')(evento.target.checked)}
        />
        Usar como endereço padrão
      </label>

      {erro ? <Mensagem tom="erro">{erro}</Mensagem> : null}

      <div className="flex gap-2">
        <Button type="submit" full>
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={aoCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
