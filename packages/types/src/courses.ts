/**
 * Cursos e workshops presenciais.
 *
 * Curso não é produto: é uma turma com data, sala e vagas. O site mostra a
 * agenda e registra o interesse; a inscrição se confirma no WhatsApp, como
 * todo o resto desta loja.
 */
import { STORE_TIME_ZONE } from './business-hours.js';
import { formatBRL, type Cents } from './money.js';

export const ENROLLMENT_STATUSES = [
  'pendente',
  'confirmada',
  'lista_de_espera',
  'cancelada',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  pendente: 'Aguardando confirmação',
  confirmada: 'Confirmada',
  lista_de_espera: 'Lista de espera',
  cancelada: 'Reembolsada',
};

export const PAYMENT_METHODS = ['pix', 'dinheiro', 'cartao', 'cortesia'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  cortesia: 'Cortesia',
};

export const COURSE_LEVELS = ['todos', 'iniciante', 'intermediario', 'avancado'] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const COURSE_LEVEL_LABELS: Record<CourseLevel, string> = {
  todos: 'Todos os níveis',
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
};

export type SeatStatus = 'disponivel' | 'ultimas_vagas' | 'lotada' | 'encerrada';

export const SEAT_STATUS_LABELS: Record<SeatStatus, string> = {
  disponivel: 'Vagas abertas',
  ultimas_vagas: 'Últimas vagas',
  lotada: 'Turma lotada',
  encerrada: 'Inscrições encerradas',
};

export function remainingSeats(seatsTotal: number, confirmadas: number): number {
  return Math.max(0, seatsTotal - confirmadas);
}

/**
 * A partir de quantas vagas restantes a turma mostra "Últimas vagas".
 *
 * Um quinto da turma, e nunca menos de duas: numa turma de 8, sobrar 2 já é
 * urgência; numa de 30, sobrar 2 também — mas sobrar 6 já merece o aviso.
 */
export function lastSeatsThreshold(seatsTotal: number): number {
  return Math.max(2, Math.ceil(seatsTotal * 0.2));
}

/**
 * Situação da turma para quem está vendo a agenda.
 *
 * Só as inscrições **confirmadas** ocupam vaga. O pedido feito pelo site é
 * intenção — a vaga é garantida na conversa, quando a loja confirma. Contar a
 * intenção deixaria uma turma "lotada" com três curiosos que nunca voltaram.
 */
export function seatStatus(
  turma: { seatsTotal: number; confirmadas: number; startsAt: Date | string; cancelada?: boolean },
  agora = new Date(),
): SeatStatus {
  if (turma.cancelada || new Date(turma.startsAt) <= agora) return 'encerrada';

  const restantes = remainingSeats(turma.seatsTotal, turma.confirmadas);
  if (restantes <= 0) return 'lotada';
  if (restantes <= lastSeatsThreshold(turma.seatsTotal)) return 'ultimas_vagas';
  return 'disponivel';
}

/** A loja só confirma enquanto houver vaga: é a trava contra turma com cadeira a menos. */
export function canConfirm(seatsTotal: number, confirmadas: number): boolean {
  return confirmadas < seatsTotal;
}

/**
 * "sáb, 20/09 · 14h às 17h" — sempre no fuso da loja.
 *
 * Minuto só aparece quando existe: "14h30", não "14h00".
 */
export function formatSessionDate(startsAt: Date | string, endsAt: Date | string): string {
  const inicio = partes(new Date(startsAt));
  const fim = partes(new Date(endsAt));

  const mesmoDia = inicio.dia === fim.dia && inicio.mes === fim.mes;
  const horaFim = mesmoDia ? fim.hora : `${fim.dia}/${fim.mes} ${fim.hora}`;

  return `${inicio.semana}, ${inicio.dia}/${inicio.mes} · ${inicio.hora} às ${horaFim}`;
}

/** Duração em texto: 90 → "1h30", 120 → "2h", 45 → "45 min". */
export function formatDuration(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas}h${String(resto).padStart(2, '0')}` : `${horas}h`;
}

/**
 * A mensagem que abre a conversa da inscrição.
 *
 * Com turma, data, nome e valor, a atendente responde sem precisar perguntar
 * nada — o que para curso é o que mais atrasa: "qual turma?", "qual dia?".
 */
export function buildEnrollmentMessage(dados: {
  curso: string;
  turma: string;
  nome: string;
  preco?: Cents | null;
  listaDeEspera?: boolean;
}): string {
  const linhas = dados.listaDeEspera
    ? [`Olá! A turma de *${dados.curso}* está lotada — quero entrar na lista de espera.`]
    : [`Olá! Quero me inscrever no curso *${dados.curso}*.`];

  linhas.push(`Turma: ${dados.turma}`, `Nome: ${dados.nome}`);
  if (dados.preco) linhas.push(`Valor: ${formatBRL(dados.preco)}`);

  return linhas.join('\n');
}

function partes(data: Date) {
  const formato = new Intl.DateTimeFormat('pt-BR', {
    // A turma das 14h é às 14h em São Paulo, esteja o servidor onde estiver.
    timeZone: STORE_TIME_ZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    formato.formatToParts(data).find((parte) => parte.type === tipo)?.value ?? '';

  const minuto = valor('minute');
  // Meia-noite vem como "24" em alguns motores; o relógio da loja diz "0h".
  const hora = String(Number(valor('hour')) % 24);

  return {
    semana: valor('weekday').replace('.', ''),
    dia: valor('day'),
    mes: valor('month'),
    hora: minuto === '00' ? `${hora}h` : `${hora}h${minuto}`,
  };
}
