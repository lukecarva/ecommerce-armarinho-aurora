import { describe, expect, it } from 'vitest';
import {
  MAX_ITEMS_IN_FULL_MESSAGE,
  SAFE_ENCODED_LENGTH,
  buildCompactOrderMessage,
  buildFullOrderMessage,
  buildOrderWhatsAppLink,
  buildProductInquiryUrl,
  buildWhatsAppUrl,
  normalizePhone,
  type WhatsAppOrderItem,
  type WhatsAppOrderPayload,
} from './whatsapp.js';

/** O carrinho exatamente como aparece no design. */
const carrinhoDoDesign: WhatsAppOrderItem[] = [
  {
    name: 'Tricoline Estampado 100% Algodão',
    quantity: 2,
    unit: 'metro',
    unitPrice: 1590,
    lineTotal: 3180,
  },
  { name: 'Fio de Rafia 300m', quantity: 1, unit: 'unidade', unitPrice: 3590, lineTotal: 3590 },
  {
    name: 'Botão de Pérola',
    quantity: 1,
    unit: 'pacote',
    unitPrice: 1199,
    lineTotal: 1199,
    packSize: 10,
  },
];

const pedido: WhatsAppOrderPayload = {
  code: 'CP-2026-0001',
  items: carrinhoDoDesign,
  subtotal: 7969,
  total: 7969,
  deliveryLabel: 'Retirar na loja',
  orderUrl: 'https://armarinhoaurora.com.br/p/CP-2026-0001',
};

describe('normalizePhone', () => {
  it('coloca o telefone no formato do wa.me', () => {
    expect(normalizePhone('(11) 99999-0000')).toBe('5511999990000');
    expect(normalizePhone('11999990000')).toBe('5511999990000');
    expect(normalizePhone('5511999990000')).toBe('5511999990000');
  });
});

describe('buildWhatsAppUrl', () => {
  it('usa sempre https://wa.me — funciona em iOS, Android e desktop', () => {
    const url = buildWhatsAppUrl('11999990000', 'Olá');
    expect(url.startsWith('https://wa.me/5511999990000?text=')).toBe(true);
    expect(url).not.toContain('whatsapp://');
  });

  it('codifica quebras de linha e acentos', () => {
    const url = buildWhatsAppUrl('11999990000', 'Olá\nTecido Algodão');
    expect(url).toContain('%0A');
    expect(url).not.toContain('\n');
  });
});

describe('buildFullOrderMessage', () => {
  const message = buildFullOrderMessage(pedido);

  it('abre com o código do pedido em destaque', () => {
    expect(message).toContain('*CP-2026-0001*');
  });

  it('lista cada item com quantidade, preço unitário e total da linha', () => {
    expect(message).toContain('1. Tricoline Estampado 100% Algodão');
    expect(message).toContain('2 metros × R$ 15,90 = R$ 31,80');
    expect(message).toContain('1 un × R$ 35,90 = R$ 35,90');
  });

  it('descreve a embalagem do produto vendido em pacote', () => {
    expect(message).toContain('Botão de Pérola (Pacote com 10 un)');
    expect(message).toContain('1 pacote × R$ 11,99 = R$ 11,99');
  });

  it('fecha com subtotal, entrega, total e link do pedido', () => {
    expect(message).toContain('Subtotal (3 itens): R$ 79,69');
    expect(message).toContain('Entrega: Retirar na loja');
    expect(message).toContain('*Total: R$ 79,69*');
    expect(message).toContain('https://armarinhoaurora.com.br/p/CP-2026-0001');
  });

  it('inclui a referência de bairro quando a entrega é por motoboy', () => {
    const comMotoboy = buildFullOrderMessage({
      ...pedido,
      deliveryLabel: 'Motoboy — a combinar',
      deliveryNote: 'Centro',
    });
    expect(comMotoboy).toContain('Entrega: Motoboy — a combinar (Centro)');
  });

  it('mostra o desconto quando há cupom', () => {
    const comCupom = buildFullOrderMessage({ ...pedido, discount: 1000, total: 6969 });
    expect(comCupom).toContain('Desconto: -R$ 10,00');
    expect(comCupom).toContain('*Total: R$ 69,69*');
  });

  it('acrescenta o aviso de fora do horário quando a loja está fechada', () => {
    const fechada = buildFullOrderMessage({
      ...pedido,
      closedNotice: 'Enviei fora do horário — respondam quando abrirem 🙂',
    });
    expect(fechada).toContain('respondam quando abrirem');
  });
});

