import { brandingSchema, storeInfoSchema } from '@aurora/types';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import type { UploadedFile as MediaFile } from '../../media/media.service';
import { BRAND_SLOTS, SettingsService, type BrandSlot } from './settings.service';

const hoursSchema = z.object({
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        opensAt: z.string().regex(/^\d{2}:\d{2}$/, 'Use o formato HH:MM'),
        closesAt: z.string().regex(/^\d{2}:\d{2}$/, 'Use o formato HH:MM'),
        closed: z.boolean(),
      }),
    )
    .length(7, 'Envie os sete dias da semana'),
});

const holidaySchema = z.object({
  date: z.coerce.date(),
  label: z.string().trim().min(2).max(80),
});

const brandingPatchSchema = brandingSchema.partial();

@ApiTags('Admin — Configurações')
@Controller('admin/settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('configuracoes:ver')
  @ApiOkResponse({ description: 'Dados da loja, identidade visual, horários e entrega.' })
  async getAll() {
    const [info, branding, hours, holidays, deliveryMethods] = await Promise.all([
      this.settings.getStoreInfo(),
      this.settings.getBranding(),
      this.settings.listBusinessHours(),
      this.settings.listHolidays(),
      this.settings.listDeliveryMethods(),
    ]);

    return { info, branding, hours, holidays, deliveryMethods };
  }

  @Put('store')
  @RequirePermissions('configuracoes:editar')
  async updateStore(
    @Body(new ZodValidationPipe(storeInfoSchema)) body: z.infer<typeof storeInfoSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const before = await this.settings.getStoreInfo();
    const after = await this.settings.updateStoreInfo(body);

    await this.audit.record({
      actorId: user.id,
      entity: 'configuracao',
      entityId: 'store.info',
      action: 'editar',
      before: before ?? undefined,
      after,
      ip: clientIp(request),
    });

    return after;
  }

  // ────────────────────────── Identidade visual ────────────────────────────

  @Get('branding')
  @RequirePermissions('identidade:ver')
  getBranding() {
    return this.settings.getBranding();
  }

  @Put('branding')
  @RequirePermissions('identidade:editar')
  @ApiOkResponse({ description: 'Atualiza as cores da marca.' })
  async updateBranding(
    @Body(new ZodValidationPipe(brandingPatchSchema)) body: z.infer<typeof brandingPatchSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const after = await this.settings.updateBranding(body);

    await this.audit.record({
      actorId: user.id,
      entity: 'configuracao',
      entityId: 'store.branding',
      action: 'editar',
      after: body,
      ip: clientIp(request),
    });

    return after;
  }

  @Post('branding/:slot')
  @RequirePermissions('identidade:editar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  @ApiOkResponse({
    description: 'Envia uma peça da marca. O logo principal também gera favicon e ícones do PWA.',
  })
  async uploadBrand(
    @Param('slot') slot: string,
    @UploadedFile() file: MediaFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');

    if (!BRAND_SLOTS.includes(slot as BrandSlot)) {
      throw new BadRequestException(`Peça inválida. Use uma destas: ${BRAND_SLOTS.join(', ')}.`);
    }

    const branding = await this.settings.uploadBrandAsset(slot as BrandSlot, file);

    await this.audit.record({
      actorId: user.id,
      entity: 'configuracao',
      entityId: `store.branding.${slot}`,
      action: 'upload',
      after: { slot },
      ip: clientIp(request),
    });

    return branding;
  }

  // ───────────────────────────── Horários ──────────────────────────────────

  @Put('hours')
  @RequirePermissions('configuracoes:editar')
  @ApiOkResponse({ description: 'Substitui o horário de funcionamento da semana.' })
  async updateHours(
    @Body(new ZodValidationPipe(hoursSchema)) body: z.infer<typeof hoursSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const hours = await this.settings.replaceBusinessHours(body.hours);

    await this.audit.record({
      actorId: user.id,
      entity: 'configuracao',
      entityId: 'horarios',
      action: 'editar',
      after: { dias: body.hours.filter((hour) => !hour.closed).length },
      ip: clientIp(request),
    });

    return hours;
  }

  @Post('holidays')
  @RequirePermissions('configuracoes:editar')
  addHoliday(@Body(new ZodValidationPipe(holidaySchema)) body: z.infer<typeof holidaySchema>) {
    return this.settings.addHoliday(body.date, body.label);
  }

  @Delete('holidays/:date')
  @RequirePermissions('configuracoes:editar')
  async removeHoliday(@Param('date') date: string) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Data inválida.');
    }

    await this.settings.removeHoliday(parsed);
    return { ok: true };
  }
}
