import { HttpException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitService } from './rate-limit.service';

const MINUTO = 60_000;

afterEach(() => {
  vi.useRealTimers();
});

describe('RateLimitService', () => {
  it('deixa passar até o limite', () => {
    const limite = new RateLimitService();

    for (let i = 0; i < 5; i++) limite.consumir('login:a', 5, 15 * MINUTO);
  });

  it('recusa a tentativa que passa do limite, com 429', () => {
    const limite = new RateLimitService();
    for (let i = 0; i < 3; i++) limite.consumir('login:a', 3, 15 * MINUTO);

    try {
      limite.consumir('login:a', 3, 15 * MINUTO);
      expect.unreachable('deveria ter recusado');
    } catch (erro) {
      expect(erro).toBeInstanceOf(HttpException);
      expect((erro as HttpException).getStatus()).toBe(429);
    }
  });

  it('diz quanto tempo falta, em minutos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T10:00:00Z'));

    const limite = new RateLimitService();
    limite.consumir('x', 1, 15 * MINUTO);
    vi.setSystemTime(new Date('2026-09-11T10:03:00Z'));

    expect(() => limite.consumir('x', 1, 15 * MINUTO)).toThrow(/12 minutos/);
  });

  it('a janela desliza: a tentativa velha deixa de contar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T10:00:00Z'));

    const limite = new RateLimitService();
    limite.consumir('x', 1, 15 * MINUTO);

    vi.setSystemTime(new Date('2026-09-11T10:16:00Z'));
    expect(() => limite.consumir('x', 1, 15 * MINUTO)).not.toThrow();
  });

  it('chaves diferentes não se misturam — um IP barrado não barra outro', () => {
    const limite = new RateLimitService();
    limite.consumir('ip:1', 1, 15 * MINUTO);

    expect(() => limite.consumir('ip:2', 1, 15 * MINUTO)).not.toThrow();
  });

  it('liberar zera a chave, como depois de um login certo', () => {
    const limite = new RateLimitService();
    limite.consumir('email:a', 1, 15 * MINUTO);
    limite.liberar('email:a');

    expect(() => limite.consumir('email:a', 1, 15 * MINUTO)).not.toThrow();
  });
});
