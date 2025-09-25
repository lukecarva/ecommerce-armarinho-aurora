import { z } from 'zod';

/**
 * Validações de dado brasileiro, usadas em mais de uma rota.
 */

/**
 * Telefone brasileiro, do jeito que as pessoas digitam.
 *
 * Aceita "(11) 99999-0000", "11999990000" e "+55 11 99999-0000"; guarda só os
 * dígitos com DDI. Exigir um formato único faria a cliente errar três vezes
 * antes de conseguir finalizar — no celular, com pressa.
 */
export const telefoneBr = z
  .string()
  .trim()
  .transform((valor) => valor.replace(/\D/g, ''))
  .refine((digitos) => digitos.length >= 10 && digitos.length <= 13, {
    message: 'Informe um WhatsApp com DDD.',
  })
  .transform((digitos) => (digitos.length <= 11 ? `55${digitos}` : digitos));

/** Texto opcional em que string vazia vira ausência — é o que o formulário manda. */
export function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo)
    .optional()
    .nullable()
    .transform((valor) => valor || null);
}
