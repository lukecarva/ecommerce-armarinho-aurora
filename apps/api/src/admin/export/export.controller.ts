import { PRODUCT_STATUSES } from '@aurora/types';
import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { clientIp, CurrentUser, type AuthenticatedUser } from '../../common/current-user';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { COLUNAS_PADRAO, ExportService } from './export.service';

const solicitarSchema = z.object({
  format: z.enum(['csv', 'xlsx', 'zip']),
  filtros: z
    .object({
      categoryId: z.string().uuid().optional(),
      collectionId: z.string().uuid().optional(),
      status: z.enum(PRODUCT_STATUSES).optional(),
      needsContent: z.boolean().optional(),
      comFoto: z.boolean().optional(),
      search: z.string().trim().optional(),
    })
    .default({}),
  colunas: z.array(z.string()).default([]),
});

const listarSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

@ApiTags('Admin — Exportação')
@Controller('admin/export')
export class ExportController {
  constructor(
    private readonly exportacao: ExportService,
    private readonly audit: AuditService,
  ) {}

  @Get('columns')
  @RequirePermissions('exportacao:ver')
  @ApiOkResponse({ description: 'Colunas disponíveis, na ordem padrão.' })
  colunas() {
    return { padrao: COLUNAS_PADRAO };
  }

  @Post()
  @RequirePermissions('exportacao:criar')
  @ApiOkResponse({
    description:
      'Gera a exportação em segundo plano. O formato é o mesmo que o importador aceita de volta.',
  })
  async solicitar(
    @Body(new ZodValidationPipe(solicitarSchema)) corpo: z.infer<typeof solicitarSchema>,
    @CurrentUser() usuario: AuthenticatedUser,
    @Req() requisicao: Request,
  ) {
    const run = await this.exportacao.solicitar(corpo.format, corpo.filtros, corpo.colunas, {
      id: usuario.id,
      name: usuario.name,
    });

    await this.audit.record({
      actorId: usuario.id,
      entity: 'exportacao',
      entityId: run.id,
      action: 'criar',
      after: { formato: corpo.format, filtros: corpo.filtros },
      ip: clientIp(requisicao),
    });

    return run;
  }

  @Get()
  @RequirePermissions('exportacao:ver')
  listar(@Query(new ZodValidationPipe(listarSchema)) query: z.infer<typeof listarSchema>) {
    return this.exportacao.listar(query.page, query.perPage);
  }

  @Get(':id')
  @RequirePermissions('exportacao:ver')
  @ApiOkResponse({ description: 'Estado da exportação — o painel consulta até concluir.' })
  detalhe(@Param('id') id: string) {
    return this.exportacao.findOne(id);
  }

  /**
   * Download autenticado.
   *
   * O arquivo é transmitido pela API em vez de ficar num link público: o
   * catálogo é o ativo da loja, e um endereço adivinhável exporia preço e
   * estoque para quem não deveria ver.
   */
  @Get(':id/download')
  @RequirePermissions('exportacao:ver')
  async baixar(@Param('id') id: string, @Res() resposta: Response) {
    const { caminho, nome } = await this.exportacao.caminhoDoArquivo(id);
    resposta.download(caminho, nome);
  }
}
