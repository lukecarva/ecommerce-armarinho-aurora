import {
  canConfirm,
  ENROLLMENT_STATUS_LABELS,
  formatSessionDate,
  seatStatus,
  slugify,
  type EnrollmentStatus,
  type PaymentMethod,
} from '@aurora/types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CourseLevel } from '@prisma/client';
import { fromCents, toCents } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Cursos no painel: cursos, turmas e inscrições.
 */

export interface DadosDoCurso {
  title: string;
  slug?: string | null;
  summary: string | null;
  description: string | null;
  coverUrl: string | null;
  /** Centavos. */
  price: number;
  durationMinutes: number | null;
  level: CourseLevel;
  materials: string | null;
  active: boolean;
}

export interface DadosDaTurma {
  startsAt: Date;
  endsAt: Date;
  room: string | null;
  instructor: string | null;
  instructorPhone: string | null;
  /** "fixo" (centavos) | "porcentagem" (0-100) */
  instructorFeeType: string | null;
  instructorFee: number | null;
  seatsTotal: number;
  notes: string | null;
}

export interface DadosDaInscricao {
  name: string;
  phone: string;
  email: string | null;
  status: EnrollmentStatus;
  notes: string | null;
  totalAmount: number | null;
  paidAmount: number | null;
  paidAt: Date | null;
  paymentMethod: PaymentMethod | null;
}

@Injectable()
export class AdminCoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar() {
    const agora = new Date();

    const cursos = await this.prisma.course.findMany({
      orderBy: [{ active: 'desc' }, { position: 'asc' }, { title: 'asc' }],
      include: {
        sessions: {
          orderBy: { startsAt: 'asc' },
          include: { _count: { select: { enrollments: true } } },
        },
      },
    });

