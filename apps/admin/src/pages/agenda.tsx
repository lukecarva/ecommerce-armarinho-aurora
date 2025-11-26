import { SEAT_STATUS_LABELS, type SeatStatus } from '@aurora/types';
import { cn } from '@aurora/ui';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, MapPin, User } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/layout';
import { Card, EmptyState, Spinner } from '../components/ui';
import { api, type AgendaEventoAdmin } from '../lib/api';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const statusClasses: Record<SeatStatus, string> = {
  disponivel: 'bg-green-100 text-green-700',
  ultimas_vagas: 'bg-accent-50 text-accent-700',
  lotada: 'bg-red-100 text-red-700',
  encerrada: 'bg-ink-100 text-ink-500',
};

function chaveDoMes(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function labelMes(chave: string) {
  const partes = chave.split('-').map(Number);
  const ano = partes[0] ?? 0;
  const mes = partes[1] ?? 1;
  return `${MESES[mes - 1] ?? ''} ${ano}`;
}

function agruparPorMes(eventos: AgendaEventoAdmin[]) {
  const mapa = new Map<string, AgendaEventoAdmin[]>();
  for (const ev of eventos) {
    const k = chaveDoMes(ev.startsAt);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(ev);
  }
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function AgendaPage() {
  const agenda = useQuery({
    queryKey: ['cursos', 'agenda'],
    queryFn: api.cursos.agenda,
    refetchOnWindowFocus: true,
  });

  const grupos = agenda.data ? agruparPorMes(agenda.data) : [];

  return (
    <>
      <PageHeader title="Agenda" description="Próximas turmas e workshops, ordenados por data." />

      {agenda.isLoading ? (
        <Spinner label="Carregando agenda…" />
      ) : agenda.data && agenda.data.length > 0 ? (
        <div className="space-y-6">
          {grupos.map(([chave, eventos]) => (
            <section key={chave}>
              <h2 className="text-ink-500 mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
                <CalendarDays className="size-3.5" aria-hidden />
                {labelMes(chave)}
              </h2>
              <Card className="divide-ink-100 divide-y p-0">
                {eventos.map((ev) => (
                  <EventoRow key={ev.id} ev={ev} />
                ))}
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma turma agendada."
          description="Adicione turmas nos cursos para vê-las aqui."
        />
      )}
    </>
  );
}

function EventoRow({ ev }: { ev: AgendaEventoAdmin }) {
  const inicio = new Date(ev.startsAt);
  const dia = inicio.getDate();
  const semana = DIAS[inicio.getDay()];
  const vagas = ev.seatsTotal - ev.confirmadas;

  return (
    <div className="flex items-start gap-4 px-4 py-3">
      {/* Calendário compacto */}
      <div className="bg-brand-50 border-brand-200 flex w-12 shrink-0 flex-col items-center rounded-lg border py-1.5">
        <span className="text-brand-500 text-[0.625rem] font-semibold uppercase">{semana}</span>
        <span className="text-brand-700 text-xl leading-none font-bold">{dia}</span>
      </div>

      {/* Conteúdo */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link
            to={`/cursos/${ev.courseId}`}
            className="text-ink-900 hover:text-brand-600 truncate text-sm font-semibold transition-colors"
          >
            {ev.courseTitle}
          </Link>
          <span
            className={cn(
              'rounded-pill px-2 py-0.5 text-xs leading-5 font-medium',
              statusClasses[ev.situacao],
            )}
          >
            {SEAT_STATUS_LABELS[ev.situacao]}
          </span>
        </div>

        <p className="text-ink-500 mt-0.5 text-xs">{ev.dataTexto}</p>

        <div className="text-ink-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {ev.room ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden />
              {ev.room}
            </span>
          ) : null}
          {ev.instructor ? (
            <span className="flex items-center gap-1">
              <User className="size-3 shrink-0" aria-hidden />
              {ev.instructor}
            </span>
          ) : null}
          <span>
            {ev.confirmadas}/{ev.seatsTotal} confirmados
            {vagas > 0 ? ` · ${vagas} vaga${vagas > 1 ? 's' : ''}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