describe('buildCompactOrderMessage', () => {
  it('resume o pedido e aponta para a página com a lista completa', () => {
    const message = buildCompactOrderMessage(pedido);
    expect(message).toContain('3 itens · *R$ 79,69*');
    expect(message).toContain('Lista completa do pedido: https://');
    expect(message).not.toContain('Tricoline');
  });
});

describe('buildOrderWhatsAppLink', () => {
  it('usa a mensagem completa em um carrinho normal', () => {
    const link = buildOrderWhatsAppLink('11999990000', pedido);
    expect(link.compact).toBe(false);
    expect(link.message).toContain('Tricoline');
  });

  it('cai para o resumo quando o carrinho passa do limite de itens', () => {
    const muitosItens = Array.from({ length: MAX_ITEMS_IN_FULL_MESSAGE + 1 }, (_, index) => ({
      ...carrinhoDoDesign[0]!,
      name: `Produto ${index + 1}`,
    }));

    const link = buildOrderWhatsAppLink('11999990000', { ...pedido, items: muitosItens });
    expect(link.compact).toBe(true);
    expect(link.message).toContain('9 itens');
  });

  it('nunca gera uma URL que o navegador vá truncar', () => {
    const nomeLongo = 'Tricoline Digital Premium Estampa Exclusiva Floral Vintage Coleção 2026';
    const carrinhoGrande = Array.from({ length: 40 }, (_, index) => ({
      ...carrinhoDoDesign[0]!,
      name: `${nomeLongo} ${index + 1}`,
    }));

    const link = buildOrderWhatsAppLink('11999990000', {
      ...pedido,
      items: carrinhoGrande,
      subtotal: 127200,
      total: 127200,
    });

    expect(link.compact).toBe(true);
    expect(encodeURIComponent(link.message).length).toBeLessThanOrEqual(SAFE_ENCODED_LENGTH);
    expect(link.url.length).toBeLessThan(2000);
    // O atendente ainda vê tudo: o link do pedido está na mensagem.
    expect(link.message).toContain('/p/CP-2026-0001');
  });

  it('mantém a mensagem completa dentro do orçamento de caracteres', () => {
    const link = buildOrderWhatsAppLink('11999990000', pedido);
    expect(encodeURIComponent(link.message).length).toBeLessThanOrEqual(SAFE_ENCODED_LENGTH);
  });
});

describe('buildProductInquiryUrl', () => {
  it('monta a compra rápida a partir da página do produto', () => {
    const url = buildProductInquiryUrl('11999990000', {
      name: 'Tricoline Floral Digital Premium',
      url: 'https://armarinhoaurora.com.br/produto/tricoline-floral-digital-premium',
      price: 1990,
    });

    const text = decodeURIComponent(url.split('text=')[1] ?? '');
    expect(text).toContain('*Tricoline Floral Digital Premium*');
    expect(text).toContain('R$ 19,90');
  });
});

describe('buildProductInquiryUrl com quantidade', () => {
  it('leva a metragem e o total escolhidos na página', () => {
    const url = buildProductInquiryUrl('5511999990000', {
      name: 'Tricoline Estampado',
      url: 'https://armarinhoaurora.com.br/produto/tricoline-estampado',
      price: 1590,
      quantity: 2.5,
      unit: 'metro',
      lineTotal: 3975,
    });

    const mensagem = decodeURIComponent(url.split('?text=')[1]!);

    expect(mensagem).toContain('*Tricoline Estampado* (R$ 15,90)');
    // É o valor do aceite da sprint: 2,5 m × R$ 15,90.
    expect(mensagem).toContain('Quantidade: 2,5 metros — total R$ 39,75');
  });

  it('inclui a variação escolhida', () => {
    const url = buildProductInquiryUrl('5511999990000', {
      name: 'Tricoline',
      url: 'https://exemplo/p',
      variantName: 'Azul',
    });

    expect(decodeURIComponent(url)).toContain('Variação: Azul');
  });

  it('sem quantidade, continua a mensagem curta de sempre', () => {
    const url = buildProductInquiryUrl('5511999990000', {
      name: 'Botão de Pérola',
      url: 'https://exemplo/p',
    });
    const mensagem = decodeURIComponent(url.split('?text=')[1]!);

    expect(mensagem).toBe(
      ['Olá! Tenho interesse neste produto: *Botão de Pérola*', 'https://exemplo/p'].join('\n'),
    );
  });
});