    return cursos.map((curso) => {
      const futuras = curso.sessions.filter((s) => s.startsAt > agora && s.cancelledAt === null);
      const totalInscricoes = curso.sessions.reduce((s, t) => s + t._count.enrollments, 0);
      return {
        id: curso.id,
        title: curso.title,
        slug: curso.slug,
        price: toCents(curso.price),
        active: curso.active,
        proximasTurmas: futuras.length,
        proximaTurma: futuras[0] ? formatSessionDate(futuras[0].startsAt, futuras[0].endsAt) : null,
        totalInscricoes,
      };
    });
  }

  /** O curso com todas as turmas, e a contagem de inscrições por situação. */
  async obter(id: string) {
    const curso = await this.prisma.course.findUnique({
      where: { id },
      include: { sessions: { orderBy: { startsAt: 'desc' } } },
    });

    if (!curso) throw new NotFoundException('Curso não encontrado.');

    const contagens = await this.prisma.courseEnrollment.groupBy({
      by: ['sessionId', 'status'],
      where: { sessionId: { in: curso.sessions.map((turma) => turma.id) } },
      _count: { _all: true },
    });

    const porTurma = (sessionId: string, status: EnrollmentStatus) =>
      contagens.find((linha) => linha.sessionId === sessionId && linha.status === status)?._count
        ._all ?? 0;

    return {
      ...curso,
      price: toCents(curso.price),
      sessions: curso.sessions.map((turma) => {
        const confirmadas = porTurma(turma.id, 'confirmada');

        return {
          ...turma,
          dataTexto: formatSessionDate(turma.startsAt, turma.endsAt),
          situacao: seatStatus({
            seatsTotal: turma.seatsTotal,
            confirmadas,
            startsAt: turma.startsAt,
            cancelada: turma.cancelledAt !== null,
          }),
          inscricoes: {
            confirmada: confirmadas,
            pendente: porTurma(turma.id, 'pendente'),
            lista_de_espera: porTurma(turma.id, 'lista_de_espera'),
            cancelada: porTurma(turma.id, 'cancelada'),
          },
        };
      }),
    };
  }

  async criar(dados: DadosDoCurso) {
    const slug = await this.slugLivre(dados.slug || slugify(dados.title));
    const curso = await this.prisma.course.create({ data: { ...this.paraBanco(dados), slug } });
    return this.obter(curso.id);
  }

  async atualizar(id: string, dados: DadosDoCurso) {
    const atual = await this.prisma.course.findUnique({ where: { id }, select: { slug: true } });
    if (!atual) throw new NotFoundException('Curso não encontrado.');

    const desejado = dados.slug || atual.slug;
    const slug = desejado === atual.slug ? atual.slug : await this.slugLivre(desejado);

    await this.prisma.course.update({ where: { id }, data: { ...this.paraBanco(dados), slug } });
    return this.obter(id);
  }

  /**
   * Curso com inscrição não se apaga: se desativa. Apagar levaria junto o
   * registro de quem se inscreveu e pagou — e a loja precisa dele.
   */
  async remover(id: string): Promise<void> {
    await this.prisma.course.delete({ where: { id } });
  }

  // ─────────────────────────────── Turmas ──────────────────────────────────

  async criarTurma(courseId: string, dados: DadosDaTurma) {
    const curso = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!curso) throw new NotFoundException('Curso não encontrado.');

    this.validarTurma(dados);
    await this.prisma.courseSession.create({ data: { ...dados, courseId } });
    return this.obter(courseId);
  }

  async atualizarTurma(id: string, dados: DadosDaTurma) {
    const turma = await this.prisma.courseSession.findUnique({ where: { id } });
    if (!turma) throw new NotFoundException('Turma não encontrada.');

    this.validarTurma(dados);

    // Diminuir a turma abaixo de quem já foi confirmado deixaria alguém com
    // vaga garantida e sem cadeira.
    const confirmadas = await this.prisma.courseEnrollment.count({
      where: { sessionId: id, status: 'confirmada' },
    });
    if (dados.seatsTotal < confirmadas) {
      throw new BadRequestException(
        `Já há ${confirmadas} inscrição(ões) confirmada(s). A turma não pode ter menos vagas que isso.`,
      );
    }

    await this.prisma.courseSession.update({ where: { id }, data: dados });
    return this.obter(turma.courseId);
  }

  /**
   * Cancela a turma. Ela continua registrada — as inscrições também —, e a
   * agenda pública deixa de oferecê-la. Avisar cada pessoa é com a loja, pelo
   * WhatsApp: a lista de inscritos está na tela da turma.
   */
  async cancelarTurma(id: string) {
    const turma = await this.prisma.courseSession.findUnique({ where: { id } });
    if (!turma) throw new NotFoundException('Turma não encontrada.');

    await this.prisma.courseSession.update({ where: { id }, data: { cancelledAt: new Date() } });
    return this.obter(turma.courseId);
  }

  // ─────────────────────────────── Inscrições ──────────────────────────────

  async inscricoes(sessionId: string) {
    const turma = await this.prisma.courseSession.findUnique({
      where: { id: sessionId },
      include: {
        course: { select: { id: true, title: true, price: true } },
        enrollments: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!turma) throw new NotFoundException('Turma não encontrada.');

    const totalPagoConfirmados = turma.enrollments
      .filter((i) => i.status === 'confirmada')
      .reduce((s, i) => s + (i.paidAmount ?? 0), 0);

    const cacheCalculado =
      turma.instructorFee !== null && turma.instructorFeeType === 'porcentagem'
        ? Math.round((turma.instructorFee * totalPagoConfirmados) / 100)
        : turma.instructorFee;

    return {
      turma: {
        id: turma.id,
        curso: turma.course,
        startsAt: turma.startsAt,
        endsAt: turma.endsAt,
        dataTexto: formatSessionDate(turma.startsAt, turma.endsAt),
        room: turma.room,
        notes: turma.notes,
        seatsTotal: turma.seatsTotal,
        cancelada: turma.cancelledAt !== null,
        instructor: turma.instructor,
        instructorPhone: turma.instructorPhone,
        instructorFeeType: turma.instructorFeeType,
        instructorFee: turma.instructorFee,
        instructorPaidAmount: turma.instructorPaidAmount,
        instructorPaidAt: turma.instructorPaidAt,
        /** Valor calculado do cachê (fixo ou % do total pago pelas confirmadas). */
        cacheCalculado,
      },
      inscricoes: turma.enrollments.map((inscricao) => ({
        id: inscricao.id,
        name: inscricao.name,
        phone: inscricao.phone,
        email: inscricao.email,
        status: inscricao.status,
        statusLabel: ENROLLMENT_STATUS_LABELS[inscricao.status],
        notes: inscricao.notes,
        createdAt: inscricao.createdAt,
        paidAt: inscricao.paidAt,
        paidAmount: inscricao.paidAmount,
        totalAmount: inscricao.totalAmount,
        paymentMethod: inscricao.paymentMethod,
      })),
    };
  }

  /**
   * Muda a situação da inscrição.
   *
   * Confirmar trava a linha da turma (`FOR UPDATE`) antes de contar: duas
   * atendentes confirmando ao mesmo tempo entram em fila, e a segunda vê a
   * turma já cheia. Sem a trava, as duas contariam 9 de 10 e confirmariam —
   * onze pessoas para dez cadeiras.
   */
  async mudarStatus(id: string, status: EnrollmentStatus, notes: string | null) {
    const inscricao = await this.prisma.courseEnrollment.findUnique({ where: { id } });
    if (!inscricao) throw new NotFoundException('Inscrição não encontrada.');

    await this.prisma.$transaction(async (tx) => {
      if (status === 'confirmada' && inscricao.status !== 'confirmada') {
        await tx.$queryRaw`SELECT id FROM course_sessions WHERE id = ${inscricao.sessionId} FOR UPDATE`;

        const turma = await tx.courseSession.findUniqueOrThrow({
          where: { id: inscricao.sessionId },
        });
        const confirmadas = await tx.courseEnrollment.count({
          where: { sessionId: inscricao.sessionId, status: 'confirmada' },
        });

        if (!canConfirm(turma.seatsTotal, confirmadas)) {
          throw new BadRequestException(
            'A turma já está cheia. Aumente as vagas ou deixe esta pessoa na lista de espera.',
          );
        }
      }

      await tx.courseEnrollment.update({ where: { id }, data: { status, notes } });
    });

    return this.inscricoes(inscricao.sessionId);
  }

  async registrarPagamento(
    id: string,
    dados: {
      paidAt: Date | null;
      paidAmount: number | null;
      totalAmount: number | null;
      paymentMethod: PaymentMethod | null;
    },
  ) {
    const inscricao = await this.prisma.courseEnrollment.findUnique({ where: { id } });
    if (!inscricao) throw new NotFoundException('Inscrição não encontrada.');

    await this.prisma.courseEnrollment.update({
      where: { id },
      data: {
        paidAt: dados.paidAt,
        paidAmount: dados.paidAmount,
        totalAmount: dados.totalAmount,
        paymentMethod: dados.paymentMethod,
      },
    });

    return this.inscricoes(inscricao.sessionId);
  }

  async criarInscricao(sessionId: string, dados: DadosDaInscricao) {
    const turma = await this.prisma.courseSession.findUnique({ where: { id: sessionId } });
    if (!turma) throw new NotFoundException('Turma não encontrada.');

    if (dados.status === 'confirmada') {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM course_sessions WHERE id = ${sessionId} FOR UPDATE`;
        const confirmadas = await tx.courseEnrollment.count({
          where: { sessionId, status: 'confirmada' },
        });
        if (!canConfirm(turma.seatsTotal, confirmadas)) {
          throw new BadRequestException(
            'A turma já está cheia. Aumente as vagas ou use lista de espera.',
          );
        }
        await tx.courseEnrollment.create({
          data: {
            sessionId,
            name: dados.name,
            phone: dados.phone,
            email: dados.email,
            status: dados.status,
            notes: dados.notes,
            totalAmount: dados.totalAmount,
            paidAmount: dados.paidAmount,
            paidAt: dados.paidAt,
            paymentMethod: dados.paymentMethod,
          },
        });
      });
    } else {
      await this.prisma.courseEnrollment.create({
        data: {
          sessionId,
          name: dados.name,
          phone: dados.phone,
          email: dados.email,
          status: dados.status,
          notes: dados.notes,
          totalAmount: dados.totalAmount,
          paidAmount: dados.paidAmount,
          paidAt: dados.paidAt,
          paymentMethod: dados.paymentMethod,
        },
      });
    }

    return this.inscricoes(sessionId);
  }

  async atualizarInscricao(id: string, dados: DadosDaInscricao) {
    const inscricao = await this.prisma.courseEnrollment.findUnique({ where: { id } });
    if (!inscricao) throw new NotFoundException('Inscrição não encontrada.');

    if (dados.status === 'confirmada' && inscricao.status !== 'confirmada') {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM course_sessions WHERE id = ${inscricao.sessionId} FOR UPDATE`;
        const turma = await tx.courseSession.findUniqueOrThrow({
          where: { id: inscricao.sessionId },
        });
        const confirmadas = await tx.courseEnrollment.count({
          where: { sessionId: inscricao.sessionId, status: 'confirmada' },
        });
        if (!canConfirm(turma.seatsTotal, confirmadas)) {
          throw new BadRequestException(
            'A turma já está cheia. Aumente as vagas ou use lista de espera.',
          );
        }
        await tx.courseEnrollment.update({
          where: { id },
          data: {
            name: dados.name,
            phone: dados.phone,
            email: dados.email,
            status: dados.status,
            notes: dados.notes,
            paidAmount: dados.paidAmount,
            paidAt: dados.paidAt,
            paymentMethod: dados.paymentMethod,
          },
        });
      });
    } else {
      await this.prisma.courseEnrollment.update({
        where: { id },
        data: {
          name: dados.name,
          phone: dados.phone,
          email: dados.email,
          status: dados.status,
          notes: dados.notes,
          paidAmount: dados.paidAmount,
          paidAt: dados.paidAt,
          paymentMethod: dados.paymentMethod,
        },
      });
    }

    return this.inscricoes(inscricao.sessionId);
  }

  async registrarPagamentoProfessor(
    sessionId: string,
    dados: { instructorPaidAmount: number | null; instructorPaidAt: Date | null },
  ) {
    const turma = await this.prisma.courseSession.findUnique({ where: { id: sessionId } });
    if (!turma) throw new NotFoundException('Turma não encontrada.');

    await this.prisma.courseSession.update({
      where: { id: sessionId },
      data: {
        instructorPaidAmount: dados.instructorPaidAmount,
        instructorPaidAt: dados.instructorPaidAt,
      },
    });

    return this.inscricoes(sessionId);
  }

  // ─────────────────────────────── Agenda ─────────────────────────────────

  async agenda() {
    const agora = new Date();

    const turmas = await this.prisma.courseSession.findMany({
      where: { startsAt: { gte: agora }, cancelledAt: null },
      orderBy: { startsAt: 'asc' },
      include: {
        course: { select: { id: true, title: true } },
        _count: {
          select: {
            enrollments: { where: { status: 'confirmada' } },
          },
        },
      },
    });

    return turmas.map((t) => ({
      id: t.id,
      courseId: t.course.id,
      courseTitle: t.course.title,
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      dataTexto: formatSessionDate(t.startsAt, t.endsAt),
      room: t.room,
      instructor: t.instructor,
      seatsTotal: t.seatsTotal,
      confirmadas: t._count.enrollments,
      situacao: seatStatus({
        seatsTotal: t.seatsTotal,
        confirmadas: t._count.enrollments,
        startsAt: t.startsAt,
        cancelada: false,
      }),
    }));
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  private validarTurma(dados: DadosDaTurma): void {
    if (dados.endsAt <= dados.startsAt)
      throw new BadRequestException('O fim precisa ser depois do início.');
  }

  private async slugLivre(slug: string): Promise<string> {
    const existente = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existente) throw new ConflictException('Já existe um curso com este endereço.');
    return slug;
  }

  private paraBanco(dados: DadosDoCurso) {
    return {
      title: dados.title,
      summary: dados.summary,
      description: dados.description,
      coverUrl: dados.coverUrl,
      price: fromCents(dados.price),
      durationMinutes: dados.durationMinutes,
      level: dados.level,
      materials: dados.materials,
      active: dados.active,
    };
  }
}
