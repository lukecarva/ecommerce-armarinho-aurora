import { AVAILABILITIES, MAX_SEARCH_LENGTH } from '@aurora/types';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../common/permissions.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PublicProductsService } from './products.service';
import { SearchService } from './search.service';

/**
 * Filtros de atributo chegam como `attr.largura=1,50m&attr.cor=Azul`.
 *
 * Para escolher mais de um valor do mesmo atributo, o parâmetro se repete:
 * `attr.largura=1,50m&attr.largura=2,80m`.
 *
 * **Não** separamos por vírgula. Medida em português tem vírgula decimal —
 * "1,50m" viraria "1" e "50m", e o filtro nunca acharia nada. O formato
 * mantém a URL legível e compartilhável: a cliente manda o link do filtro no
 * grupo do WhatsApp e a pessoa do outro lado abre a mesma lista.
 */
function lerAtributos(query: Record<string, unknown>): Record<string, string[]> {
  const atributos: Record<string, string[]> = {};

  for (const [chave, valor] of Object.entries(query)) {
    if (!chave.startsWith('attr.')) continue;

    const nome = chave.slice(5);
    const valores = Array.isArray(valor) ? valor.map(String) : [String(valor)];
    const limpos = valores.map((item) => item.trim()).filter(Boolean);

    if (limpos.length > 0) atributos[nome] = limpos;
  }

  return atributos;
}

const listaSchema = z.object({
  categoria: z.string().trim().optional(),
  colecao: z.string().trim().optional(),
  busca: z.string().trim().max(120).optional(),
  ordenar: z
    .enum(['relevancia', 'menor-preco', 'maior-preco', 'novidades', 'nome'])
    .default('relevancia'),
  disponibilidade: z
    .string()
    .optional()
    .transform((valor) =>
      valor
        ? valor
            .split(',')
            .map((item) => item.trim())
            .filter((item): item is (typeof AVAILABILITIES)[number] =>
              (AVAILABILITIES as readonly string[]).includes(item),
            )
        : undefined,
    ),
  /**
   * Lista de ids, usada pela página de favoritos.
   *
   * Aqui a vírgula é segura, ao contrário dos atributos: id é uuid e nunca
   * contém vírgula — o que quebrava "1,50m" não se aplica.
   */
  ids: z
    .string()
    .optional()
    .transform((valor) =>
      valor
        ? valor
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 200)
        : undefined,
    ),
  precoMin: z.coerce.number().int().min(0).optional(),
  precoMax: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(24),
});

const buscaSchema = z.object({
  q: z.string().trim().max(MAX_SEARCH_LENGTH).default(''),
  ordenar: z
    .enum(['relevancia', 'menor-preco', 'maior-preco', 'novidades', 'nome'])
    .default('relevancia'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(24),
});

const sugestaoSchema = z.object({
  q: z.string().trim().max(MAX_SEARCH_LENGTH).default(''),
});

@ApiTags('Catálogo')
@Public()
@Controller('catalog')
export class PublicCatalogController {
  constructor(
    private readonly produtos: PublicProductsService,
    private readonly busca: SearchService,
  ) {}

  @Get('home')
  @ApiOkResponse({
    description: 'Tudo que a home precisa: categorias, ofertas, coleções no ar e novidades.',
  })
  home() {
    return this.produtos.home();
  }

  @Get('products')
  @ApiOkResponse({
    description:
      'Listagem da vitrine. Só produtos publicados e completos — sem foto ou sem categoria, não aparece.',
  })
  async listar(
    @Query(new ZodValidationPipe(listaSchema)) query: z.infer<typeof listaSchema>,
    @Query() bruto: Record<string, unknown>,
  ) {
    const atributos = lerAtributos(bruto);
    return this.produtos.listar({ ...query, atributos });
  }

  @Get('facets')
  @ApiOkResponse({
    description:
      'Opções de filtro do resultado atual, calculadas a partir dos atributos que a loja cadastrou.',
  })
  async facetas(
    @Query(new ZodValidationPipe(listaSchema)) query: z.infer<typeof listaSchema>,
    @Query() bruto: Record<string, unknown>,
  ) {
    return this.produtos.facetas({ ...query, atributos: lerAtributos(bruto) });
  }

  @Get('search')
  @ApiOkResponse({
    description:
      'Busca com tolerância a acento e erro de digitação. Sem resultado, devolve sugestões próximas.',
  })
  async buscar(@Query(new ZodValidationPipe(buscaSchema)) query: z.infer<typeof buscaSchema>) {
    return this.busca.buscar({
      termo: query.q,
      ordenar: query.ordenar,
      page: query.page,
      perPage: query.perPage,
    });
  }

  @Get('search/suggest')
  @ApiOkResponse({ description: 'Autocomplete da barra de busca: produtos e categorias.' })
  async sugerir(
    @Query(new ZodValidationPipe(sugestaoSchema)) query: z.infer<typeof sugestaoSchema>,
  ) {
    return this.busca.sugerir(query.q);
  }

  @Get('products/:slug')
  @ApiOkResponse({ description: 'Página de produto: galeria, variações, ficha e relacionados.' })
  produto(@Param('slug') slug: string) {
    return this.produtos.produto(slug);
  }

  @Get('categories/:slug')
  @ApiOkResponse({ description: 'Categoria com trilha de navegação e subcategorias.' })
  categoria(@Param('slug') slug: string) {
    return this.produtos.categoria(slug);
  }
}
