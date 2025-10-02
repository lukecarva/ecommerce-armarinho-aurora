import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { AuditService } from '../common/audit.service';
import { clientIp, CurrentUser, type AuthenticatedUser } from '../common/current-user';
import { RequirePermissions } from '../common/permissions.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MediaService, type UploadedFile as MediaFile } from './media.service';

const listSchema = z.object({
  folder: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
});

const altSchema = z.object({ alt: z.string().trim().max(180).nullable() });

@ApiTags('Admin — Mídia')
@Controller('admin/media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('midia:ver')
  @ApiOkResponse({ description: 'Biblioteca de mídia, paginada.' })
  list(@Query(new ZodValidationPipe(listSchema)) query: z.infer<typeof listSchema>) {
    return this.media.list(query);
  }

  @Post()
  @RequirePermissions('midia:criar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  @ApiOkResponse({ description: 'Envia uma imagem e gera as versões responsivas.' })
  async upload(
    @UploadedFile() file: MediaFile | undefined,
    @Body('folder') folder: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');

    const asset = await this.media.upload(file, folder?.trim() || 'produtos', user.id);

    await this.audit.record({
      actorId: user.id,
      entity: 'midia',
      entityId: asset.id,
      action: 'upload',
      after: { key: asset.key, folder: asset.folder },
      ip: clientIp(request),
    });

    return asset;
  }

  @Patch(':id')
  @RequirePermissions('midia:editar')
  @ApiOkResponse({ description: 'Atualiza o texto alternativo da imagem.' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(altSchema)) body: z.infer<typeof altSchema>,
  ) {
    return this.media.updateAlt(id, body.alt);
  }

  @Delete(':id')
  @RequirePermissions('midia:excluir')
  @ApiOkResponse({ description: 'Remove a imagem e todas as derivações.' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.media.remove(id);

    await this.audit.record({
      actorId: user.id,
      entity: 'midia',
      entityId: id,
      action: 'excluir',
      ip: clientIp(request),
    });

    return { ok: true };
  }
}
