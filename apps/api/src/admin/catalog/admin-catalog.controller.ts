import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { clientIp, CurrentUser, type AuthenticatedUser } from '../../common/current-user';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminCollectionsService } from './admin-collections.service';
import { AdminProductsService } from './admin-products.service';
import { MOTIVOS_SUGERIDOS, StockService } from './stock.service';
import {
  ajusteDeEstoqueSchema,
  bulkUpdateSchema,
  categoryInputSchema,
  categoryReorderSchema,
  collectionInputSchema,
  customerGroupSchema,
  productInputSchema,
  paginacaoSchema,
  productListSchema,
} from './dto';

@ApiTags('Admin — Catálogo')
@Controller('admin')
export class AdminCatalogController {
  constructor(
    private readonly categories: AdminCategoriesService,
    private readonly collections: AdminCollectionsService,
    private readonly products: AdminProductsService,
    private readonly stock: StockService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────────── Categorias ────────────────────────────────

  @Get('categories')
  @RequirePermissions('catalogo:ver')
  @ApiOkResponse({ description: 'Árvore completa de categorias, com contagem de produtos.' })
  listCategories() {
    return this.categories.tree();
  }

  @Post('categories')
  @RequirePermissions('catalogo:criar')
  async createCategory(
    @Body(new ZodValidationPipe(categoryInputSchema)) body: z.infer<typeof categoryInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const category = await this.categories.create(body);
    await this.audit.record({
      actorId: user.id,
      entity: 'categoria',
      entityId: category.id,
      action: 'criar',
      after: { name: category.name, slug: category.slug },
      ip: clientIp(request),
    });
    return category;
  }

  @Put('categories/:id')
  @RequirePermissions('catalogo:editar')
  async updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: z.infer<typeof categoryInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const before = await this.categories.findOne(id);
    const after = await this.categories.update(id, body);

    await this.audit.record({
      actorId: user.id,
      entity: 'categoria',
      entityId: id,
      action: 'editar',
      before,
      after,
      ip: clientIp(request),
    });

    return after;
  }

  @Patch('categories/reorder')
  @RequirePermissions('catalogo:editar')
  @ApiOkResponse({ description: 'Aplica a nova ordem e hierarquia da árvore.' })
  async reorderCategories(
    @Body(new ZodValidationPipe(categoryReorderSchema)) body: z.infer<typeof categoryReorderSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const tree = await this.categories.reorder(body.items);

    await this.audit.record({
      actorId: user.id,
      entity: 'categoria',
      entityId: 'arvore',
      action: 'reordenar',
      after: { total: body.items.length },
      ip: clientIp(request),
    });

    return tree;
  }

  @Delete('categories/:id')
  @RequirePermissions('catalogo:excluir')
  async removeCategory(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const before = await this.categories.findOne(id);
    await this.categories.remove(id);

    await this.audit.record({
      actorId: user.id,
      entity: 'categoria',
      entityId: id,
      action: 'excluir',
      before,
      ip: clientIp(request),
    });

    return { ok: true };
  }

  // ────────────────────────────── Coleções ─────────────────────────────────

  @Get('collections')
  @RequirePermissions('catalogo:ver')
  listCollections() {
    return this.collections.list();
  }

  @Get('collections/:id')
  @RequirePermissions('catalogo:ver')
  findCollection(@Param('id') id: string) {
    return this.collections.findOne(id);
  }

  @Post('collections')
  @RequirePermissions('catalogo:criar')
  async createCollection(
    @Body(new ZodValidationPipe(collectionInputSchema)) body: z.infer<typeof collectionInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const collection = await this.collections.create(body);
    await this.audit.record({
      actorId: user.id,
      entity: 'colecao',
      entityId: collection.id,
      action: 'criar',
      after: { name: collection.name },
      ip: clientIp(request),
    });
    return collection;
  }

