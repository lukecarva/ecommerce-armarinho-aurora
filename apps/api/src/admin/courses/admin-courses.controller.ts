import { COURSE_LEVELS, ENROLLMENT_STATUSES, PAYMENT_METHODS } from '@aurora/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { textoOpcional } from '../../common/br-schemas';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { AdminCoursesService, type DadosDaInscricao } from './admin-courses.service';

const cursoSchema = z.object({
  title: z.string().trim().min(2, 'Informe o nome do curso.').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífen.')
    .max(80)
    .optional()
    .nullable(),
  summary: textoOpcional(200),
  description: textoOpcional(10_000),
  coverUrl: z
    .string()
    .trim()
    .refine(
      (valor) => /^https:\/\//.test(valor) || (valor.startsWith('/') && !valor.startsWith('//')),
      'Imagem inválida.',
    )
    .nullable()
    .optional()
    .transform((valor) => valor || null),
  /** Centavos. Curso gratuito é zero. */
  price: z.coerce.number().int().min(0),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(15)
    .max(24 * 60)
    .nullable()
    .optional()
    .transform((valor) => valor ?? null),
  level: z.enum(COURSE_LEVELS).default('todos'),
  materials: textoOpcional(500),
  active: z.boolean().default(true),
});

const turmaSchema = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  room: textoOpcional(60),
  instructor: textoOpcional(80),
  instructorPhone: textoOpcional(20),
  instructorFeeType: z
    .enum(['fixo', 'porcentagem'])
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  instructorFee: z.coerce
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  seatsTotal: z.coerce.number().int().min(1, 'A turma precisa de ao menos uma vaga.').max(200),
  notes: textoOpcional(500),
});

const inscricaoSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome.').max(120),
    phone: z.string().trim().min(8).max(20),
    email: z
      .string()
      .trim()
      .email()
      .nullable()
      .optional()
      .transform((v) => v || null),
    status: z.enum(ENROLLMENT_STATUSES).default('confirmada'),
    notes: textoOpcional(500),
    totalAmount: z.coerce
      .number()
      .int()
      .min(0)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    paidAmount: z.coerce
      .number()
      .int()
      .min(0)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    paidAt: z.coerce
      .date()
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    paymentMethod: z
      .enum(PAYMENT_METHODS)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .transform((d): DadosDaInscricao => ({
    name: d.name,
    phone: d.phone,
    email: d.email ?? null,
    status: d.status,
    notes: d.notes,
    totalAmount: d.totalAmount,
    paidAmount: d.paidAmount,
    paidAt: d.paidAt,
    paymentMethod: d.paymentMethod,
  }));

const statusSchema = z.object({
  status: z.enum(ENROLLMENT_STATUSES),
  notes: textoOpcional(500),
});

const pagamentoSchema = z
  .object({
    paidAt: z.coerce.date().nullable(),
    paidAmount: z.coerce.number().int().min(0).nullable(),
    totalAmount: z.coerce
      .number()
      .int()
      .min(0)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  })
  .refine((d) => d.paidAt === null || d.paidAmount !== null, {
    message: 'Informe o valor quando registrar o pagamento.',
    path: ['paidAmount'],
  });

const pagamentoProfSchema = z.object({
  instructorPaidAmount: z.coerce.number().int().min(0).nullable(),
  instructorPaidAt: z.coerce.date().nullable(),
});

@ApiTags('Admin — Cursos')
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(private readonly cursos: AdminCoursesService) {}

  @Get()
  @RequirePermissions('cursos:ver')
  @ApiOkResponse({ description: 'Cursos com a próxima turma de cada um.' })
  listar() {
    return this.cursos.listar();
  }

  @Get('agenda')
  @RequirePermissions('cursos:ver')
  @ApiOkResponse({ description: 'Todas as turmas futuras ordenadas por data.' })
  agenda() {
    return this.cursos.agenda();
  }

  @Get('sessions/:id/enrollments')
  @RequirePermissions('cursos:ver')
  @ApiOkResponse({ description: 'Quem se inscreveu na turma, e em que situação.' })
  inscricoes(@Param('id', ParseUUIDPipe) id: string) {
    return this.cursos.inscricoes(id);
  }

  @Get(':id')
  @RequirePermissions('cursos:ver')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.cursos.obter(id);
  }

  @Post()
  @RequirePermissions('cursos:editar')
  criar(@Body(new ZodValidationPipe(cursoSchema)) corpo: z.infer<typeof cursoSchema>) {
    return this.cursos.criar(corpo);
  }

  @Put(':id')
  @RequirePermissions('cursos:editar')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cursoSchema)) corpo: z.infer<typeof cursoSchema>,
  ) {
    return this.cursos.atualizar(id, corpo);
  }

  @Delete(':id')
  @RequirePermissions('cursos:editar')
  async remover(@Param('id', ParseUUIDPipe) id: string) {
    await this.cursos.remover(id);
    return { ok: true };
  }

  @Post(':id/sessions')
  @RequirePermissions('cursos:editar')
  @ApiOkResponse({ description: 'Abre uma turma do curso.' })
  criarTurma(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(turmaSchema)) corpo: z.infer<typeof turmaSchema>,
  ) {
    return this.cursos.criarTurma(id, corpo);
  }

  @Put('sessions/:id')
  @RequirePermissions('cursos:editar')
  atualizarTurma(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(turmaSchema)) corpo: z.infer<typeof turmaSchema>,
  ) {
    return this.cursos.atualizarTurma(id, corpo);
  }

  @Post('sessions/:id/cancel')
  @RequirePermissions('cursos:editar')
  @ApiOkResponse({ description: 'Cancela a turma. Ela e as inscrições continuam registradas.' })
  cancelarTurma(@Param('id', ParseUUIDPipe) id: string) {
    return this.cursos.cancelarTurma(id);
  }

  @Patch('enrollments/:id')
  @RequirePermissions('cursos:editar')
  @ApiOkResponse({
    description: 'Confirma, cancela ou põe na lista de espera. Não confirma além da lotação.',
  })
  mudarStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(statusSchema)) corpo: z.infer<typeof statusSchema>,
  ) {
    return this.cursos.mudarStatus(id, corpo.status, corpo.notes);
  }

  @Patch('enrollments/:id/payment')
  @RequirePermissions('cursos:editar')
  @ApiOkResponse({ description: 'Registra ou limpa o pagamento de uma inscrição.' })
  registrarPagamento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pagamentoSchema)) corpo: z.infer<typeof pagamentoSchema>,
  ) {
    return this.cursos.registrarPagamento(id, corpo);
  }

  @Post('sessions/:id/enrollments')
  @RequirePermissions('cursos:editar')
  @ApiOkResponse({ description: 'Cadastra um aluno manualmente na turma.' })
  criarInscricao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(inscricaoSchema)) corpo: DadosDaInscricao,
  ) {
    return this.cursos.criarInscricao(id, corpo);
  }

  @Put('enrollments/:id')
  @RequirePermissions('cursos:editar')
  @ApiOkResponse({ description: 'Atualiza todos os dados de uma inscrição.' })
  atualizarInscricao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(inscricaoSchema)) corpo: DadosDaInscricao,
  ) {
    return this.cursos.atualizarInscricao(id, corpo);
  }

  @Patch('sessions/:id/instructor-payment')
  @RequirePermissions('cursos:editar')
  @ApiOkResponse({ description: 'Registra ou limpa o pagamento ao professor da turma.' })
  registrarPagamentoProfessor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pagamentoProfSchema)) corpo: z.infer<typeof pagamentoProfSchema>,
  ) {
    return this.cursos.registrarPagamentoProfessor(id, corpo);
  }
}
