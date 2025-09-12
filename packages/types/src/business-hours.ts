/**
 * Horário de funcionamento da loja.
 *
 * Com um único número de WhatsApp, saber se a loja está aberta faz parte da
 * experiência: o cliente que envia um pedido às 23h precisa saber quando será
 * respondido. O badge do header e a mensagem do carrinho saem daqui.
 *
 * Toda conta é feita no fuso da loja (America/Sao_Paulo), independentemente
 * do fuso do navegador ou do servidor.
 */

export const STORE_TIME_ZONE = 'America/Sao_Paulo';

export interface BusinessHour {
  /** 0 = domingo … 6 = sábado */
  weekday: number;
  /** "09:00" */
  opensAt: string;
  /** "18:00" */
  closesAt: string;
  closed: boolean;
}

export interface Holiday {
  /** "2026-12-25" */
  date: string;
  label: string;
}

export interface StoreSchedule {
  timeZone: string;
  hours: BusinessHour[];
  holidays: Holiday[];
}

export interface StoreStatus {
  isOpen: boolean;
  /** "Aberto agora" | "Fechado — abrimos seg às 9h" */
  label: string;
  /** Frase completa para o carrinho e o checkout. */
  message: string;
  /** Quando volta a abrir. Ausente se estiver aberta. */
  opensAgain?: { weekday: number; weekdayLabel: string; time: string; isToday: boolean };
  /** Preenchido quando o dia é feriado cadastrado. */
  holiday?: Holiday;
}

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAY_LONG = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/** Horário atual da Armarinho Aurora: seg–sex 9h–18h, sáb 9h–16h. */
export const DEFAULT_SCHEDULE: StoreSchedule = {
  timeZone: STORE_TIME_ZONE,
  hours: [
    { weekday: 0, opensAt: '00:00', closesAt: '00:00', closed: true },
    { weekday: 1, opensAt: '09:00', closesAt: '18:00', closed: false },
    { weekday: 2, opensAt: '09:00', closesAt: '18:00', closed: false },
    { weekday: 3, opensAt: '09:00', closesAt: '18:00', closed: false },
    { weekday: 4, opensAt: '09:00', closesAt: '18:00', closed: false },
    { weekday: 5, opensAt: '09:00', closesAt: '18:00', closed: false },
    { weekday: 6, opensAt: '09:00', closesAt: '16:00', closed: false },
  ],
  holidays: [],
};

interface ZonedNow {
  isoDate: string;
  weekday: number;
  minutes: number;
}

/** Extrai data, dia da semana e minutos do dia no fuso informado. */
function zonedNow(date: Date, timeZone: string): ZonedNow {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));

  return {
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: weekdayMap[get('weekday')] ?? 0,
    minutes: hour * 60 + minute,
  };
}

function toMinutes(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** "09:00" → "9h" · "16:30" → "16h30" */
export function formatTime(time: string): string {
  const [hours = '0', minutes = '00'] = time.split(':');
  const h = Number(hours);
  return minutes === '00' ? `${h}h` : `${h}h${minutes}`;
}

/**
 * Diz se a loja está aberta agora e, se não estiver, quando abre.
 *
 * @param at Momento a avaliar. Padrão: agora. Injetável para testes.
 */
export function getStoreStatus(
  schedule: StoreSchedule = DEFAULT_SCHEDULE,
  at: Date = new Date(),
): StoreStatus {
  const now = zonedNow(at, schedule.timeZone || STORE_TIME_ZONE);
  const holiday = schedule.holidays.find((item) => item.date === now.isoDate);
  const today = schedule.hours.find((hour) => hour.weekday === now.weekday);

  const isOpen =
    !holiday &&
    !!today &&
    !today.closed &&
    now.minutes >= toMinutes(today.opensAt) &&
    now.minutes < toMinutes(today.closesAt);

  if (isOpen && today) {
    return {
      isOpen: true,
      label: 'Aberto agora',
      message: `Estamos abertos até ${formatTime(today.closesAt)}. Respondemos seu pedido em instantes.`,
    };
  }

  const next = findNextOpening(schedule, now);

  if (!next) {
    return {
      isOpen: false,
      label: 'Fechado',
      message: 'Estamos fechados no momento. Envie seu pedido e responderemos assim que abrirmos.',
      ...(holiday ? { holiday } : {}),
    };
  }

  const when = next.isToday
    ? `hoje às ${formatTime(next.time)}`
    : `${next.weekdayLabel} às ${formatTime(next.time)}`;

  const reason = holiday ? `Fechado — ${holiday.label}.` : 'Estamos fechados.';

  return {
    isOpen: false,
    label: `Fechado — abrimos ${next.isToday ? `hoje às ${formatTime(next.time)}` : `${WEEKDAY_SHORT[next.weekday]} às ${formatTime(next.time)}`}`,
    message: `${reason} Envie seu pedido — respondemos ${when}.`,
    opensAgain: next,
    ...(holiday ? { holiday } : {}),
  };
}

function findNextOpening(
  schedule: StoreSchedule,
  now: ZonedNow,
): StoreStatus['opensAgain'] | undefined {
  for (let offset = 0; offset < 8; offset += 1) {
    const weekday = (now.weekday + offset) % 7;
    const hour = schedule.hours.find((item) => item.weekday === weekday);
    if (!hour || hour.closed) continue;

    const isToday = offset === 0;
    if (isToday && now.minutes >= toMinutes(hour.opensAt)) continue; // já passou do horário de hoje

    const date = addDaysIso(now.isoDate, offset);
    if (schedule.holidays.some((holiday) => holiday.date === date)) continue;

    return {
      weekday,
      weekdayLabel: WEEKDAY_LONG[weekday] ?? '',
      time: hour.opensAt,
      isToday,
    };
  }
  return undefined;
}

function addDaysIso(isoDate: string, days: number): string {
  const [year = '1970', month = '01', day = '01'] = isoDate.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Linhas prontas para o rodapé: "Seg a sex: 9h às 18h". */
export function formatScheduleLines(schedule: StoreSchedule = DEFAULT_SCHEDULE): string[] {
  const lines: string[] = [];
  const open = schedule.hours.filter((hour) => !hour.closed).sort((a, b) => a.weekday - b.weekday);

  let index = 0;
  while (index < open.length) {
    const start = open[index];
    if (!start) break;

    let end = index;
    while (
      end + 1 < open.length &&
      open[end + 1]?.weekday === (open[end]?.weekday ?? 0) + 1 &&
      open[end + 1]?.opensAt === start.opensAt &&
      open[end + 1]?.closesAt === start.closesAt
    ) {
      end += 1;
    }

    const from = WEEKDAY_SHORT[start.weekday] ?? '';
    const to = WEEKDAY_SHORT[open[end]?.weekday ?? start.weekday] ?? '';
    const days = end > index ? `${cap(from)} a ${to}` : cap(from);

    lines.push(`${days}: ${formatTime(start.opensAt)} às ${formatTime(start.closesAt)}`);
    index = end + 1;
  }

  return lines;
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
