import {
  ABC_LABELS,
  formatarTaxa,
  formatBRL,
  REPORT_RANGES,
  REPORTS,
  type ReportKey,
  type ReportRangeKey,
} from '@aurora/types';
import { Badge, Button } from '@aurora/ui';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Funil } from '../components/grafico';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Select, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';

/**
 * Relatórios.
 *
 * Cada um responde a uma pergunta que a loja faz em voz alta: "quanto
 * vendemos?", "onde o pessoal desiste?", "o que paga a conta?", "o que estão
 * procurando e não temos?".
 *
 * O CSV sai da mesma rota que alimenta a tela, então a planilha baixada nunca
 * diverge do que está na frente de quem clicou.
 */
export function ReportsPage() {
  const toast = useToast();
  const [relatorio, setRelatorio] = useState<ReportKey>('vendas');
  const [periodo, setPeriodo] = useState<ReportRangeKey>('30d');
  const [baixando, setBaixando] = useState(false);

  const dados = useQuery({
    queryKey: ['relatorio', relatorio, periodo],
    queryFn: () => api.relatorios.dados(relatorio, periodo),
  });

  const atual = REPORTS.find((item) => item.key === relatorio)!;

  async function baixar() {
    setBaixando(true);
    try {
      await api.relatorios.baixarCsv(relatorio, periodo);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : 'Não consegui gerar o arquivo.');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Relatórios"
        description={atual.descricao}
        actions={
          <Button
            size="sm"
            variant="outline"
            icon={<Download className="size-4" aria-hidden />}
            onClick={() => void baixar()}
            disabled={baixando}
          >
            {baixando ? 'Gerando…' : 'Baixar CSV'}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          value={relatorio}
          onChange={(evento) => setRelatorio(evento.target.value as ReportKey)}
          className="max-w-xs"
          aria-label="Relatório"
        >
          {REPORTS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </Select>

        <Select
          value={periodo}
          onChange={(evento) => setPeriodo(evento.target.value as ReportRangeKey)}
          className="max-w-[12rem]"
          aria-label="Período"
          disabled={relatorio === 'ruptura' || relatorio === 'sem-foto'}
        >
          {REPORT_RANGES.map((faixa) => (
            <option key={faixa.key} value={faixa.key}>
              {faixa.label}
            </option>
          ))}
        </Select>
      </div>

      {dados.isLoading ? <Spinner /> : <Conteudo relatorio={relatorio} dados={dados.data} />}
    </>
  );
}

function Conteudo({ relatorio, dados }: { relatorio: ReportKey; dados: unknown }) {
  if (!dados) return <EmptyState title="Sem dados no período." />;

  if (relatorio === 'vendas') {
    const vendas = dados as {
      serie: Array<{
        dia: string;
        pedidos: number;
        ganhos: number;
        estimado: number;
        fechado: number;
      }>;
      total: {
        pedidos: number;
        ganhos: number;
        estimado: number;
        fechado: number;
        ticketMedio: number;
      };
    };

    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Numero titulo="Pedidos" valor={String(vendas.total.pedidos)} />
          <Numero titulo="Vendas fechadas" valor={String(vendas.total.ganhos)} />
          <Numero titulo="Faturamento" valor={formatBRL(vendas.total.fechado)} />
          <Numero titulo="Ticket médio" valor={formatBRL(vendas.total.ticketMedio)} />
        </div>

        <Tabela
          colunas={['Dia', 'Pedidos', 'Fechados', 'Estimado', 'Faturado']}
          linhas={vendas.serie
            .filter((dia) => dia.pedidos > 0)
            .reverse()
            .map((dia) => [
              dia.dia.split('-').reverse().slice(0, 2).join('/'),
              dia.pedidos,
              dia.ganhos,
              formatBRL(dia.estimado),
              formatBRL(dia.fechado),
            ])}
          vazio="Nenhum pedido no período."
        />
      </div>
    );
  }

  if (relatorio === 'funil') {
    const funil = dados as {
      criados: number;
      whatsapp: number;
      fechados: number;
      perdidos: number;
      emAberto: number;
      taxaDeAbertura: number;
      taxaDeFechamento: number;
      taxaGeral: number;
      motivosDePerda: Array<{ motivo: string; pedidos: number }>;
    };

    return (
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card title="Do site até a venda">
          <Funil
            etapas={[
              { nome: 'Pedidos criados no site', pedidos: funil.criados },
              {
                nome: 'Abriram o WhatsApp',
                pedidos: funil.whatsapp,
                detalhe: formatarTaxa(funil.taxaDeAbertura),
              },
              {
                nome: 'Viraram venda',
                pedidos: funil.fechados,
                detalhe: formatarTaxa(funil.taxaDeFechamento),
              },
              { nome: 'Perdidos', pedidos: funil.perdidos },
              { nome: 'Ainda em atendimento', pedidos: funil.emAberto },
            ]}
          />
          <p className="text-ink-500 mt-4 text-xs">
            Cada taxa é sobre a etapa anterior. Do total de pedidos criados,{' '}
            <strong>{formatarTaxa(funil.taxaGeral)}</strong> viraram venda.
          </p>
        </Card>

        <Card title="Por que perdemos">
          <Tabela
            colunas={['Motivo', 'Pedidos']}
            linhas={funil.motivosDePerda.map((motivo) => [motivo.motivo, motivo.pedidos])}
            vazio="Nenhum pedido perdido no período."
          />
        </Card>
      </div>
    );
  }

  if (relatorio === 'abc') {
    const curva = dados as Array<{
      classe: 'A' | 'B' | 'C';
      produto: string;
      sku: string | null;
      receita: number;
      quantidade: number;
      pedidos: number;
      participacao: number;
      acumulado: number;
    }>;

    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {(['A', 'B', 'C'] as const).map((classe) => {
            const linhas = curva.filter((linha) => linha.classe === classe);
            const receita = linhas.reduce((soma, linha) => soma + linha.receita, 0);
            return (
              <Numero
                key={classe}
                titulo={ABC_LABELS[classe]}
                valor={`${linhas.length} produtos`}
                detalhe={formatBRL(receita)}
              />
            );
          })}
        </div>

        <Tabela
          colunas={['Classe', 'Produto', 'Receita', 'Qtd.', 'Participação', 'Acumulado']}
          linhas={curva.map((linha) => [
            <Badge
              key="c"
              tone={linha.classe === 'A' ? 'stock' : linha.classe === 'B' ? 'brand' : 'neutral'}
            >
              {linha.classe}
            </Badge>,
            linha.produto,
            formatBRL(linha.receita),
            linha.quantidade,
            formatarTaxa(linha.participacao),
            formatarTaxa(linha.acumulado),
          ])}
          vazio="Nenhuma venda no período."
        />
      </div>
    );
  }

  if (relatorio === 'ruptura') {
    const linhas = dados as Array<{
      produto: string;
      variacao: string | null;
      qty: string;
      limiar: string;
      favoritos: number;
    }>;

    return (
      <Tabela
        colunas={['Produto', 'Variação', 'Estoque', 'Limiar', 'Favoritado por']}
        linhas={linhas.map((linha) => [
          linha.produto,
          linha.variacao ?? '—',
          Number(linha.qty) <= 0 ? (
            <Badge key="z" tone="warning">
              esgotado
            </Badge>
          ) : (
            linha.qty
          ),
          linha.limiar,
          linha.favoritos,
        ])}
        vazio="Nada abaixo do limiar. Estoque saudável."
      />
    );
  }

  if (relatorio === 'buscas') {
    const linhas = dados as Array<{ termo: string; buscas: number; ultima: string }>;

    return (
      <Tabela
        colunas={['Procuraram por', 'Vezes', 'Última vez']}
        linhas={linhas.map((linha) => [
          linha.termo,
          linha.buscas,
          new Date(linha.ultima).toLocaleDateString('pt-BR'),
        ])}
        vazio="Toda busca do período encontrou alguma coisa."
      />
    );
  }

  if (relatorio === 'sem-foto') {
    const linhas = dados as Array<{
      produto: string;
      categoria: string | null;
      preco: number;
      criadoEm: string;
    }>;

    return (
      <Tabela
        colunas={['Produto', 'Categoria', 'Preço', 'Cadastrado em']}
        linhas={linhas.map((linha) => [
          linha.produto,
          linha.categoria ?? '—',
          formatBRL(linha.preco),
          new Date(linha.criadoEm).toLocaleDateString('pt-BR'),
        ])}
        vazio="Todo produto ativo tem foto."
      />
    );
  }

  const linhas = dados as Array<{
    produto: string;
    categoria: string | null;
    preco: string;
    favoritos: number;
  }>;

  return (
    <Tabela
      colunas={['Produto', 'Categoria', 'Preço', 'Favoritado por']}
      linhas={linhas.map((linha) => [
        linha.produto,
        linha.categoria ?? '—',
        `R$ ${linha.preco.replace('.', ',')}`,
        linha.favoritos,
      ])}
      vazio="Todo produto ativo vendeu no período."
    />
  );
}

function Numero({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <Card className="p-4">
      <p className="text-ink-500 text-xs">{titulo}</p>
      <p className="text-ink-900 text-xl font-bold">{valor}</p>
      {detalhe ? <p className="text-ink-500 text-xs">{detalhe}</p> : null}
    </Card>
  );
}

function Tabela({
  colunas,
  linhas,
  vazio,
}: {
  colunas: string[];
  linhas: Array<Array<React.ReactNode>>;
  vazio: string;
}) {
  if (linhas.length === 0) return <EmptyState title={vazio} />;

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="bg-ink-50 text-ink-500 text-left text-xs uppercase">
          <tr>
            {colunas.map((coluna) => (
              <th key={coluna} className="px-3 py-2">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-ink-200 divide-y">
          {linhas.map((linha, indice) => (
            <tr key={indice} className="hover:bg-ink-50">
              {linha.map((celula, coluna) => (
                <td key={coluna} className="px-3 py-2">
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
