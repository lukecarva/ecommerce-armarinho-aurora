import { formatBRL } from '@aurora/types';
import { Badge, Button } from '@aurora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileUp, Package, Undo2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Field, Select, Spinner, Switch, Input } from '../components/ui';
import {
  api,
  type ImportKind,
  type InspecaoResultado,
  type RowAction,
  type RowDiff,
  type SimulacaoResultado,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';

const TIPOS: Array<{ valor: ImportKind; rotulo: string; ajuda: string }> = [
  {
    valor: 'produtos',
    rotulo: 'Cadastro de produtos',
    ajuda: 'Cria e atualiza produtos a partir da exportação do Futura.',
  },
  {
    valor: 'precos',
    rotulo: 'Somente preços',
    ajuda: 'Só mexe em preço. Nome, estoque e conteúdo ficam como estão.',
  },
  {
    valor: 'estoque',
    rotulo: 'Somente estoque',
    ajuda: 'Só mexe em quantidade e disponibilidade.',
  },
];

const ACAO_ROTULO: Record<RowAction, string> = {
  criar: 'Novo',
  atualizar: 'Atualiza',
  sem_mudanca: 'Sem mudança',
  ignorar: 'Ignorado',
  erro: 'Erro',
};

const ACAO_TOM: Record<RowAction, 'stock' | 'brand' | 'neutral' | 'warning' | 'price'> = {
  criar: 'stock',
  atualizar: 'brand',
  sem_mudanca: 'neutral',
  ignorar: 'warning',
  erro: 'price',
};

type Etapa = 'arquivo' | 'mapeamento' | 'simulacao';

export function ImportPage() {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const inputZip = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>('arquivo');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [kind, setKind] = useState<ImportKind>('produtos');
  const [inspecao, setInspecao] = useState<InspecaoResultado | null>(null);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [opcoes, setOpcoes] = useState({
    atualizarNome: false,
    criarAusentes: false,
    markupPercent: 0,
  });
  const [simulacao, setSimulacao] = useState<SimulacaoResultado | null>(null);

  const campos = useQuery({ queryKey: ['import-campos'], queryFn: api.importar.campos });
  const historico = useQuery({
    queryKey: ['import-historico'],
    queryFn: () => api.importar.historico({ perPage: 10 }),
  });

  const inspecionar = useMutation({
    mutationFn: (file: File) => api.importar.inspecionar(file, kind),
    onSuccess: (resultado) => {
      setInspecao(resultado);
      setMapa(resultado.columnMap);
      setEtapa('mapeamento');
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const simular = useMutation({
    mutationFn: () => api.importar.simular(arquivo!, kind, mapa, opcoes),
    onSuccess: (resultado) => {
      setSimulacao(resultado);
      setEtapa('simulacao');
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const aplicar = useMutation({
    mutationFn: (id: string) => api.importar.aplicar(id),
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: ['produtos'] });
      await historico.refetch();
      toast.success(
        `Importação aplicada: ${run.rowsCreated} criados e ${run.rowsUpdated} atualizados.`,
      );
      reiniciar();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const desfazer = useMutation({
    mutationFn: (id: string) => api.importar.desfazer(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['produtos'] });
      await historico.refetch();
      toast.success('Importação desfeita. Os valores voltaram ao que eram.');
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const enviarZip = useMutation({
    mutationFn: (file: File) => api.importar.zip(file),
    onSuccess: async (resultado) => {
      await queryClient.invalidateQueries({ queryKey: ['produtos'] });
      const { imagens } = resultado;
      toast.success(`${imagens.vinculadas} imagem(ns) vinculada(s) aos produtos.`);
      if (imagens.semProduto.length > 0) {
        toast.error(
          `${imagens.semProduto.length} código(s) sem produto no catálogo: ${imagens.semProduto.slice(0, 5).join(', ')}`,
        );
      }
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  function reiniciar() {
    setEtapa('arquivo');
    setArquivo(null);
    setInspecao(null);
    setSimulacao(null);
    setMapa({});
  }

  const camposPermitidos = campos.data?.porTipo[kind] ?? [];
  const podeImportar = can('importacao:criar');

  return (
    <>
      <PageHeader
        title="Importar catálogo"
        description="Traga a planilha do Futura. Nada é gravado antes de você revisar a simulação."
      />

      {/* ── Passo 1: arquivo ─────────────────────────────────────────────── */}
      <Card
        title="1. Arquivo e tipo de importação"
        description="CSV, TXT ou XLSX exportado do Futura. A codificação e o separador são detectados sozinhos."
        className="mb-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="O que esta planilha atualiza"
            hint={TIPOS.find((t) => t.valor === kind)?.ajuda}
          >
            <Select
              value={kind}
              disabled={etapa !== 'arquivo'}
              onChange={(evento) => setKind(evento.target.value as ImportKind)}
            >
              {TIPOS.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {tipo.rotulo}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Planilha">
            <input
              ref={inputArquivo}
              type="file"
              accept=".csv,.txt,.tsv,.xlsx,.xlsm"
              className="hidden"
              onChange={(evento) => {
                const file = evento.target.files?.[0];
                if (file) {
                  setArquivo(file);
                  inspecionar.mutate(file);
                }
                evento.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="secondary"
              full
              disabled={!podeImportar || inspecionar.isPending}
              icon={<FileUp className="size-4" />}
              onClick={() => inputArquivo.current?.click()}
            >
              {inspecionar.isPending
                ? 'Lendo o arquivo…'
                : arquivo
                  ? arquivo.name
                  : 'Escolher planilha'}
            </Button>
          </Field>
        </div>

        {inspecao ? (
          <p className="rounded-button bg-ink-50 text-ink-600 mt-3 px-3 py-2 text-sm">
            {inspecao.totalLinhas} linha(s) · {inspecao.deteccao.formato.toUpperCase()}
            {inspecao.deteccao.encoding ? ` · ${inspecao.deteccao.encoding}` : ''}
            {inspecao.deteccao.delimitador
              ? ` · separado por ${inspecao.deteccao.delimitador}`
              : ''}
          </p>
        ) : null}
      </Card>

      {/* ── Passo 2: mapeamento ──────────────────────────────────────────── */}
      {etapa !== 'arquivo' && inspecao ? (
        <Card
          title="2. De qual coluna vem cada informação"
          description="Preenchemos o que reconhecemos. Confira antes de simular."
          className="mb-5"
          actions={
            <Button
              size="sm"
              disabled={simular.isPending || !podeImportar}
              onClick={() => simular.mutate()}
            >
              {simular.isPending ? 'Simulando…' : 'Simular'}
            </Button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-ink-500 text-left text-xs tracking-wide uppercase">
                <tr>
                  <th className="py-2">Coluna da planilha</th>
                  <th className="py-2">Exemplo</th>
                  <th className="py-2">Campo do catálogo</th>
                </tr>
              </thead>
              <tbody className="divide-ink-200 divide-y">
                {inspecao.headers.map((header) => (
                  <tr key={header}>
                    <td className="text-ink-800 py-2 font-medium">{header}</td>
                    <td className="text-ink-500 max-w-56 truncate py-2">
                      {inspecao.amostra[0]?.[header] ?? '—'}
                    </td>
                    <td className="py-2">
                      <Select
                        className="max-w-56"
                        value={mapa[header] ?? ''}
                        onChange={(evento) =>
                          setMapa((atual) => ({ ...atual, [header]: evento.target.value }))
                        }
                      >
                        <option value="">Não importar</option>
                        {(campos.data?.campos ?? [])
                          .filter((campo) => camposPermitidos.includes(campo.valor))
                          .map((campo) => (
                            <option key={campo.valor} value={campo.valor}>
                              {campo.rotulo}
                            </option>
                          ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-ink-200 mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3">
            <Switch
              label="Criar produtos novos"
              hint="Entram como rascunho, sem aparecer na vitrine"
              checked={opcoes.criarAusentes}
              onChange={(criarAusentes) => setOpcoes((o) => ({ ...o, criarAusentes }))}
            />
            <Switch
              label="Atualizar o nome"
              hint="Sobrescreve nomes já ajustados para a vitrine"
              checked={opcoes.atualizarNome}
              onChange={(atualizarNome) => setOpcoes((o) => ({ ...o, atualizarNome }))}
            />
            <Field
              label="Acréscimo sobre o preço"
              hint="Ex.: 10 para +10%. Deixe 0 para usar o preço do ERP."
            >
              <Input
                type="number"
                step="0.1"
                value={opcoes.markupPercent}
                onChange={(evento) =>
                  setOpcoes((o) => ({ ...o, markupPercent: Number(evento.target.value) }))
                }
              />
            </Field>
          </div>
        </Card>
      ) : null}

      {/* ── Passo 3: simulação ───────────────────────────────────────────── */}
      {etapa === 'simulacao' && simulacao ? (
        <Card
          title="3. O que vai acontecer"
          description="Nada foi gravado ainda. Revise e confirme."
          className="mb-5"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={reiniciar}>
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={
                  aplicar.isPending || simulacao.resumo.criar + simulacao.resumo.atualizar === 0
                }
                onClick={() => aplicar.mutate(simulacao.runId)}
              >
                {aplicar.isPending ? 'Aplicando…' : 'Aplicar importação'}
              </Button>
            </div>
          }
        >
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Contador rotulo="Novos" valor={simulacao.resumo.criar} tom="stock" />
            <Contador rotulo="Atualizados" valor={simulacao.resumo.atualizar} tom="brand" />
            <Contador rotulo="Sem mudança" valor={simulacao.resumo.semMudanca} tom="neutral" />
            <Contador rotulo="Ignorados" valor={simulacao.resumo.ignorar} tom="warning" />
            <Contador rotulo="Com erro" valor={simulacao.resumo.erro} tom="price" />
          </div>

          {simulacao.categoriasDesconhecidas.length > 0 ? (
            <Aviso>
              Categorias que não existem no catálogo e serão ignoradas:{' '}
              {simulacao.categoriasDesconhecidas.join(', ')}
            </Aviso>
          ) : null}

          {simulacao.resumo.duplicados.length > 0 ? (
            <Aviso>
              Códigos repetidos na planilha (vale a última linha):{' '}
              {simulacao.resumo.duplicados.slice(0, 10).join(', ')}
            </Aviso>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="text-ink-500 text-left text-xs tracking-wide uppercase">
                <tr>
                  <th className="py-2">Linha</th>
                  <th className="py-2">Código</th>
                  <th className="py-2">Produto</th>
                  <th className="py-2">O que muda</th>
                </tr>
              </thead>
              <tbody className="divide-ink-200 divide-y">
                {simulacao.previa.map((linha) => (
                  <LinhaDoDiff key={linha.linha} linha={linha} />
                ))}
              </tbody>
            </table>
          </div>

          {simulacao.resumo.total > simulacao.previa.length ? (
            <p className="text-ink-500 mt-3 text-sm">
              Mostrando as primeiras {simulacao.previa.length} de {simulacao.resumo.total} linhas.
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* ── ZIP com fotos ────────────────────────────────────────────────── */}
      <Card
        title="Fotos em lote"
        description="Um ZIP com as imagens nomeadas pelo código do produto: 12345.jpg, 12345_2.jpg."
        className="mb-5"
        actions={
          <>
            <input
              ref={inputZip}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(evento) => {
                const file = evento.target.files?.[0];
                if (file) enviarZip.mutate(file);
                evento.target.value = '';
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={!podeImportar || enviarZip.isPending}
              icon={<Upload className="size-4" />}
              onClick={() => inputZip.current?.click()}
            >
              {enviarZip.isPending ? 'Processando…' : 'Enviar ZIP'}
            </Button>
          </>
        }
      >
        {enviarZip.data ? (
          <div className="text-ink-600 space-y-1 text-sm">
            <p>
              <strong className="text-ink-800">{enviarZip.data.imagens.vinculadas}</strong>{' '}
              imagem(ns) vinculada(s).
            </p>
            {enviarZip.data.imagens.semProduto.length > 0 ? (
              <p className="text-price-600">
                Sem produto correspondente: {enviarZip.data.imagens.semProduto.join(', ')}
              </p>
            ) : null}
            {enviarZip.data.ignorados.length > 0 ? (
              <p className="text-ink-500">Ignorados: {enviarZip.data.ignorados.join(', ')}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-ink-500 text-sm">
            É assim que a carga inicial de fotos acontece sem trabalho manual.
          </p>
        )}
      </Card>

      {/* ── Histórico ────────────────────────────────────────────────────── */}
      <Card title="Importações recentes">
        {historico.isLoading ? (
          <Spinner />
        ) : (historico.data?.items ?? []).length === 0 ? (
          <EmptyState title="Nenhuma importação ainda" />
        ) : (
          <ul className="divide-ink-200 divide-y">
            {(historico.data?.items ?? []).map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-3 py-3">
                <Package className="text-ink-400 size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-ink-800 flex flex-wrap items-center gap-2 font-medium">
                    {run.filename}
                    <Badge tone={run.status === 'concluido' ? 'stock' : 'neutral'}>
                      {run.status}
                    </Badge>
                  </p>
                  <p className="text-ink-500 text-xs">
                    {formatDateTime(run.startedAt)}
                    {run.actorName ? ` · ${run.actorName}` : ''} · {run.rowsCreated} criados,{' '}
                    {run.rowsUpdated} atualizados, {run.rowsError} com erro
                  </p>
                </div>

                {run.status === 'concluido' && can('importacao:editar') ? (
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Undo2 className="size-4" />}
                    disabled={desfazer.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Desfazer esta importação? Os preços e estoques voltam ao valor anterior.',
                        )
                      ) {
                        desfazer.mutate(run.id);
                      }
                    }}
                  >
                    Desfazer
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

const TONS = {
  stock: 'bg-stock-50 text-stock-600',
  brand: 'bg-brand-50 text-brand-700',
  neutral: 'bg-ink-100 text-ink-600',
  warning: 'bg-accent-50 text-accent-700',
  price: 'bg-price-50 text-price-600',
} as const;

function Contador({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom: keyof typeof TONS;
}) {
  return (
    <div className={`rounded-card px-3 py-2 ${TONS[tom]}`}>
      <p className="text-xl font-bold">{valor}</p>
      <p className="text-xs font-medium">{rotulo}</p>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-button bg-accent-50 text-accent-700 mb-3 flex items-start gap-2 px-3 py-2 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function LinhaDoDiff({ linha }: { linha: RowDiff }) {
  return (
    <tr>
      <td className="text-ink-500 py-2">{linha.linha}</td>
      <td className="text-ink-700 py-2 font-medium">{linha.skuFutura ?? '—'}</td>
      <td className="text-ink-800 max-w-64 truncate py-2">{linha.nome ?? '—'}</td>
      <td className="py-2">
        <Badge tone={ACAO_TOM[linha.acao]}>{ACAO_ROTULO[linha.acao]}</Badge>

        <div className="mt-1 space-y-0.5">
          {Object.entries(linha.mudancas).map(([campo, mudanca]) => (
            <p key={campo} className="text-ink-600 text-xs">
              <span className="font-medium">{campo}:</span>{' '}
              <span className="text-ink-400 line-through">{formatar(campo, mudanca.de)}</span> →{' '}
              {formatar(campo, mudanca.para)}
            </p>
          ))}
          {linha.erros.map((erro) => (
            <p key={erro} className="text-price-600 text-xs">
              {erro}
            </p>
          ))}
          {linha.avisos.map((aviso) => (
            <p key={aviso} className="text-accent-700 text-xs">
              {aviso}
            </p>
          ))}
        </div>
      </td>
    </tr>
  );
}

/** Preço aparece em reais; o resto, como está. */
function formatar(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if ((campo === 'price' || campo === 'promoPrice') && typeof valor === 'number') {
    return formatBRL(valor);
  }
  return String(valor);
}
