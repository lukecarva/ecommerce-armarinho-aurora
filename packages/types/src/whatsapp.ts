import type { SaleUnit } from './enums.js';
import { formatBRL, type Cents } from './money.js';
import { formatPackSize, formatQuantity } from './quantity.js';

/**
 * Montagem da mensagem e do link do WhatsApp — o checkout do projeto.
 *
 * Dois limites reais moldam este código:
 *
 * 1. Navegadores truncam URLs longas (o pior caso prático fica perto de 2.000
 *    caracteres). Um carrinho grande estoura isso e a mensagem chega cortada.
 * 2. O cliente precisa reconhecer o próprio pedido de relance, no celular.
 *
 * Por isso existem duas formas da mensagem: a completa e a compacta com link.
 * A escolha é automática — ver `buildOrderWhatsAppLink`.
 */

/** Acima disso a mensagem vira resumo, mesmo cabendo na URL. */
export const MAX_ITEMS_IN_FULL_MESSAGE = 8;

/**
 * Orçamento de caracteres para o texto já codificado na URL.
 * Deixa folga confortável abaixo do limite prático dos navegadores.
 */
export const SAFE_ENCODED_LENGTH = 1600;

export interface WhatsAppOrderItem {
  name: string;
  variantName?: string | null;
  quantity: number;
  unit: SaleUnit;
  unitPrice: Cents;
  lineTotal: Cents;
  packSize?: number | null;
}

export interface WhatsAppOrderPayload {
  /** "CP-2026-0001" */
  code: string;
  items: WhatsAppOrderItem[];
  subtotal: Cents;
  discount?: Cents;
  total: Cents;
  /** "Retirar na loja" | "Motoboy — a combinar" */
  deliveryLabel: string;
  /** Bairro ou referência informada pelo cliente. */
  deliveryNote?: string | null;
  /** Página pública do pedido: sempre incluída, é o plano B da mensagem. */
  orderUrl: string;
  customerName?: string | null;
  /** Aviso de fora do horário, quando a loja está fechada. */
  closedNotice?: string | null;
}

/** Mensagem completa, com todos os itens listados. */
export function buildFullOrderMessage(payload: WhatsAppOrderPayload): string {
  const lines: string[] = [];

  lines.push(`Olá! Quero finalizar meu pedido *${payload.code}* 🧵`);
  lines.push('');

  payload.items.forEach((item, index) => {
    const pack = formatPackSize(item.packSize);
    const name = [item.name, item.variantName, pack ? `(${pack})` : null].filter(Boolean).join(' ');

    lines.push(`${index + 1}. ${name}`);
    lines.push(
      `   ${formatQuantity(item.quantity, item.unit)} × ${formatBRL(item.unitPrice)} = ${formatBRL(item.lineTotal)}`,
    );
  });

  lines.push('');
  lines.push(
    `Subtotal (${countItems(payload)} ${itemWord(payload)}): ${formatBRL(payload.subtotal)}`,
  );

  if (payload.discount && payload.discount > 0) {
    lines.push(`Desconto: -${formatBRL(payload.discount)}`);
  }

  lines.push(`Entrega: ${deliveryLine(payload)}`);
  lines.push(`*Total: ${formatBRL(payload.total)}*`);
  lines.push('');
  lines.push(`Detalhes: ${payload.orderUrl}`);

  return finish(lines, payload);
}

/**
 * Mensagem compacta: sem a lista de itens, com o link do pedido.
 * Usada quando o carrinho é grande demais para a URL.
 */
export function buildCompactOrderMessage(payload: WhatsAppOrderPayload): string {
  const lines: string[] = [];

  lines.push(`Olá! Quero finalizar meu pedido *${payload.code}* 🧵`);
  lines.push('');
  lines.push(`${countItems(payload)} ${itemWord(payload)} · *${formatBRL(payload.total)}*`);
  lines.push(`Entrega: ${deliveryLine(payload)}`);
  lines.push('');
  lines.push(`Lista completa do pedido: ${payload.orderUrl}`);

  return finish(lines, payload);
}

