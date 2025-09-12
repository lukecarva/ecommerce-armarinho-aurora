import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULE,
  formatScheduleLines,
  formatTime,
  getStoreStatus,
} from './business-hours.js';

/**
 * O Brasil não tem mais horário de verão, então America/Sao_Paulo é UTC−3
 * o ano inteiro — as datas em UTC abaixo são estáveis.
 *
 * 08/09/2026 é uma terça-feira.
 */
const tercaMeioDia = new Date('2026-09-08T15:00:00Z'); // 12h em São Paulo
const tercaCedo = new Date('2026-09-08T11:00:00Z'); // 8h
const tercaNoite = new Date('2026-09-08T23:00:00Z'); // 20h
const sabadoTarde = new Date('2026-09-12T20:00:00Z'); // 17h — sábado fecha 16h
const domingo = new Date('2026-09-13T15:00:00Z'); // 12h de domingo

describe('getStoreStatus', () => {
  it('reconhece a loja aberta no meio do expediente', () => {
    const status = getStoreStatus(DEFAULT_SCHEDULE, tercaMeioDia);
    expect(status.isOpen).toBe(true);
    expect(status.label).toBe('Aberto agora');
    expect(status.message).toContain('até 18h');
  });

  it('antes de abrir, informa o horário do mesmo dia', () => {
    const status = getStoreStatus(DEFAULT_SCHEDULE, tercaCedo);
    expect(status.isOpen).toBe(false);
    expect(status.opensAgain?.isToday).toBe(true);
    expect(status.message).toContain('hoje às 9h');
  });

  it('depois de fechar, aponta para o próximo dia útil', () => {
    const status = getStoreStatus(DEFAULT_SCHEDULE, tercaNoite);
    expect(status.isOpen).toBe(false);
    expect(status.opensAgain?.weekday).toBe(3); // quarta
    expect(status.message).toContain('quarta-feira às 9h');
  });

  it('sábado após as 16h já aponta para segunda', () => {
    const status = getStoreStatus(DEFAULT_SCHEDULE, sabadoTarde);
    expect(status.isOpen).toBe(false);
    expect(status.opensAgain?.weekday).toBe(1);
    expect(status.message).toContain('segunda-feira às 9h');
  });

  it('domingo a loja está fechada o dia todo', () => {
    const status = getStoreStatus(DEFAULT_SCHEDULE, domingo);
    expect(status.isOpen).toBe(false);
    expect(status.opensAgain?.weekday).toBe(1);
  });

  it('respeita feriado cadastrado, mesmo em dia útil', () => {
    const comFeriado = {
      ...DEFAULT_SCHEDULE,
      holidays: [{ date: '2026-09-08', label: 'Feriado municipal' }],
    };

    const status = getStoreStatus(comFeriado, tercaMeioDia);
    expect(status.isOpen).toBe(false);
    expect(status.holiday?.label).toBe('Feriado municipal');
    expect(status.opensAgain?.weekday).toBe(3); // pula para quarta
  });

  it('não depende do fuso de quem acessa o site', () => {
    // Mesmo instante, escrito com outro offset: continua sendo 12h em São Paulo.
    const mesmoInstante = new Date('2026-09-08T12:00:00-03:00');
    expect(getStoreStatus(DEFAULT_SCHEDULE, mesmoInstante).isOpen).toBe(true);
  });
});

describe('formatTime', () => {
  it('escreve o horário como a loja comunica', () => {
    expect(formatTime('09:00')).toBe('9h');
    expect(formatTime('18:00')).toBe('18h');
    expect(formatTime('16:30')).toBe('16h30');
  });
});

describe('formatScheduleLines', () => {
  it('agrupa os dias iguais para o rodapé', () => {
    expect(formatScheduleLines(DEFAULT_SCHEDULE)).toEqual([
      'Seg a sex: 9h às 18h',
      'Sáb: 9h às 16h',
    ]);
  });
});
