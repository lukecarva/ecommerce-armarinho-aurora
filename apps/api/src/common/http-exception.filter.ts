import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  path: string;
  timestamp: string;
}

/**
 * Traduz exceções para uma resposta previsível, em português.
 *
 * Também converte erros conhecidos do Prisma: violação de unicidade vira 409
 * com a mensagem certa em vez de um 500 sem contexto.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const body = this.toBody(exception, request.url);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const status = exception.getStatus();

      if (typeof payload === 'object' && payload !== null) {
        const record = payload as Record<string, unknown>;
        return {
          statusCode: status,
          message: typeof record.message === 'string' ? record.message : exception.message,
          ...(Array.isArray(record.errors) ? { errors: record.errors as ErrorBody['errors'] } : {}),
          path,
          timestamp,
        };
      }

      return { statusCode: status, message: exception.message, path, timestamp };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return { ...this.fromPrisma(exception), path, timestamp };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno. Tente novamente em instantes.',
      path,
      timestamp,
    };
  }

  private fromPrisma(
    error: Prisma.PrismaClientKnownRequestError,
  ): Pick<ErrorBody, 'statusCode' | 'message' | 'errors'> {
    switch (error.code) {
      case 'P2002': {
        const target = error.meta?.target;
        const fields = Array.isArray(target) ? target.map(String) : [];
        const campo = fields.map(friendlyField).join(', ') || 'valor';
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Já existe um registro com este ${campo}.`,
          errors: fields.map((field) => ({ field, message: 'Já está em uso' })),
        };
      }
      case 'P2025':
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Registro não encontrado.' };
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Existe outro registro dependendo deste. Remova os vínculos antes.',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Erro ao acessar o banco de dados.',
        };
    }
  }
}

function friendlyField(field: string): string {
  const labels: Record<string, string> = {
    slug: 'endereço (slug)',
    email: 'e-mail',
    sku_futura: 'código do Futura',
    skuFutura: 'código do Futura',
    name: 'nome',
    key: 'identificador',
  };
  return labels[field] ?? field;
}
