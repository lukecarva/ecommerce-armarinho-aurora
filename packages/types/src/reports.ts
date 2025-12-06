/**
 * Relatórios da loja, compartilhados entre API e painel.
 *
 * A conta mora aqui para que o número da tela, o do CSV e o do dashboard
 * sejam o mesmo número. O que a API faz é buscar as linhas no banco; a
 * classificação, as taxas e o arquivo saem daqui.
 *
 * Duas escolhas atravessam o arquivo:
 *
 * - **O que vale é o valor fechado.** O site calcula uma estimativa, mas a
 *   venda fecha no WhatsApp. Relatório de faturamento que soma estimativa
 *   conta dinheiro que ninguém recebeu.
 * - **Dia é dia da loja.** O corte de "hoje" é meia-noite em São Paulo, não em
 *   UTC — senão o relatório da manhã perde as vendas de ontem à noite.
 */
import { toCsvCell } from './import.js';
import type { Cents } from './money.js';
import { STORE_TIME_ZONE } from './business-hours.js';

// ──────────────────────────────── Períodos ─────────────────────────────────

export const REPORT_RANGES = [
  { key: 'hoje', label: 'Hoje', dias: 0 },
  { key: '7d', label: 'Últimos 7 dias', dias: 6 },
  { key: '30d', label: 'Últimos 30 dias', dias: 29 },
  { key: '90d', label: 'Últimos 90 dias', dias: 89 },
] as const;

export type ReportRangeKey = (typeof REPORT_RANGES)[number]['key'];

export const REPORT_RANGE_KEYS = REPORT_RANGES.map((faixa) => faixa.key) as ReportRangeKey[];

/**
 * O Brasil não tem mais horário de verão desde 2019, então o fuso da loja é
 * -03:00 o ano inteiro. Se um dia voltar, este é o ponto a mudar — e só ele.
 */
const OFFSET_DA_LOJA = '-03:00';

/** A data no calendário da loja, como "2026-09-11". */
export function diaDaLoja(momento: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(momento);
}

/**
 * Início e fim do período, nas bordas do dia da loja.
 *
 * O fim é o último instante do dia corrente, e não "agora": um relatório de
 * 7 dias que termina às 14h esconde as vendas da tarde de quem abrir de novo
 * às 18h, e a loja jura que sumiram pedidos.
 */
export function resolveRange(
  chave: ReportRangeKey,
  agora = new Date(),
): { inicio: Date; fim: Date } {
  const faixa = REPORT_RANGES.find((item) => item.key === chave) ?? REPORT_RANGES[1];

  const hoje = diaDaLoja(agora);
  const fim = new Date(`${hoje}T23:59:59.999${OFFSET_DA_LOJA}`);

  const primeiroDia = new Date(fim);
  primeiroDia.setUTCDate(primeiroDia.getUTCDate() - faixa.dias);

  return { inicio: new Date(`${diaDaLoja(primeiroDia)}T00:00:00.000${OFFSET_DA_LOJA}`), fim };
}

