import { BadRequestException, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

/**
 * Valida o corpo/query da requisição contra um schema Zod compartilhado.
 *
 * Usar o mesmo schema no front e na API garante que a mensagem de erro que
 * o cliente vê no formulário é a mesma que o servidor aplica.
 *
 * O schema é tipado como `ZodTypeAny` de propósito: schemas com `transform`
 * têm tipos de entrada e saída diferentes (um `string` que vira objeto, por
 * exemplo), e amarrar o genérico à saída recusaria justamente esses. Quem
 * chama declara o tipo no parâmetro do controller, com `z.infer`.
 */
export class ZodValidationPipe<TOutput = unknown> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Dados inválidos',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return result.data as TOutput;
  }
}
