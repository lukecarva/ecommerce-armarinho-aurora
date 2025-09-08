/**
 * Regras do pedido, compartilhadas entre API, vitrine e painel.
 *
 * O pedido desta loja é um orçamento: o site calcula uma estimativa, e a
 * venda fecha no WhatsApp. Toda a matemática mora aqui, num lugar só, para
 * que a tela da cliente, a mensagem enviada e o relatório da loja nunca
 * mostrem três números diferentes para a mesma compra.
 */
import { CLOSED_ORDER_STATUSES, type OrderStatus } from './enums.js';
import type { Cents } from './money.js';

/**
 * Colunas do kanban, na ordem em que a atendente trabalha.
 *
 * "Entregue" e "Retirado" são o mesmo fim de linha visto de dois jeitos —
 * dividir em duas colunas encheria o quadro de cards parados. Ficam juntas em
 * "Concluído"; o status exato continua no card e no relatório.
 */
export const KANBAN_COLUMNS = [
  { key: 'novo', label: 'Novo', statuses: ['novo'] },
  { key: 'em_atendimento', label: 'Em atendimento', statuses: ['em_atendimento'] },
  {
    key: 'aguardando_pagamento',
    label: 'Aguardando pagamento',
    statuses: ['aguardando_pagamento'],
  },
  { key: 'pago', label: 'Pago', statuses: ['pago', 'separado'] },
  { key: 'concluido', label: 'Concluído', statuses: ['entregue', 'retirado'] },
  { key: 'perdido', label: 'Perdido', statuses: ['cancelado', 'perdido'] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  statuses: readonly OrderStatus[];
}>;

export type KanbanColumnKey = (typeof KANBAN_COLUMNS)[number]['key'];

/** O pedido já saiu da fila de trabalho? */
export function isClosedStatus(status: OrderStatus): boolean {
  return CLOSED_ORDER_STATUSES.includes(status);
}

/**
 * Status que exigem justificativa.
 *
 * Uma venda que não aconteceu só ensina alguma coisa se alguém disser por quê.
 * Sem o motivo obrigatório, "perdido" vira um balde onde tudo cai e o
 * relatório não responde nada.
 */
export function requiresLostReason(status: OrderStatus): boolean {
  return status === 'perdido' || status === 'cancelado';
}

/**
 * Status em que faz sentido registrar o valor fechado.
 *
 * O `finalValue` é o que a loja realmente vendeu, e só existe depois que a
 * atendente negociou. Antes de "pago" ele seria um palpite.
 */
export function acceptsFinalValue(status: OrderStatus): boolean {
  return (
    status === 'pago' || status === 'separado' || status === 'entregue' || status === 'retirado'
  );
}

/**
 * Um pedido pode ir para qualquer status.
 *
 * Máquina de estado rígida atrapalha atendimento humano: a cliente paga por
 * Pix antes da conversa acabar, desiste depois de pago, volta atrás no dia
 * seguinte. O que o sistema garante é o registro de quem mudou o quê e
 * quando — a linha do tempo —, não a ordem "certa" dos passos.
 *
 * A única restrição real é o motivo obrigatório na perda.
 */
export function canTransition(_de: OrderStatus, _para: OrderStatus): boolean {
  return true;
}

// ──────────────────────────────── Cupom ────────────────────────────────────

export type CouponType = 'percent' | 'fixed';

export interface CouponRules {
  code: string;
  type: CouponType;
  /** Percentual de 0 a 100, ou valor em centavos quando `type` é "fixed". */
  value: number;
  minSubtotal?: Cents | null;
  usageLimit?: number | null;
  usedCount?: number;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  active?: boolean;
}

export type CouponRejection =
  'inexistente' | 'inativo' | 'fora_da_data' | 'esgotado' | 'subtotal_insuficiente';

export const COUPON_REJECTION_MESSAGES: Record<CouponRejection, string> = {
  inexistente: 'Cupom não encontrado.',
  inativo: 'Este cupom não está mais valendo.',
  fora_da_data: 'Este cupom está fora do prazo.',
  esgotado: 'Este cupom já atingiu o limite de usos.',
  subtotal_insuficiente: 'Seu pedido ainda não atingiu o valor mínimo deste cupom.',
};

export type CouponResult =
  { valid: true; discount: Cents } | { valid: false; reason: CouponRejection; message: string };

/**
 * Aplica o cupom sobre o subtotal.
 *
 * O desconto nunca ultrapassa o subtotal: um cupom de R$ 50 num pedido de
 * R$ 30 zera a conta, não gera crédito. E o valor mínimo é comparado com o
 * subtotal **antes** do desconto, que é como a cliente lê a regra na
 * chamada ("R$ 10 off acima de R$ 100").
 */
export function applyCoupon(
  subtotal: Cents,
  coupon: CouponRules | null,
  agora = new Date(),
): CouponResult {
  if (!coupon) return recusa('inexistente');
  if (coupon.active === false) return recusa('inativo');

  const inicio = paraData(coupon.startsAt);
  const fim = paraData(coupon.endsAt);
  if (inicio && agora < inicio) return recusa('fora_da_data');
  if (fim && agora > fim) return recusa('fora_da_data');

  if (coupon.usageLimit != null && (coupon.usedCount ?? 0) >= coupon.usageLimit) {
    return recusa('esgotado');
  }

  if (coupon.minSubtotal != null && subtotal < coupon.minSubtotal) {
    return recusa('subtotal_insuficiente');
  }

  const bruto =
    coupon.type === 'percent'
      ? Math.round((subtotal * coupon.value) / 100)
      : Math.round(coupon.value);

  return { valid: true, discount: Math.max(0, Math.min(bruto, subtotal)) };
}

function recusa(reason: CouponRejection): CouponResult {
  return { valid: false, reason, message: COUPON_REJECTION_MESSAGES[reason] };
}

function paraData(valor: Date | string | null | undefined): Date | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

// ─────────────────────────────── Totais ────────────────────────────────────

export interface OrderLine {
  quantity: number;
  unitPrice: Cents;
}

export interface OrderTotals {
  /** Quantas linhas o pedido tem — não a soma das quantidades. */
  itemCount: number;
  subtotal: Cents;
  discount: Cents;
  total: Cents;
}

/**
 * Soma o pedido.
 *
 * Cada linha é arredondada uma vez, ao virar `lineTotal`, e o subtotal é a
 * soma das linhas já arredondadas. É o que faz a conta bater com o que está
 * escrito na tela: somar antes e arredondar depois produziria um total um
 * centavo diferente da soma visível das linhas — e ninguém consegue explicar
 * esse centavo pelo WhatsApp.
 */
export function calculateTotals(lines: readonly OrderLine[], discount: Cents = 0): OrderTotals {
  const subtotal = lines.reduce((soma, linha) => soma + lineTotal(linha), 0);
  const desconto = Math.max(0, Math.min(discount, subtotal));

  return {
    itemCount: lines.length,
    subtotal,
    discount: desconto,
    total: subtotal - desconto,
  };
}

/** Preço da linha: quantidade × preço unitário, arredondado uma única vez. */
export function lineTotal(line: OrderLine): Cents {
  return Math.round(line.unitPrice * line.quantity);
}

// ──────────────────────────────── Código ───────────────────────────────────

/** "CP-2026-0001". O que cliente e atendente falam em voz alta. */
export function formatOrderCode(year: number, sequence: number): string {
  return `CP-${year}-${String(sequence).padStart(4, '0')}`;
}

const ORDER_CODE = /^CP-(\d{4})-(\d{4,})$/;

export function parseOrderCode(code: string): { year: number; sequence: number } | null {
  const encontrado = ORDER_CODE.exec(code.trim().toUpperCase());
  if (!encontrado) return null;

  return { year: Number(encontrado[1]), sequence: Number(encontrado[2]) };
}

/**
 * Horas sem contato até o pedido entrar na fila de recuperação.
 *
 * Um dia inteiro cobre o pedido feito à noite e o do fim de semana, sem
 * transformar em "abandonado" quem só está esperando a loja abrir.
 */
export const RECOVERY_AFTER_HOURS = 24;

/** O pedido está parado tempo demais e precisa de alguém? */
export function needsRecovery(
  order: {
    status: OrderStatus;
    createdAt: Date | string;
    whatsappClickedAt?: Date | string | null;
  },
  agora = new Date(),
): boolean {
  if (isClosedStatus(order.status)) return false;
  if (order.status !== 'novo') return false;

  const criado = paraData(order.createdAt);
  if (!criado) return false;

  return agora.getTime() - criado.getTime() >= RECOVERY_AFTER_HOURS * 60 * 60 * 1000;
}
