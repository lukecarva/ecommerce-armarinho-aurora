import {
  DEFAULT_SCHEDULE,
  STORE_TIME_ZONE,
  formatScheduleLines,
  getStoreStatus,
  type Branding,
  type StoreInfo,
  type StoreSchedule,
  type StoreStatus,
} from '@aurora/types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface StorePayload {
  info: StoreInfo;
  branding: Branding;
  schedule: StoreSchedule;
  scheduleLines: string[];
  status: StoreStatus;
  deliveryMethods: Array<{
    id: string;
    label: string;
    description: string | null;
    type: string;
    priceLabel: string;
    asksAddress: boolean;
  }>;
}

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tudo que a vitrine precisa saber da loja em uma chamada: dados cadastrais,
   * identidade visual, horário, se está aberta agora e as opções de entrega.
   *
   * Uma requisição só porque isso alimenta o header, o rodapé e o carrinho —
   * três lugares que o cliente vê antes de qualquer produto carregar.
   */
  async getStore(): Promise<StorePayload> {
    const [infoSetting, brandingSetting, hours, holidays, deliveryMethods] = await Promise.all([
      this.prisma.setting.findUnique({ where: { key: 'store.info' } }),
      this.prisma.setting.findUnique({ where: { key: 'store.branding' } }),
      this.prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } }),
      this.prisma.holiday.findMany({ orderBy: { date: 'asc' } }),
      this.prisma.deliveryMethod.findMany({
        where: { active: true },
        orderBy: { position: 'asc' },
      }),
    ]);

    if (!infoSetting) {
      throw new NotFoundException(
        'Configuração da loja ausente. Rode `pnpm db:seed` para popular os dados iniciais.',
      );
    }

    const schedule: StoreSchedule =
      hours.length > 0
        ? {
            timeZone: STORE_TIME_ZONE,
            hours: hours.map((hour) => ({
              weekday: hour.weekday,
              opensAt: hour.opensAt,
              closesAt: hour.closesAt,
              closed: hour.closed,
            })),
            holidays: holidays.map((holiday) => ({
              date: holiday.date.toISOString().slice(0, 10),
              label: holiday.label,
            })),
          }
        : DEFAULT_SCHEDULE;

    return {
      info: infoSetting.value as unknown as StoreInfo,
      branding: (brandingSetting?.value ?? {}) as unknown as Branding,
      schedule,
      scheduleLines: formatScheduleLines(schedule),
      status: getStoreStatus(schedule),
      deliveryMethods: deliveryMethods.map((method) => ({
        id: method.id,
        label: method.label,
        description: method.description,
        type: method.type,
        priceLabel: method.priceLabel,
        asksAddress: method.asksAddress,
      })),
    };
  }
}
