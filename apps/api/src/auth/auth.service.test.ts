import { describe, expect, it } from 'vitest';
import { parseDuration } from './auth.service';

describe('parseDuration', () => {
  it('converte as durações usadas na configuração de token', () => {
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('30d')).toBe(2_592_000_000);
    expect(parseDuration('12h')).toBe(43_200_000);
    expect(parseDuration('45s')).toBe(45_000);
  });

  it('tolera espaço em volta', () => {
    expect(parseDuration(' 7d ')).toBe(604_800_000);
  });

  it('recusa formato inválido em vez de assumir um padrão silencioso', () => {
    expect(() => parseDuration('15')).toThrow(/Duração inválida/);
    expect(() => parseDuration('15 minutos')).toThrow(/Duração inválida/);
    expect(() => parseDuration('')).toThrow(/Duração inválida/);
  });
});