/** Todos os dias do período, em ordem — inclusive os sem venda nenhuma. */
export function diasDoPeriodo(inicio: Date, fim: Date): string[] {
  const dias: string[] = [];
  const cursor = new Date(`${diaDaLoja(inicio)}T12:00:00.000${OFFSET_DA_LOJA}`);
  const ultimo = diaDaLoja(fim);

  // Meio-dia como âncora: somar 24 h a partir da meia-noite tropeça em
  // qualquer mudança de fuso, somar a partir do meio-dia não.
  for (let guarda = 0; guarda < 400; guarda += 1) {
    const dia = diaDaLoja(cursor);
    dias.push(dia);
    if (dia >= ultimo) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dias;
}

/** "11/09" — para o eixo do gráfico, onde o ano só ocupa espaço. */
export function rotuloCurtoDoDia(dia: string): string {
  const [, mes, diaDoMes] = dia.split('-');
  return `${diaDoMes}/${mes}`;
}

// ───────────────────────────────── Funil ───────────────────────────────────

export interface FunilBruto {
  /** Pedidos criados no site. */
  criados: number;
  /** Quantos chegaram a abrir o WhatsApp. */
  whatsapp: number;
  /** Quantos viraram venda (pago, separado, entregue, retirado). */
  fechados: number;
  /** Cancelados e perdidos. */
  perdidos: number;
}

export interface FunilCalculado extends FunilBruto {
  /** Dos criados, quantos abriram a conversa. */
  taxaDeAbertura: number;
  /** Dos que abriram a conversa, quantos fecharam. */
  taxaDeFechamento: number;
  /** Dos criados, quantos viraram venda. */
  taxaGeral: number;
  /** Ainda em atendimento — nem fechados nem perdidos. */
  emAberto: number;
}

/**
 * As taxas do funil.
 *
 * Cada taxa é sobre a etapa anterior, não sobre o topo: misturar as duas faz
 * a loja comemorar uma conversão que não existe. A taxa geral, essa sim sobre
 * o topo, vem separada.
 */
export function calcularFunil(bruto: FunilBruto): FunilCalculado {
  const divisao = (parte: number, todo: number) => (todo > 0 ? parte / todo : 0);

  return {
    ...bruto,
    taxaDeAbertura: divisao(bruto.whatsapp, bruto.criados),
    taxaDeFechamento: divisao(bruto.fechados, bruto.whatsapp),
    taxaGeral: divisao(bruto.fechados, bruto.criados),
    emAberto: Math.max(0, bruto.criados - bruto.fechados - bruto.perdidos),
  };
}

/** "37,5%" — uma casa decimal basta para decidir alguma coisa. */
export function formatarTaxa(taxa: number): string {
  return `${(taxa * 100).toFixed(1).replace('.', ',')}%`;
}

// ────────────────────────────── Curva ABC ──────────────────────────────────

export type ClasseABC = 'A' | 'B' | 'C';

export const ABC_LABELS: Record<ClasseABC, string> = {
  A: 'A — os que pagam a conta',
  B: 'B — o meio',
  C: 'C — cauda longa',
};

/** Os cortes clássicos: 80% da receita em A, os 15% seguintes em B. */
const CORTE_A = 0.8;
const CORTE_B = 0.95;

export interface LinhaDeCurva {
  receita: Cents;
}

export type ComClasse<T> = T & {
  classe: ClasseABC;
  /** Fatia da receita total, de 0 a 1. */
  participacao: number;
  /** Receita acumulada até esta linha, de 0 a 1. */
  acumulado: number;
};

/**
 * Classifica por receita acumulada.
 *
 * O corte é pelo acumulado **antes** da linha entrar: assim um único produto
 * que sozinho passa de 80% ainda é A, em vez de empurrar tudo para B e deixar
 * a classe A vazia — que é o erro clássico desta curva.
 */
export function classificarABC<T extends LinhaDeCurva>(linhas: T[]): Array<ComClasse<T>> {
  const total = linhas.reduce((soma, linha) => soma + linha.receita, 0);
  if (total <= 0) {
    return linhas.map((linha) => ({
      ...linha,
      classe: 'C' as const,
      participacao: 0,
      acumulado: 0,
    }));
  }

  const ordenadas = [...linhas].sort((a, b) => b.receita - a.receita);
  let acumulado = 0;

  return ordenadas.map((linha) => {
    const anterior = acumulado;
    const participacao = linha.receita / total;
    acumulado += participacao;

    const classe: ClasseABC = anterior < CORTE_A ? 'A' : anterior < CORTE_B ? 'B' : 'C';
    return { ...linha, classe, participacao, acumulado };
  });
}

// ──────────────────────────────── CSV ──────────────────────────────────────

/** Sem o BOM, o Excel em português abre o arquivo e destrói os acentos. */
const BOM = String.fromCharCode(0xfeff);

export interface ColunaCsv<T> {
  label: string;
  valor: (linha: T) => unknown;
}

/**
 * Monta o CSV que a loja abre no Excel.
 *
 * Ponto e vírgula porque o Excel em português espera ponto e vírgula, e
 * `toCsvCell` já neutraliza célula que começa com `=`, `+`, `-` ou `@` — sem
 * isso, um nome de produto pode virar fórmula na planilha de quem abrir.
 */
export function montarCsv<T>(colunas: Array<ColunaCsv<T>>, linhas: T[]): string {
  const cabecalho = colunas.map((coluna) => toCsvCell(coluna.label)).join(';');
  const corpo = linhas.map((linha) =>
    colunas.map((coluna) => toCsvCell(coluna.valor(linha))).join(';'),
  );

  return `${BOM}${[cabecalho, ...corpo].join('\r\n')}\r\n`;
}

/** Nome de arquivo com o período embutido: quem baixa dois não os confunde. */
export function nomeDoArquivo(relatorio: string, inicio: Date, fim: Date): string {
  return `${relatorio}-${diaDaLoja(inicio)}-a-${diaDaLoja(fim)}.csv`;
}

// ─────────────────────────── Catálogo de relatórios ────────────────────────

export const REPORTS = [
  {
    key: 'vendas',
    label: 'Vendas por período',
    descricao: 'Pedidos, valor fechado e ticket médio, dia a dia.',
  },
  {
    key: 'funil',
    label: 'Funil do WhatsApp',
    descricao: 'De pedido criado a venda fechada, com as taxas de cada etapa.',
  },
  {
    key: 'abc',
    label: 'Curva ABC',
    descricao: 'Quais produtos pagam a conta e quais só ocupam prateleira.',
  },
  {
    key: 'ruptura',
    label: 'Ruptura de estoque',
    descricao: 'Sem estoque ou abaixo do limiar, com o quanto já foi procurado.',
  },
  {
    key: 'buscas',
    label: 'Buscas sem resultado',
    descricao: 'O que as clientes procuraram e a loja não tinha.',
  },
  {
    key: 'sem-foto',
    label: 'Produtos sem foto',
    descricao: 'Ativos na vitrine sem imagem nenhuma.',
  },
  {
    key: 'sem-venda',
    label: 'Produtos sem venda',
    descricao: 'Ativos que não venderam no período.',
  },
] as const;

export type ReportKey = (typeof REPORTS)[number]['key'];