  @Put('collections/:id')
  @RequirePermissions('catalogo:editar')
  async updateCollection(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(collectionInputSchema)) body: z.infer<typeof collectionInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const collection = await this.collections.update(id, body);
    await this.audit.record({
      actorId: user.id,
      entity: 'colecao',
      entityId: id,
      action: 'editar',
      after: { name: collection.name, produtos: collection.productIds.length },
      ip: clientIp(request),
    });
    return collection;
  }

  @Delete('collections/:id')
  @RequirePermissions('catalogo:excluir')
  async removeCollection(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.collections.remove(id);
    await this.audit.record({
      actorId: user.id,
      entity: 'colecao',
      entityId: id,
      action: 'excluir',
      ip: clientIp(request),
    });
    return { ok: true };
  }

  // ────────────────────────────── Produtos ─────────────────────────────────

  @Get('products')
  @RequirePermissions('catalogo:ver')
  @ApiOkResponse({ description: 'Lista paginada com filtros e busca.' })
  listProducts(
    @Query(new ZodValidationPipe(productListSchema)) query: z.infer<typeof productListSchema>,
  ) {
    return this.products.list(query);
  }

  @Get('products/:id')
  @RequirePermissions('catalogo:ver')
  findProduct(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Post('products')
  @RequirePermissions('catalogo:criar')
  async createProduct(
    @Body(new ZodValidationPipe(productInputSchema)) body: z.infer<typeof productInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const product = await this.products.create(body);
    await this.audit.record({
      actorId: user.id,
      entity: 'produto',
      entityId: product.id,
      action: 'criar',
      after: { name: product.name, price: product.price, status: product.status },
      ip: clientIp(request),
    });
    return product;
  }

  @Put('products/:id')
  @RequirePermissions('catalogo:editar')
  async updateProduct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(productInputSchema)) body: z.infer<typeof productInputSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const before = await this.products.findOne(id);
    const after = await this.products.update(id, body);

    await this.audit.record({
      actorId: user.id,
      entity: 'produto',
      entityId: id,
      action: 'editar',
      before: { name: before.name, price: before.price, status: before.status },
      after: { name: after.name, price: after.price, status: after.status },
      ip: clientIp(request),
    });

    return after;
  }

  @Patch('products/bulk')
  @RequirePermissions('catalogo:editar')
  @ApiOkResponse({ description: 'Edição em lote: status, categoria, preço e coleções.' })
  async bulkUpdate(
    @Body(new ZodValidationPipe(bulkUpdateSchema)) body: z.infer<typeof bulkUpdateSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const result = await this.products.bulkUpdate(body);

    await this.audit.record({
      actorId: user.id,
      entity: 'produto',
      entityId: 'lote',
      action: 'editar',
      after: { ...body, ids: undefined, total: body.ids.length },
      ip: clientIp(request),
    });

    return result;
  }

  @Delete('products/:id')
  @RequirePermissions('catalogo:excluir')
  @ApiOkResponse({ description: 'Arquiva o produto — o histórico é preservado.' })
  async removeProduct(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.products.remove(id);
    await this.audit.record({
      actorId: user.id,
      entity: 'produto',
      entityId: id,
      action: 'excluir',
      ip: clientIp(request),
    });
    return { ok: true };
  }

  // ──────────────────────────────── Estoque ────────────────────────────────

  @Get('stock/alerts')
  @RequirePermissions('estoque:ver')
  @ApiOkResponse({
    description: 'Produtos publicados em ruptura ou no limite de "últimas unidades".',
  })
  alertasDeEstoque(
    @Query(new ZodValidationPipe(paginacaoSchema)) query: z.infer<typeof paginacaoSchema>,
  ) {
    return this.stock.alertas(query.page, query.perPage);
  }

  @Get('stock/reasons')
  @RequirePermissions('estoque:ver')
  @ApiOkResponse({ description: 'Motivos sugeridos para o ajuste. Texto livre também vale.' })
  motivosDeEstoque() {
    return MOTIVOS_SUGERIDOS;
  }

  @Get('products/:id/stock')
  @RequirePermissions('estoque:ver')
  @ApiOkResponse({ description: 'Estoque atual e histórico de movimentações do produto.' })
  historicoDeEstoque(@Param('id') id: string) {
    return this.stock.historico(id);
  }

  @Post('products/:id/stock')
  @RequirePermissions('estoque:editar')
  @ApiOkResponse({
    description: 'Ajusta o estoque. O motivo é obrigatório e fica registrado na movimentação.',
  })
  async ajustarEstoque(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ajusteDeEstoqueSchema)) body: z.infer<typeof ajusteDeEstoqueSchema>,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const resultado = await this.stock.ajustar(id, body, { id: user.id, name: user.name });

    await this.audit.record({
      actorId: user.id,
      entity: 'estoque',
      entityId: id,
      action: 'editar',
      before: { qty: resultado.anterior },
      after: { qty: resultado.atual, motivo: body.motivo },
      ip: clientIp(request),
    });

    return resultado;
  }

  // ─────────────────── Grupos de cliente (base do atacado) ─────────────────

  @Get('customer-groups')
  @RequirePermissions('catalogo:ver')
  @ApiOkResponse({
    description:
      'Grupos de preço. Existem desde a v1 para as tabelas de atacado, mas nada de atacado aparece na vitrine enquanto WHOLESALE_ENABLED for falso.',
  })
  listGroups() {
    return this.prisma.customerGroup.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('customer-groups')
  @RequirePermissions('catalogo:criar')
  async createGroup(
    @Body(new ZodValidationPipe(customerGroupSchema)) body: z.infer<typeof customerGroupSchema>,
  ) {
    return this.prisma.customerGroup.create({
      data: {
        name: body.name,
        slug: body.slug ?? body.name.toLowerCase().replace(/\s+/g, '-'),
        discountPercent: body.discountPercent,
      },
    });
  }

  @Get('brands')
  @RequirePermissions('catalogo:ver')
  listBrands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' } });
  }
}