export interface WhatsAppLink {
  url: string;
  message: string;
  /** `true` quando caiu no formato resumido. */
  compact: boolean;
}

/**
 * Monta o link definitivo, escolhendo o formato que cabe.
 *
 * Tenta a mensagem completa; se passar do orçamento de caracteres ou do limite
 * de itens, usa a compacta. O atendente vê a lista inteira no link do pedido
 * de qualquer forma, então nada se perde.
 */
export function buildOrderWhatsAppLink(phone: string, payload: WhatsAppOrderPayload): WhatsAppLink {
  if (payload.items.length <= MAX_ITEMS_IN_FULL_MESSAGE) {
    const message = buildFullOrderMessage(payload);
    if (encodeURIComponent(message).length <= SAFE_ENCODED_LENGTH) {
      return { url: buildWhatsAppUrl(phone, message), message, compact: false };
    }
  }

  const message = buildCompactOrderMessage(payload);
  return { url: buildWhatsAppUrl(phone, message), message, compact: true };
}

/**
 * Sempre `https://wa.me/` — funciona em iOS, Android e desktop.
 * O esquema `whatsapp://` quebra no navegador do desktop.
 */
export function buildWhatsAppUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

/** Mensagem de contato simples, sem pedido (botão "Fale conosco"). */
export function buildContactUrl(phone: string, message?: string): string {
  return buildWhatsAppUrl(
    phone,
    message ?? 'Olá! Vim pelo site da Armarinho Aurora e gostaria de uma informação.',
  );
}

export interface ProductInquiry {
  name: string;
  url: string;
  /** Preço por unidade de venda. */
  price?: Cents;
  variantName?: string | null;
  /** Quantidade escolhida na página. 2,5 metros de tecido, por exemplo. */
  quantity?: number;
  unit?: SaleUnit;
  /** Preço × quantidade, já calculado por quem exibiu o valor na tela. */
  lineTotal?: Cents;
}

/**
 * Link de compra rápida de um único produto, direto da página dele.
 *
 * A quantidade e o total vão na mensagem porque é o que a atendente precisa
 * para responder sem perguntar de novo — em tecido, "quero esse" sem a
 * metragem é meia conversa. O valor enviado é o mesmo que apareceu na tela:
 * quem calcula é a página, para não existirem duas contas na loja.
 */
export function buildProductInquiryUrl(phone: string, product: ProductInquiry): string {
  const price = product.price !== undefined ? ` (${formatBRL(product.price)})` : '';
  const lines = [`Olá! Tenho interesse neste produto: *${product.name}*${price}`];

  if (product.variantName) lines.push(`Variação: ${product.variantName}`);

  if (product.quantity !== undefined && product.unit) {
    const total = product.lineTotal !== undefined ? ` — total ${formatBRL(product.lineTotal)}` : '';
    lines.push(`Quantidade: ${formatQuantity(product.quantity, product.unit)}${total}`);
  }

  lines.push(product.url);

  return buildWhatsAppUrl(phone, lines.join('\n'));
}

/**
 * Deixa o telefone no formato que o wa.me espera: só dígitos, com DDI.
 * Aceita "(11) 99999-0000", "11999990000" e "5511999990000".
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

function deliveryLine(payload: WhatsAppOrderPayload): string {
  const note = payload.deliveryNote?.trim();
  return note ? `${payload.deliveryLabel} (${note})` : payload.deliveryLabel;
}

function countItems(payload: WhatsAppOrderPayload): number {
  return payload.items.length;
}

function itemWord(payload: WhatsAppOrderPayload): string {
  return countItems(payload) === 1 ? 'item' : 'itens';
}

function finish(lines: string[], payload: WhatsAppOrderPayload): string {
  if (payload.customerName) {
    lines.push('');
    lines.push(`Meu nome: ${payload.customerName}`);
  }
  if (payload.closedNotice) {
    lines.push('');
    lines.push(payload.closedNotice);
  }
  return lines.join('\n');
}
