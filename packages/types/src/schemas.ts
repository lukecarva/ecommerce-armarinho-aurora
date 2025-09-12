import { z } from 'zod';
import { DELIVERY_TYPES, SALE_UNITS } from './enums.js';

/** Telefone brasileiro com DDD, aceitando máscara. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => digits.length === 10 || digits.length === 11, {
    message: 'Informe um telefone com DDD, ex.: (11) 99999-0000',
  });

export const cepSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => digits.length === 8, { message: 'CEP deve ter 8 dígitos' });

/** Identidade visual — tudo enviado pelo painel, nada versionado no código. */
export const brandingSchema = z.object({
  logoPrincipal: z.string().url().nullable().default(null),
  logoRodape: z.string().url().nullable().default(null),
  logoMono: z.string().url().nullable().default(null),
  favicon: z.string().url().nullable().default(null),
  ogImage: z.string().url().nullable().default(null),
  iconesPwa: z.array(z.object({ size: z.number().int(), url: z.string().url() })).default([]),
  corPrimaria: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#1B3A8C'),
  corSecundaria: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#FDC300'),
  corDestaque: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#E30613'),
});
export type Branding = z.infer<typeof brandingSchema>;

export const businessHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  closed: z.boolean(),
});

export const storeInfoSchema = z.object({
  name: z.string(),
  legalName: z.string(),
  cnpj: z.string(),
  whatsapp: z.string(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  address: z.object({
    street: z.string(),
    number: z.string(),
    district: z.string(),
    city: z.string(),
    uf: z.string().length(2),
    cep: z.string(),
  }),
  instagram: z.string().nullable(),
});
export type StoreInfo = z.infer<typeof storeInfoSchema>;

export const deliveryMethodSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  type: z.enum(DELIVERY_TYPES),
  /** "Grátis" | "Consultar valor" — texto, nunca um cálculo. */
  priceLabel: z.string(),
  asksAddress: z.boolean(),
  position: z.number().int(),
});
export type DeliveryMethod = z.infer<typeof deliveryMethodSchema>;

/** Item enviado pelo carrinho ao criar o pedido. */
export const createOrderItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
});

export const createOrderSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome'),
  phone: phoneSchema,
  email: z.string().email().optional().nullable(),
  deliveryMethodId: z.string(),
  deliveryNote: z.string().trim().max(140).optional().nullable(),
  couponCode: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  items: z.array(createOrderItemSchema).min(1, 'O carrinho está vazio'),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const saleUnitSchema = z.enum(SALE_UNITS);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
});

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}
