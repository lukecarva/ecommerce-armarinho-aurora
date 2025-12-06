import {
  calcularFunil,
  formatAmount,
  formatarTaxa,
  montarCsv,
  nomeDoArquivo,
  REPORT_RANGE_KEYS,
  resolveRange,
  type ColunaCsv,
  type ReportRangeKey,
} from '@aurora/types';
import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminReportsService } from './admin-reports.service';

/**
 * Relatórios.
 *
 * A mesma rota devolve a tela e o arquivo: `?formato=csv` troca o JSON pelo
 * CSV das mesmas linhas. Assim não existe a divergência clássica entre o que
 * o painel mostra e o que a planilha baixada diz.
 */

const consultaSchema = z.object({
  periodo: z.enum(REPORT_RANGE_KEYS as [ReportRangeKey, ...ReportRangeKey[]]).default('30d'),
  formato: z.enum(['json', 'csv']).default('json'),
});

type Consulta = z.infer<typeof consultaSchema>;

const RELATORIOS = [
  'vendas',
  'funil',
  'abc',
  'ruptura',
  'buscas',
  'sem-foto',
  'sem-venda',
] as const;
type Relatorio = (typeof RELATORIOS)[number];

const relatorioSchema = z.enum(RELATORIOS);

@ApiTags('Admin — Relatórios')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly relatorios: AdminReportsService) {}

  @Get('resumo')
  @RequirePermissions('relatorios:ver')
  @ApiQuery({ name: 'periodo', required: false, enum: REPORT_RANGE_KEYS })
  @ApiOkResponse({ description: 'Números do topo do painel: vendas, funil e o que está parado.' })
  resumo(@Query(new ZodValidationPipe(consultaSchema)) consulta: Consulta) {
    return this.relatorios.resumo(resolveRange(consulta.periodo));
  }

  @Get(':relatorio')
  @RequirePermissions('relatorios:ver')
  @ApiQuery({ name: 'periodo', required: false, enum: REPORT_RANGE_KEYS })
  @ApiQuery({ name: 'formato', required: false, enum: ['json', 'csv'] })
  @ApiOkResponse({ description: 'O relatório em JSON, ou o CSV das mesmas linhas.' })
  async relatorio(
    @Param('relatorio', new ZodValidationPipe(relatorioSchema)) chave: Relatorio,
    @Query(new ZodValidationPipe(consultaSchema)) consulta: Consulta,
    @Res({ passthrough: true }) resposta: Response,
  ) {
    const periodo = resolveRange(consulta.periodo);
    const dados = await this.carregar(chave, periodo);

    if (consulta.formato === 'json') return dados;

    const csv = this.paraCsv(chave, dados);
    const nome = nomeDoArquivo(chave, periodo.inicio, periodo.fim);

    resposta.setHeader('Content-Type', 'text/csv; charset=utf-8');
    resposta.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    return csv;
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  private carregar(chave: Relatorio, periodo: { inicio: Date; fim: Date }) {
    switch (chave) {
      case 'vendas':
        return this.relatorios.vendas(periodo);
      case 'funil':
        return this.relatorios.funil(periodo).then(calcularFunilCompleto);
      case 'abc':
        return this.relatorios.curvaAbc(periodo);
      case 'ruptura':
        return this.relatorios.ruptura();
      case 'buscas':
        return this.relatorios.buscasSemResultado(periodo);
      case 'sem-foto':
        return this.relatorios.produtosSemFoto();
      case 'sem-venda':
        return this.relatorios.produtosSemVenda(periodo);
    }
  }

  private paraCsv(chave: Relatorio, dados: unknown): string {
    const colunas = <T>(lista: Array<ColunaCsv<T>>) => lista;

    switch (chave) {
      case 'vendas': {
        const relatorio = dados as Awaited<ReturnType<AdminReportsService['vendas']>>;
        return montarCsv(
          colunas<(typeof relatorio.serie)[number]>([
            { label: 'Dia', valor: (linha) => linha.dia },
            { label: 'Pedidos', valor: (linha) => linha.pedidos },
            { label: 'Vendas fechadas', valor: (linha) => linha.ganhos },
            { label: 'Estimado (R$)', valor: (linha) => formatAmount(linha.estimado) },
            { label: 'Fechado (R$)', valor: (linha) => formatAmount(linha.fechado) },
          ]),
          relatorio.serie,
        );
      }

      case 'funil': {
        const funil = dados as ReturnType<typeof calcularFunilCompleto>;
        const etapas = [
          { etapa: 'Pedidos criados no site', pedidos: funil.criados, taxa: '100,0%' },
          {
            etapa: 'Abriram o WhatsApp',
            pedidos: funil.whatsapp,
            taxa: formatarTaxa(funil.taxaDeAbertura),
          },
          {
            etapa: 'Viraram venda',
            pedidos: funil.fechados,
            taxa: formatarTaxa(funil.taxaDeFechamento),
          },
          { etapa: 'Perdidos', pedidos: funil.perdidos, taxa: '—' },
          { etapa: 'Ainda em atendimento', pedidos: funil.emAberto, taxa: '—' },
        ];

        return montarCsv(
          colunas<(typeof etapas)[number]>([
            { label: 'Etapa', valor: (linha) => linha.etapa },
            { label: 'Pedidos', valor: (linha) => linha.pedidos },
            { label: 'Sobre a etapa anterior', valor: (linha) => linha.taxa },
          ]),
          etapas,
        );
      }

      case 'abc': {
        const curva = dados as Awaited<ReturnType<AdminReportsService['curvaAbc']>>;
        return montarCsv(
          colunas<(typeof curva)[number]>([
            { label: 'Classe', valor: (linha) => linha.classe },
            { label: 'Produto', valor: (linha) => linha.produto },
            { label: 'SKU', valor: (linha) => linha.sku },
            { label: 'Receita (R$)', valor: (linha) => formatAmount(linha.receita) },
            { label: 'Quantidade', valor: (linha) => linha.quantidade },
            { label: 'Pedidos', valor: (linha) => linha.pedidos },
            { label: 'Participação', valor: (linha) => formatarTaxa(linha.participacao) },
            { label: 'Acumulado', valor: (linha) => formatarTaxa(linha.acumulado) },
          ]),
          curva,
        );
      }

      case 'ruptura': {
        const linhas = dados as Awaited<ReturnType<AdminReportsService['ruptura']>>;
        return montarCsv(
          colunas<(typeof linhas)[number]>([
            { label: 'Produto', valor: (linha) => linha.produto },
            { label: 'Variação', valor: (linha) => linha.variacao },
            { label: 'Estoque', valor: (linha) => linha.qty.replace('.', ',') },
            { label: 'Limiar', valor: (linha) => linha.limiar.replace('.', ',') },
            { label: 'Favoritado por', valor: (linha) => linha.favoritos },
            { label: 'Endereço', valor: (linha) => `/produto/${linha.slug}` },
          ]),
          linhas,
        );
      }

      case 'buscas': {
        const linhas = dados as Awaited<ReturnType<AdminReportsService['buscasSemResultado']>>;
        return montarCsv(
          colunas<(typeof linhas)[number]>([
            { label: 'Termo buscado', valor: (linha) => linha.termo },
            { label: 'Buscas', valor: (linha) => linha.buscas },
            { label: 'Última vez', valor: (linha) => linha.ultima.toLocaleDateString('pt-BR') },
          ]),
          linhas,
        );
      }

      case 'sem-foto': {
        const linhas = dados as Awaited<ReturnType<AdminReportsService['produtosSemFoto']>>;
        return montarCsv(
          colunas<(typeof linhas)[number]>([
            { label: 'Produto', valor: (linha) => linha.produto },
            { label: 'Categoria', valor: (linha) => linha.categoria },
            { label: 'Preço (R$)', valor: (linha) => formatAmount(linha.preco) },
            {
              label: 'Cadastrado em',
              valor: (linha) => linha.criadoEm.toLocaleDateString('pt-BR'),
            },
            { label: 'Endereço', valor: (linha) => `/produto/${linha.slug}` },
          ]),
          linhas,
        );
      }

      case 'sem-venda': {
        const linhas = dados as Awaited<ReturnType<AdminReportsService['produtosSemVenda']>>;
        return montarCsv(
          colunas<(typeof linhas)[number]>([
            { label: 'Produto', valor: (linha) => linha.produto },
            { label: 'Categoria', valor: (linha) => linha.categoria },
            { label: 'Preço (R$)', valor: (linha) => linha.preco.replace('.', ',') },
            { label: 'Favoritado por', valor: (linha) => linha.favoritos },
            { label: 'Endereço', valor: (linha) => `/produto/${linha.slug}` },
          ]),
          linhas,
        );
      }
    }
  }
}

/** O funil bruto do banco com as taxas já calculadas em cima. */
function calcularFunilCompleto(bruto: Awaited<ReturnType<AdminReportsService['funil']>>) {
  return { ...calcularFunil(bruto), motivosDePerda: bruto.motivosDePerda };
}
