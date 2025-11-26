import { describe, expect, it } from 'vitest';
import {
  buildEnrollmentMessage,
  canConfirm,
  formatDuration,
  formatSessionDate,
  lastSeatsThreshold,
  remainingSeats,
  seatStatus,
} from './courses.js';

const agora = new Date('2026-09-15T12:00:00Z');
const futuro = '2026-09-20T17:00:00Z';

describe('vagas', () => {
  it('conta só as confirmadas e nunca fica negativa', () => {
    expect(remainingSeats(10, 3)).toBe(7);
    expect(remainingSeats(10, 12)).toBe(0);
  });

  it('"últimas vagas" a partir de um quinto da turma, nunca menos de duas', () => {
    expect(lastSeatsThreshold(8)).toBe(2);
    expect(lastSeatsThreshold(30)).toBe(6);
  });

  it('situação da turma', () => {
    expect(seatStatus({ seatsTotal: 10, confirmadas: 2, startsAt: futuro }, agora)).toBe(
      'disponivel',
    );
    expect(seatStatus({ seatsTotal: 10, confirmadas: 8, startsAt: futuro }, agora)).toBe(
      'ultimas_vagas',
    );
    expect(seatStatus({ seatsTotal: 10, confirmadas: 10, startsAt: futuro }, agora)).toBe('lotada');
  });

  it('turma que já começou ou foi cancelada não aceita inscrição', () => {
    expect(
      seatStatus({ seatsTotal: 10, confirmadas: 0, startsAt: '2026-09-15T11:00:00Z' }, agora),
    ).toBe('encerrada');
    expect(
      seatStatus({ seatsTotal: 10, confirmadas: 0, startsAt: futuro, cancelada: true }, agora),
    ).toBe('encerrada');
  });

  it('a loja não confirma além da lotação', () => {
    expect(canConfirm(10, 9)).toBe(true);
    expect(canConfirm(10, 10)).toBe(false);
  });
});

describe('formatSessionDate', () => {
  it('no fuso da loja, com dia da semana e horário', () => {
    // 17h UTC = 14h em São Paulo.
    expect(formatSessionDate('2026-09-20T17:00:00Z', '2026-09-20T20:00:00Z')).toBe(
      'dom, 20/09 · 14h às 17h',
    );
  });

  it('minuto só aparece quando existe', () => {
    expect(formatSessionDate('2026-09-19T17:30:00Z', '2026-09-19T19:00:00Z')).toBe(
      'sáb, 19/09 · 14h30 às 16h',
    );
  });
});

describe('formatDuration', () => {
  it('escreve como se fala', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(90)).toBe('1h30');
  });
});

describe('buildEnrollmentMessage', () => {
  it('leva curso, turma, nome e valor — o que a atendente precisa para responder', () => {
    const mensagem = buildEnrollmentMessage({
      curso: 'Crochê para iniciantes',
      turma: 'sáb, 19/09 · 14h às 17h',
      nome: 'Maria',
      preco: 12000,
    });

    expect(mensagem).toContain('*Crochê para iniciantes*');
    expect(mensagem).toContain('Turma: sáb, 19/09 · 14h às 17h');
    expect(mensagem).toContain('Nome: Maria');
    expect(mensagem).toContain('Valor: R$ 120,00');
  });

  it('turma lotada vira pedido de lista de espera', () => {
    const mensagem = buildEnrollmentMessage({
      curso: 'Bordado',
      turma: 'x',
      nome: 'Ana',
      listaDeEspera: true,
    });
    expect(mensagem).toMatch(/lista de espera/);
  });
});
