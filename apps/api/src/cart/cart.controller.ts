import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from '../common/permissions.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { gravarCookieDoCarrinho, lerCookieDoCarrinho } from './cart.cookie';
import { CartService } from './cart.service';

/**
 * Carrinho do visitante.
 *
 * A identidade é um token aleatório em cookie httpOnly — o navegador manda,
 * o JavaScript da página não lê. Não é login: quem tiver o cookie tem o
 * carrinho, o que é exatamente o que se espera de um carrinho de convidado.
 * Como não há pagamento nem dado sensível aqui, o risco é perder ou herdar um
 * carrinho, não uma conta.
 */
export { CART_COOKIE } from './cart.cookie';

const adicionarSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  qty: z.coerce.number().positive().max(9999).default(1),
});

const quantidadeSchema = z.object({
  qty: z.coerce.number().positive().max(9999),
});

const cupomSchema = z.object({
  code: z.string().trim().min(1).max(40),
});

@ApiTags('Carrinho')
@Public()
@Controller('cart')
export class CartController {
  constructor(private readonly carrinho: CartService) {}

  @Get()
  @ApiOkResponse({ description: 'Carrinho atual, com preços lidos do catálogo agora.' })
  async ler(@Req() request: Request) {
    return this.carrinho.ler(this.token(request));
  }

  @Post('items')
  @ApiOkResponse({ description: 'Adiciona um produto. Repetir o mesmo item soma a quantidade.' })
  async adicionar(
    @Body(new ZodValidationPipe(adicionarSchema)) corpo: z.infer<typeof adicionarSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.garantirToken(request, response);
    return this.carrinho.adicionar(token, corpo);
  }

  @Patch('items/:id')
  @ApiOkResponse({ description: 'Muda a quantidade, respeitando o passo da unidade de venda.' })
  async alterar(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(quantidadeSchema)) corpo: z.infer<typeof quantidadeSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.garantirToken(request, response);
    return this.carrinho.alterarQuantidade(token, id, corpo.qty);
  }

  @Delete('items/:id')
  @ApiOkResponse({ description: 'Remove um item.' })
  async remover(
    @Param('id') id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = this.garantirToken(request, response);
    return this.carrinho.remover(token, id);
  }

  @Delete()
  @ApiOkResponse({ description: 'Esvazia o carrinho.' })
  async esvaziar(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.carrinho.esvaziar(this.garantirToken(request, response));
  }

  @Post('coupon')
  @ApiOkResponse({ description: 'Guarda o cupom. O motivo da recusa vem no corpo, não como erro.' })
  async aplicarCupom(
    @Body(new ZodValidationPipe(cupomSchema)) corpo: z.infer<typeof cupomSchema>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.carrinho.aplicarCupom(this.garantirToken(request, response), corpo.code);
  }

  @Delete('coupon')
  @ApiOkResponse({ description: 'Remove o cupom.' })
  async removerCupom(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.carrinho.removerCupom(this.garantirToken(request, response));
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  private token(request: Request): string | undefined {
    return lerCookieDoCarrinho(request);
  }

  /**
   * Devolve o token do cookie, criando um se ainda não houver.
   *
   * O cookie só nasce quando alguém realmente mexe no carrinho — visitar a
   * loja não deixa rastro nenhum no navegador.
   */
  private garantirToken(request: Request, response: Response): string {
    const existente = this.token(request);
    if (existente) return existente;

    const token = this.carrinho.novoToken();
    gravarCookieDoCarrinho(response, token);

    return token;
  }
}
