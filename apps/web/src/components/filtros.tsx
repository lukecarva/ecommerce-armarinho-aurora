'use client';

import { AVAILABILITY_LABELS, formatBRL } from '@aurora/types';
import { Button, cn } from '@aurora/ui';
import { SlidersHorizontal, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import type { AvailabilityValue, Facetas } from '@/lib/api';

/**
 * Filtros e ordenação da listagem.
 *
 * O estado vive na URL, não no componente. Isso faz o filtro sobreviver ao
 * voltar do navegador e, principalmente, torna o resultado compartilhável:
 * a cliente manda o link de "tricoline 1,50m em estoque" no grupo do
 * WhatsApp e a pessoa do outro lado abre exatamente a mesma lista.
 */

const ROTULOS: Record<string, string> = {
  largura: 'Largura',
  composicao: 'Composição',
  cor: 'Cor',
  gramatura: 'Gramatura',
  metragem: 'Metragem',
  marca: 'Marca',
};

const ORDENACOES = [
  { valor: 'relevancia', rotulo: 'Mais relevantes' },
  { valor: 'menor-preco', rotulo: 'Menor preço' },
  { valor: 'maior-preco', rotulo: 'Maior preço' },
  { valor: 'novidades', rotulo: 'Novidades' },
  { valor: 'nome', rotulo: 'Nome (A–Z)' },
] as const;

export function BarraDeFiltros({
  facetas,
  total,
  layout,
  onLayoutChange,
}: {
  facetas: Facetas;
  total: number;
  layout: 'grade' | 'lista';
  onLayoutChange: (layout: 'grade' | 'lista') => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [aberto, setAberto] = useState(false);

  /** Troca um parâmetro e sempre volta para a primeira página. */
  const aplicar = useCallback(
    (mudancas: Record<string, string | null>) => {
      const proximos = new URLSearchParams(params.toString());

      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === null || valor === '') proximos.delete(chave);
        else proximos.set(chave, valor);
      }

      proximos.delete('page');
      router.push(`${pathname}?${proximos.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  /**
   * Liga e desliga um valor de atributo.
   *
   * Cada valor é um parâmetro repetido, nunca uma lista separada por vírgula:
   * "1,50m" é um valor só, e dividir por vírgula o quebraria em dois.
   */
  const alternarAtributo = useCallback(
    (chave: string, valor: string) => {
      const nome = `attr.${chave}`;
      const atual = params.getAll(nome);
      const proximo = atual.includes(valor)
        ? atual.filter((item) => item !== valor)
        : [...atual, valor];

      const proximos = new URLSearchParams(params.toString());
      proximos.delete(nome);
      for (const item of proximo) proximos.append(nome, item);
      proximos.delete('page');

      router.push(`${pathname}?${proximos.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const disponibilidadeAtual = (params.get('disponibilidade') ?? '').split(',').filter(Boolean);

  const filtrosAtivos = [...params.entries()].filter(
    ([chave]) => chave.startsWith('attr.') || chave === 'disponibilidade',
  ).length;

  const temFiltros =
    Object.keys(facetas.atributos).length > 0 || facetas.disponibilidade.length > 1;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {temFiltros ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAberto(true)}
            icon={<SlidersHorizontal className="size-4" aria-hidden />}
          >
            Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ''}
          </Button>
        ) : null}

        <label className="sr-only" htmlFor="ordenar">
          Ordenar
        </label>
        <select
          id="ordenar"
          value={params.get('ordenar') ?? 'relevancia'}
          onChange={(evento) => aplicar({ ordenar: evento.target.value })}
          className="rounded-button border-ink-300 text-ink-700 h-9 border bg-white px-3 text-sm"
        >
          {ORDENACOES.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>

        <span className="text-ink-500 text-sm">{total} produto(s)</span>

        <div className="ml-auto flex gap-1">
          <BotaoDeLayout ativo={layout === 'grade'} onClick={() => onLayoutChange('grade')}>
            Grade
          </BotaoDeLayout>
          <BotaoDeLayout ativo={layout === 'lista'} onClick={() => onLayoutChange('lista')}>
            Lista
          </BotaoDeLayout>
        </div>
      </div>

      {filtrosAtivos > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {[...params.entries()]
            .filter(([chave]) => chave.startsWith('attr.') || chave === 'disponibilidade')
            .flatMap(([chave, valor]) =>
              // Só a disponibilidade usa lista separada por vírgula: seus
              // valores são identificadores fixos, sem vírgula dentro.
              chave === 'disponibilidade'
                ? valor.split(',').map((item) => ({ chave, item }))
                : [{ chave, item: valor }],
            )
            .map(({ chave, item }) => (
              <button
                key={`${chave}-${item}`}
                type="button"
                onClick={() => {
                  if (chave === 'disponibilidade') {
                    const restante = disponibilidadeAtual.filter((valor) => valor !== item);
                    aplicar({ disponibilidade: restante.join(',') || null });
                  } else {
                    alternarAtributo(chave.slice(5), item);
                  }
                }}
                className="bg-brand-50 text-brand-700 rounded-pill inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium"
              >
                {chave === 'disponibilidade'
                  ? AVAILABILITY_LABELS[item as AvailabilityValue]
                  : item}
                <X className="size-3" aria-hidden />
              </button>
            ))}

          <button
            type="button"
            onClick={() => router.push(pathname, { scroll: false })}
            className="text-ink-500 px-2 text-xs underline"
          >
            Limpar tudo
          </button>
        </div>
      ) : null}

      {aberto ? (
        <div className="bg-ink-900/40 fixed inset-0 z-50 flex justify-end">
          <div className="flex h-full w-full max-w-sm flex-col bg-white">
            <header className="border-ink-200 flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-ink-800 font-semibold">Filtros</h2>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar filtros">
                <X className="text-ink-500 size-5" aria-hidden />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {facetas.disponibilidade.length > 1 ? (
                <Grupo titulo="Disponibilidade">
                  {facetas.disponibilidade.map((opcao) => (
                    <Opcao
                      key={opcao.valor}
                      rotulo={AVAILABILITY_LABELS[opcao.valor as AvailabilityValue]}
                      total={opcao.total}
                      marcada={disponibilidadeAtual.includes(opcao.valor)}
                      onChange={() => {
                        const proximo = disponibilidadeAtual.includes(opcao.valor)
                          ? disponibilidadeAtual.filter((item) => item !== opcao.valor)
                          : [...disponibilidadeAtual, opcao.valor];
                        aplicar({ disponibilidade: proximo.join(',') || null });
                      }}
                    />
                  ))}
                </Grupo>
              ) : null}

              {Object.entries(facetas.atributos).map(([chave, valores]) => (
                <Grupo key={chave} titulo={ROTULOS[chave] ?? chave}>
                  {valores.map((opcao) => (
                    <Opcao
                      key={opcao.valor}
                      rotulo={opcao.valor}
                      total={opcao.total}
                      marcada={(params.get(`attr.${chave}`) ?? '').split(',').includes(opcao.valor)}
                      onChange={() => alternarAtributo(chave, opcao.valor)}
                    />
                  ))}
                </Grupo>
              ))}

              {facetas.preco.max > facetas.preco.min ? (
                <p className="text-ink-500 mt-4 text-xs">
                  Preços de {formatBRL(facetas.preco.min)} a {formatBRL(facetas.preco.max)}.
                </p>
              ) : null}
            </div>

            <footer className="border-ink-200 border-t p-4">
              <Button full onClick={() => setAberto(false)}>
                Ver {total} produto(s)
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BotaoDeLayout({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded-button px-2.5 py-1.5 text-xs font-medium',
        ativo ? 'bg-brand-600 text-white' : 'text-ink-600 border-ink-300 border bg-white',
      )}
    >
      {children}
    </button>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-ink-200 mb-4 border-b pb-4 last:border-0">
      <h3 className="text-ink-500 mb-2 text-xs font-semibold tracking-wide uppercase">{titulo}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Opcao({
  rotulo,
  total,
  marcada,
  onChange,
}: {
  rotulo: string;
  total: number;
  marcada: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={marcada} onChange={onChange} />
      <span className="text-ink-700 flex-1">{rotulo}</span>
      <span className="text-ink-400 text-xs">{total}</span>
    </label>
  );
}
