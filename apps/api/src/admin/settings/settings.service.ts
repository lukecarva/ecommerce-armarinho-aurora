import { brandingSchema, storeInfoSchema, type Branding, type StoreInfo } from '@aurora/types';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ImageService } from '../../media/image.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { UploadedFile } from '../../media/media.service';

export const STORE_INFO_KEY = 'store.info';
export const STORE_BRANDING_KEY = 'store.branding';

/** Peças de marca que o painel pode enviar. */
export const BRAND_SLOTS = [
  'logoPrincipal',
  'logoRodape',
  'logoMono',
  'favicon',
  'ogImage',
] as const;
export type BrandSlot = (typeof BRAND_SLOTS)[number];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: ImageService,
  ) {}

  async getStoreInfo(): Promise<StoreInfo | null> {
    const setting = await this.prisma.setting.findUnique({ where: { key: STORE_INFO_KEY } });
    if (!setting) return null;

    const parsed = storeInfoSchema.safeParse(setting.value);
    return parsed.success ? parsed.data : null;
  }

  async getBranding(): Promise<Branding> {
    const setting = await this.prisma.setting.findUnique({ where: { key: STORE_BRANDING_KEY } });
    // O schema tem padrão para tudo: uma loja sem marca enviada ainda funciona,
    // caindo no wordmark e nas cores oficiais.
    return brandingSchema.parse(setting?.value ?? {});
  }

  async updateStoreInfo(input: StoreInfo): Promise<StoreInfo> {
    await this.prisma.setting.upsert({
      where: { key: STORE_INFO_KEY },
      create: { key: STORE_INFO_KEY, value: input },
      update: { value: input },
    });

    return input;
  }

  async updateBranding(patch: Partial<Branding>): Promise<Branding> {
    const current = await this.getBranding();
    const merged = brandingSchema.parse({ ...current, ...patch });

    await this.prisma.setting.upsert({
      where: { key: STORE_BRANDING_KEY },
      create: { key: STORE_BRANDING_KEY, value: merged },
      update: { value: merged },
    });

    return merged;
  }

  /**
   * Recebe um arquivo de marca e devolve a identidade visual atualizada.
   *
   * Enviar o logo principal gera, na mesma ação, os ícones do PWA, o
   * apple-touch-icon e o favicon. É o que permite trocar a marca da loja sem
   * abrir o código nem fazer deploy.
   */
  async uploadBrandAsset(slot: BrandSlot, file: UploadedFile): Promise<Branding> {
    if (!BRAND_SLOTS.includes(slot)) {
      throw new BadRequestException(`Peça de marca desconhecida: "${slot}".`);
    }

    const processed = await this.images.process(file, `marca/${slot}`);
    const patch: Partial<Branding> = { [slot]: processed.url };

    if (slot === 'logoPrincipal') {
      const branding = await this.getBranding();
      const icons = await this.images.generateAppIcons(file, branding.corPrimaria);

      patch.iconesPwa = icons.map((icon) => ({ size: icon.size, url: icon.url }));

      const favicon = icons.find((icon) => icon.size === 32);
      if (favicon) patch.favicon = favicon.url;
    }

    return this.updateBranding(patch);
  }

  async listBusinessHours() {
    return this.prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } });
  }

  async replaceBusinessHours(
    hours: Array<{ weekday: number; opensAt: string; closesAt: string; closed: boolean }>,
  ) {
    for (const hour of hours) {
      if (!hour.closed && hour.opensAt >= hour.closesAt) {
        throw new BadRequestException(
          `Horário inválido em ${weekdayName(hour.weekday)}: fecha antes de abrir.`,
        );
      }
    }

    await this.prisma.$transaction(
      hours.map((hour) =>
        this.prisma.businessHour.upsert({
          where: { weekday: hour.weekday },
          create: hour,
          update: hour,
        }),
      ),
    );

    return this.listBusinessHours();
  }

  async listHolidays() {
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  async addHoliday(date: Date, label: string) {
    return this.prisma.holiday.upsert({
      where: { date },
      create: { date, label },
      update: { label },
    });
  }

  async removeHoliday(date: Date): Promise<void> {
    await this.prisma.holiday.delete({ where: { date } });
  }

  async listDeliveryMethods() {
    return this.prisma.deliveryMethod.findMany({ orderBy: { position: 'asc' } });
  }
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? `dia ${weekday}`;
}
