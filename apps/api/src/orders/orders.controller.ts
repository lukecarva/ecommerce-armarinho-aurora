import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { CART_COOKIE } from '../cart/cart.controller';
import { CustomerAuthService } from '../account/customer-auth.service';
import { telefoneBr } from '../common/br-schemas';
import { clientIp } from '../common/current-user';
import { Public } from '../common/permissions.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrdersService } from './orders.service';

const criarSchema = z.object({
  nome: z.string().trim().min(2, 'Como podemos te chamar?').max(120),
  telefone: telefoneBr,
  // String vazia vira ausência: o campo é opcional e o formulário manda "".
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((valor) => valor || null)
    .refine((valor) => valor === null || z.string().email().safeParse(valor).success, {
      message: 'E-mail inválido.',
    }),
  deliveryMethodId: z.string().uuid('Escolha uma forma de receber.'),
  deliveryNote: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((valor) => valor || null),
  observacao: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((valor) => valor || null),
});

@ApiTags('Pedidos')
@Public()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly pedidos: OrdersService,
    private readonly clientes: CustomerAuthService,
  ) {}

  @Post()
  @ApiOkResponse({
    description:
      'Cria o pedido a partir do carrinho e devolve o código, o link do WhatsApp e a página pública.',
  })
  async criar(
    @Body(new ZodValidationPipe(criarSchema)) corpo: z.infer<typeof criarSchema>,
    @Req() request: Request,
  ) {
    const cookies = request.cookies as Record<string, string> | undefined;

    // Com sessão de cliente, o pedido entra em "Meus pedidos". Sem, é pedido
    // de convidado, como sempre foi.
    const cliente = await this.clientes.daRequisicao(request);

    return this.pedidos.criar(cookies?.[CART_COOKIE], {
      ...corpo,
      ip: clientIp(request),
      customerId: cliente?.id ?? null,
    });
  }

  @Get(':code')
  @ApiOkResponse({ description: 'Página pública do pedido. Exige o token do link.' })
  async publico(@Param('code') code: string, @Query('t') token: string) {
    return this.pedidos.publico(code, token ?? '');
  }

  @Post(':code/whatsapp')
  @ApiOkResponse({ description: 'Registra que o cliente abriu o WhatsApp.' })
  async clique(@Param('code') code: string, @Query('t') token: string) {
    return this.pedidos.registrarClique(code, token ?? '');
  }
}
