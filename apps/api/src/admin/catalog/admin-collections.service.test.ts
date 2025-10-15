import { describe, expect, it } from 'vitest';
import { isLive } from './admin-collections.service';

const AGORA = new Date('2026-09-08T15:00:00Z');

describe('isLive', () => {
  it('coleção sem datas fica no ar enquanto estiver ativa', () => {
    expect(isLive({ active: true, startsAt: null, endsAt: null }, AGORA)).toBe(true);
    expect(isLive({ active: false, startsAt: null, endsAt: null }, AGORA)).toBe(false);
  });

  it('coleção programada não aparece antes da data de início', () => {
    const natal = {
      active: true,
      startsAt: new Date('2026-11-15T00:00:00Z'),
      endsAt: new Date('2026-12-26T00:00:00Z'),
    };

    expect(isLive(natal, AGORA)).toBe(false);
    expect(isLive(natal, new Date('2026-12-01T12:00:00Z'))).toBe(true);
  });

  it('coleção sai da vitrine sozinha ao passar da data final', () => {
    const juninas = {
      active: true,
      startsAt: new Date('2026-05-20T00:00:00Z'),
      endsAt: new Date('2026-07-01T00:00:00Z'),
    };

    expect(isLive(juninas, AGORA)).toBe(false);
  });

  it('desativar manualmente vence a janela de datas', () => {
    const emCartaz = {
      active: false,
      startsAt: new Date('2026-09-01T00:00:00Z'),
      endsAt: new Date('2026-09-30T00:00:00Z'),
    };

    expect(isLive(emCartaz, AGORA)).toBe(false);
  });
});
