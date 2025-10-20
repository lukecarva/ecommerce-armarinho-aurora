import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, IMPORT_KINDS, FIELDS_BY_KIND } from '@aurora/types';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { clientIp, CurrentUser, type AuthenticatedUser } from '../../common/current-user';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import type { UploadedFile as ArquivoEnviado } from '../../media/media.service';
import { ImportService } from './import.service';
import { ZipService } from './zip.service';

const columnMapSchema = z.record(z.string(), z.enum(['', ...IMPORT_FIELDS]));

const optionsSchema = z.object({
  atualizarNome: z.coerce.boolean().default(false),
  criarAusentes: z.coerce.boolean().default(false),
  markupPercent: z.coerce.number().min(-90).max(500).default(0),
});

const simularSchema = z.object({
  kind: z.enum(IMPORT_KINDS),
  columnMap: z.string().transform((valor, ctx) => {
    try {
      return columnMapSchema.parse(JSON.parse(valor));
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Mapeamento de colunas inválido' });
      return z.NEVER;
    }
  }),
  atualizarNome: z.coerce.boolean().default(false),
  criarAusentes: z.coerce.boolean().default(false),
  markupPercent: z.coerce.number().min(-90).max(500).default(0),
});

const perfilSchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(IMPORT_KINDS),
  columnMap: columnMapSchema,
  options: optionsSchema.partial().default({}),
});

const historicoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

/** 60 MB: planilha grande cabe folgado; o ZIP tem limite próprio. */
const LIMITE_UPLOAD = 300 * 1024 * 1024;

@ApiTags('Admin — Importação')
@Controller('admin/import')
export class ImportController {
  constructor(
    private readonly importacao: ImportService,
    private readonly zip: ZipService,
    private readonly audit: AuditService,
  ) {}

  @Get('fields')
  @RequirePermissions('importacao:ver')
  @ApiOkResponse({ description: 'Campos disponíveis para o mapeamento, por tipo de importação.' })
  campos() {
    return {
      campos: IMPORT_FIELDS.map((campo) => ({ valor: campo, rotulo: IMPORT_FIELD_LABELS[campo] })),
      porTipo: FIELDS_BY_KIND,
    };
  }

  @Post('inspect')
  @RequirePermissions('importacao:ver')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITE_UPLOAD } }))
  @ApiOkResponse({
    description: 'Lê só o cabeçalho e sugere o mapeamento, antes de processar o arquivo.',
  })
  async inspecionar(
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @Query('kind') kind: string,
  ) {
    if (!arquivo) throw new BadRequestException('Nenhum arquivo enviado.');
    const tipo = z.enum(IMPORT_KINDS).parse(kind ?? 'produtos');

    return this.importacao.inspecionar(arquivo, tipo);
  }

  @Post('simulate')
  @RequirePermissions('importacao:criar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITE_UPLOAD } }))
  @ApiOkResponse({
    description: 'Mostra o que mudaria, sem gravar nada. Etapa obrigatória antes de aplicar.',
  })
  async simular(
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @Body(new ZodValidationPipe(simularSchema)) corpo: z.infer<typeof simularSchema>,
    @CurrentUser() usuario: AuthenticatedUser,
  ) {
    if (!arquivo) throw new BadRequestException('Nenhum arquivo enviado.');

    return this.importacao.simular(
      arquivo,
      corpo.kind,
      corpo.columnMap,
      {
        atualizarNome: corpo.atualizarNome,
        criarAusentes: corpo.criarAusentes,
        markupPercent: corpo.markupPercent,
      },
      { id: usuario.id, name: usuario.name },
    );
  }

  @Post(':id/apply')
  @RequirePermissions('importacao:criar')
  @ApiOkResponse({ description: 'Aplica uma simulação já revisada.' })
  async aplicar(
    @Param('id') id: string,
    @CurrentUser() usuario: AuthenticatedUser,
    @Req() requisicao: Request,
  ) {
    const resultado = await this.importacao.aplicar(id, { id: usuario.id, name: usuario.name });

    await this.audit.record({
      actorId: usuario.id,
      entity: 'importacao',
      entityId: id,
      action: 'criar',
      after: {
        arquivo: resultado.filename,
        criados: resultado.rowsCreated,
        atualizados: resultado.rowsUpdated,
      },
      ip: clientIp(requisicao),
    });

    return resultado;
  }

  @Post(':id/undo')
  @RequirePermissions('importacao:editar')
  @ApiOkResponse({ description: 'Desfaz a importação, devolvendo cada campo ao valor anterior.' })
  async desfazer(
    @Param('id') id: string,
    @CurrentUser() usuario: AuthenticatedUser,
    @Req() requisicao: Request,
  ) {
    const resultado = await this.importacao.desfazer(id, { id: usuario.id, name: usuario.name });

    await this.audit.record({
      actorId: usuario.id,
      entity: 'importacao',
      entityId: id,
      action: 'editar',
      after: { desfeita: true, arquivo: resultado.filename },
      ip: clientIp(requisicao),
    });

    return resultado;
  }

  @Post('zip')
  @RequirePermissions('importacao:criar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITE_UPLOAD } }))
  @ApiOkResponse({
    description:
      'Recebe planilha + fotos em um ZIP. As imagens são casadas pelo código no nome do arquivo.',
  })
  async importarZip(
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @CurrentUser() usuario: AuthenticatedUser,
    @Req() requisicao: Request,
  ) {
    if (!arquivo) throw new BadRequestException('Nenhum arquivo enviado.');

    const conteudo = await this.zip.abrir(arquivo.buffer);
    const imagens = await this.zip.vincular(conteudo.imagens, usuario.id);

    await this.audit.record({
      actorId: usuario.id,
      entity: 'importacao',
      entityId: 'zip',
      action: 'upload',
      after: { arquivo: arquivo.originalname, imagens: imagens.vinculadas },
      ip: clientIp(requisicao),
    });

    return {
      planilha: conteudo.planilha
        ? { nome: conteudo.planilha.originalname, bytes: conteudo.planilha.buffer.length }
        : null,
      imagens,
      ignorados: conteudo.ignorados,
    };
  }

  @Get('runs')
  @RequirePermissions('importacao:ver')
  historico(@Query(new ZodValidationPipe(historicoSchema)) query: z.infer<typeof historicoSchema>) {
    return this.importacao.historico(query.page, query.perPage);
  }

  @Get('runs/:id')
  @RequirePermissions('importacao:ver')
  detalhe(@Param('id') id: string) {
    return this.importacao.findOne(id);
  }

  // ── Perfis de mapeamento ─────────────────────────────────────────────────

  @Get('profiles')
  @RequirePermissions('importacao:ver')
  perfis() {
    return this.importacao.listarPerfis();
  }

  @Post('profiles')
  @RequirePermissions('importacao:criar')
  @ApiOkResponse({ description: 'Salva o mapeamento para as próximas importações.' })
  salvarPerfil(@Body(new ZodValidationPipe(perfilSchema)) corpo: z.infer<typeof perfilSchema>) {
    return this.importacao.salvarPerfil(corpo);
  }

  @Delete('profiles/:id')
  @RequirePermissions('importacao:excluir')
  async removerPerfil(@Param('id') id: string) {
    await this.importacao.removerPerfil(id);
    return { ok: true };
  }
}
