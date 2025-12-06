import { describe, expect, it } from 'vitest';
import {
  calcularFunil,
  classificarABC,
  diaDaLoja,
  diasDoPeriodo,
  formatarTaxa,
  montarCsv,
  nomeDoArquivo,
  resolveRange,
} from './reports.js';

describe('período', () => {
  it('usa o dia da loja, não o dia em UTC', () => {
    // 11/09 às 23h em São Paulo já é 12/09 em UTC. O relatório da loja tem
    // de continuar dizendo 11/09, senão a venda da noite cai no dia seguinte.
    expect(diaDaLoja(new Date('2026-09-12T02:00:00Z'))).toBe('2026-09-11');
  });

  it('vai até o fim do dia corrente, não até o instante da consulta', () => {
    const { inicio, fim } = resolveRange('hoje', new Date('2026-09-11T17:00:00Z'));

    expect(inicio.toISOString()).toBe('2026-09-11T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-09-12T02:59:59.999Z');
  });

  it('conta sete dias incluindo hoje', () => {
    const { inicio, fim } = resolveRange('7d', new Date('2026-09-11T17:00:00Z'));

    expect(diaDaLoja(inicio)).toBe('2026-09-05');
    expect(diaDaLoja(fim)).toBe('2026-09-11');
    expect(diasDoPeriodo(inicio, fim)).toHaveLength(7);
  });

  it('lista todos os dias do período, inclusive os sem venda', () => {
    const dias = diasDoPeriodo(new Date('2026-09-09T12:00:00Z'), new Date('2026-09-11T12:00:00Z'));

    expect(dias).toEqual(['2026-09-09', '2026-09-10', '2026-09-11']);
  });
});

describe('funil', () => {
  it('mede cada etapa sobre a anterior, e a geral sobre o topo', () => {
    const funil = calcularFunil({ criados: 100, whatsapp: 60, fechados: 30, perdidos: 20 });

    expect(formatarTaxa(funil.taxaDeAbertura)).toBe('60,0%');
    expect(formatarTaxa(funil.taxaDeFechamento)).toBe('50,0%');
    expect(formatarTaxa(funil.taxaGeral)).toBe('30,0%');
    expect(funil.emAberto).toBe(50);
  });

  it('não divide por zero num período sem pedido nenhum', () => {
    const funil = calcularFunil({ criados: 0, whatsapp: 0, fechados: 0, perdidos: 0 });

    expect(funil.taxaDeAbertura).toBe(0);
    expect(funil.taxaGeral).toBe(0);
    expect(funil.emAberto).toBe(0);
  });
});

describe('curva ABC', () => {
  it('classifica pelo acumulado antes da linha entrar', () => {
    // O primeiro produto sozinho passa de 80%. Ele tem de continuar sendo A:
    // classificar pelo acumulado depois deixaria a classe A vazia.
    const curva = classificarABC([
      { sku: 'dominante', receita: 9000 },
      { sku: 'segundo', receita: 700 },
      { sku: 'terceiro', receita: 300 },
    ]);

    expect(curva.map((linha) => [linha.sku, linha.classe])).toEqual([
      ['dominante', 'A'],
      ['segundo', 'B'],
      ['terceiro', 'C'],
    ]);
  });

  it('ordena da maior receita para a menor', () => {
    const curva = classificarABC([
      { sku: 'pequeno', receita: 100 },
      { sku: 'grande', receita: 900 },
    ]);

    expect(curva[0]!.sku).toBe('grande');
    expect(curva[0]!.participacao).toBeCloseTo(0.9);
    expect(curva[1]!.acumulado).toBeCloseTo(1);
  });

  it('não quebra quando ninguém vendeu nada', () => {
    const curva = classificarABC([{ sku: 'parado', receita: 0 }]);

    expect(curva[0]!.classe).toBe('C');
    expect(curva[0]!.participacao).toBe(0);
  });
});

describe('CSV', () => {
  it('separa por ponto e vírgula e começa com BOM, que é o que o Excel pt-BR espera', () => {
    const csv = montarCsv(
      [
        { label: 'Produto', valor: (linha: { nome: string; total: number }) => linha.nome },
        { label: 'Total', valor: (linha: { nome: string; total: number }) => linha.total },
      ],
      [{ nome: 'Tricoline', total: 1990 }],
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Produto;Total');
    expect(csv).toContain('Tricoline;1990');
  });

  it('neutraliza célula que o Excel executaria como fórmula', () => {
    const csv = montarCsv(
      [{ label: 'Termo', valor: (linha: { termo: string }) => linha.termo }],
      [{ termo: '=SOMA(A1:A9)' }],
    );

    expect(csv).not.toContain('\r\n=SOMA');
    expect(csv).toContain("'=SOMA(A1:A9)");
  });

  it('protege o separador dentro do texto', () => {
    const csv = montarCsv(
      [{ label: 'Nome', valor: (linha: { nome: string }) => linha.nome }],
      [{ nome: 'Linha; com ponto e vírgula' }],
    );

    expect(csv).toContain('"Linha; com ponto e vírgula"');
  });

  it('põe o período no nome do arquivo', () => {
    const nome = nomeDoArquivo(
      'vendas',
      new Date('2026-09-05T03:00:00Z'),
      new Date('2026-09-12T02:59:59Z'),
    );

    expect(nome).toBe('vendas-2026-09-05-a-2026-09-11.csv');
  });
});
