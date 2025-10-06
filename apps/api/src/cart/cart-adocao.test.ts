import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { CartService } from './cart.service';

/**
 * A adoção do carrinho ao entrar na conta. O caso que mais importa é o do
 * computador compartilhado: o carrinho de outra conta nunca é herdado.
 */

const FUTURO = new Date(Date.now() + 24 * 60 * 60 * 1000);

interface Carrinho {
  id: string;
  sessionToken: string;
  customerId: string | null;
  couponCode: string | null;
  expiresAt: Date;
  items: Array<{ id: string; productId: string; variantId: string | null; qty: number }>;
}

function carrinho(extra: Partial<Carrinho>): Carrinho {
  return {
    id: 'c',
    sessionToken: 'tok',
    customerId: null,
    couponCode: null,
    expiresAt: FUTURO,
    items: [],
    ...extra,
  };
}

function montar(doNavegador: Carrinho | null, daConta: Carrinho | null) {
  const cartUpdate = vi.fn().mockResolvedValue({});
  const cartDelete = vi.fn().mockResolvedValue({});
  const cartCreate = vi.fn((args: { data: { sessionToken: string } }) =>
    Promise.resolve(args.data),
  );
  const itemUpdate = vi.fn().mockResolvedValue({});
  const itemDelete = vi.fn().mockResolvedValue({});

  const tx = {
    cart: { update: cartUpdate, delete: cartDelete },
    cartItem: { update: itemUpdate, delete: itemDelete },
  };

  const prisma = {
    cart: {
      findUnique: vi.fn().mockResolvedValue(doNavegador),
      findFirst: vi.fn().mockResolvedValue(daConta),
      update: cartUpdate,
      create: cartCreate,
    },
    $transaction: vi.fn((funcao: (t: typeof tx) => Promise<unknown>) => funcao(tx)),
  } as unknown as PrismaService;

  return {
    servico: new CartService(prisma),
    cartUpdate,
    cartDelete,
    cartCreate,
    itemUpdate,
    itemDelete,
  };
}

describe('adotar o carrinho ao entrar', () => {
  it('só o navegador tem carrinho: ele passa a ser da conta', async () => {
    const { servico, cartUpdate } = montar(carrinho({ id: 'n', sessionToken: 'tok-n' }), null);

    expect(await servico.adotar('tok-n', 'cliente-1')).toBe('tok-n');
    expect(cartUpdate.mock.calls[0]![0].data.customerId).toBe('cliente-1');
  });

  it('só a conta tem: o navegador passa a apontar para ele', async () => {
    const { servico, cartUpdate } = montar(
      null,
      carrinho({ id: 'a', sessionToken: 'tok-a', customerId: 'cliente-1' }),
    );

    expect(await servico.adotar(undefined, 'cliente-1')).toBe('tok-a');
    expect(cartUpdate).not.toHaveBeenCalled();
  });

  it('os dois têm: soma o que se repete, move o resto e apaga o do navegador', async () => {
    const doNavegador = carrinho({
      id: 'n',
      sessionToken: 'tok-n',
      couponCode: 'TESTE10',
      items: [
        { id: 'i1', productId: 'tricoline', variantId: null, qty: 1.5 },
        { id: 'i2', productId: 'barbante', variantId: null, qty: 1 },
      ],
    });
    const daConta = carrinho({
      id: 'a',
      sessionToken: 'tok-a',
      customerId: 'cliente-1',
      items: [{ id: 'i9', productId: 'tricoline', variantId: null, qty: 2 }],
    });

    const { servico, itemUpdate, itemDelete, cartDelete, cartUpdate } = montar(
      doNavegador,
      daConta,
    );

    expect(await servico.adotar('tok-n', 'cliente-1')).toBe('tok-a');

    // Tricoline: 2 m na conta + 1,5 m no navegador = 3,5 m.
    expect(itemUpdate).toHaveBeenCalledWith({ where: { id: 'i9' }, data: { qty: 3.5 } });
    expect(itemDelete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    // Barbante só existia no navegador: muda de carrinho.
    expect(itemUpdate).toHaveBeenCalledWith({ where: { id: 'i2' }, data: { cartId: 'a' } });
    expect(cartDelete).toHaveBeenCalledWith({ where: { id: 'n' } });
    // O cupom do navegador vai junto quando a conta não tinha nenhum.
    expect(cartUpdate.mock.calls.at(-1)![0].data.couponCode).toBe('TESTE10');
  });

  it('computador compartilhado: o carrinho de outra conta é ignorado', async () => {
    const deOutraPessoa = carrinho({ id: 'x', sessionToken: 'tok-x', customerId: 'outra-pessoa' });
    const { servico, cartUpdate, itemUpdate } = montar(deOutraPessoa, null);

    // Sem carrinho próprio, o navegador fica sem carrinho — nunca com o da outra.
    expect(await servico.adotar('tok-x', 'cliente-1')).toBeNull();
    expect(cartUpdate).not.toHaveBeenCalled();
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it('computador compartilhado com carrinho próprio: fica com o próprio', async () => {
    const deOutraPessoa = carrinho({ id: 'x', sessionToken: 'tok-x', customerId: 'outra-pessoa' });
    const proprio = carrinho({ id: 'a', sessionToken: 'tok-a', customerId: 'cliente-1' });
    const { servico, itemUpdate } = montar(deOutraPessoa, proprio);

    expect(await servico.adotar('tok-x', 'cliente-1')).toBe('tok-a');
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it('ninguém tem carrinho: só cria quando pedido', async () => {
    const semCriar = montar(null, null);
    expect(await semCriar.servico.adotar(undefined, 'cliente-1')).toBeNull();
    expect(semCriar.cartCreate).not.toHaveBeenCalled();

    const criando = montar(null, null);
    const token = await criando.servico.adotar(undefined, 'cliente-1', { criar: true });
    expect(token).toBeTruthy();
    expect(criando.cartCreate.mock.calls[0]![0].data).toMatchObject({ customerId: 'cliente-1' });
  });
});
