import type { Request, Response } from 'express';

/**
 * Cookie do carrinho, lido e escrito em mais de um lugar.
 *
 * O carrinho em si mexe nele, e a conta do cliente também: ao entrar, o
 * carrinho de convidado é unido ao da conta e o cookie passa a apontar para
 * o resultado; ao sair, o cookie é apagado para o próximo a usar o mesmo
 * computador não herdar a sacola de ninguém.
 */
export const CART_COOKIE = 'cp_carrinho';

/** Trinta dias. Carrinho mais velho que isso é lixo com preço velho. */
export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function lerCookieDoCarrinho(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, string> | undefined;
  return cookies?.[CART_COOKIE];
}

export function gravarCookieDoCarrinho(response: Response, token: string): void {
  response.cookie(CART_COOKIE, token, {
    httpOnly: true,
    // `lax` basta: o carrinho só é alterado a partir da própria loja.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CART_TTL_MS,
  });
}

export function apagarCookieDoCarrinho(response: Response): void {
  response.clearCookie(CART_COOKIE, { path: '/' });
}
