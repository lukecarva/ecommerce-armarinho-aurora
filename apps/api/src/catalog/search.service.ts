import { MAX_SUGGESTIONS, isSearchable, normalizeSearchTerm } from '@aurora/types';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Ordenacao } from './products.service';
import { PublicProductsService } from './products.service';

/**
 * Busca da vitrine.
 *
 * Dois caminhos, na mesma consulta:
 *
 * 1. **Índice textual** (`search_vector` com a configuração `pt_unaccent`).
 *    Resolve acento e flexão: "algodao" acha "Algodão", "tecidos" acha
 *    "tecido". O radicalizador português é generoso o bastante para que
 *    "tricolini" e "tricoline" virem o mesmo radical `tricolin`.
 * 2. **Trigrama** (`word_similarity`), para o erro que o radicalizador não
 *    perdoa. Medido no banco da loja: "barbnte" contra "Barbante 6 Fios" dá
 *    0,545 e "tricolini" contra "Tricoline Estampado" dá 0,80, enquanto termo
 *    sem relação nenhuma não passa de 0,17. Por isso o limiar é 0,45 — folga
 *    larga dos dois lados.
 *
 * `word_similarity` compara o termo com o melhor trecho do nome, e não com o
 * nome inteiro: a `similarity` comum de "tricolini" contra "Tricoline
 * Estampado Floral" cai para 0,28, porque o resto do nome dilui o acerto, e o
 * produto certo ficaria de fora.
 */

/** Acima disto o trigrama considera acerto. Ver a medição no comentário acima. */
const LIMIAR_SEMELHANCA = 0.45;

/**
 * Peso do índice textual na nota final.
 *
 * `ts_rank_cd` devolve valores pequenos (0,1 a 0,3 é comum) e a semelhança vai
 * até 1. Sem o peso, um acerto exato de palavra perderia para um quase-acerto
 * de trigrama.
 */
const PESO_TEXTO = 4;

export interface BuscarProdutos {
  termo: string;
  ordenar?: Ordenacao;
  page: number;
  perPage: number;
}

interface LinhaDaBusca {
  id: string;
  nota: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly produtos: PublicProductsService,
  ) {}

  async buscar(entrada: BuscarProdutos) {
    const termo = entrada.termo.trim();

    if (!isSearchable(termo)) {
      return {
        termo,
        items: [],
        page: 1,
        perPage: entrada.perPage,
        total: 0,
        totalPages: 1,
        sugestoes: [] as string[],
      };
    }

    const ranking = await this.ranquear(termo);
    const total = ranking.length;

    // A ordenação escolhida na barra ("menor preço") tem prioridade sobre a
    // relevância — se a pessoa mudou o critério, foi de propósito.
    const ordem = entrada.ordenar ?? 'relevancia';
    const pagina =
      ordem === 'relevancia'
        ? ranking.slice((entrada.page - 1) * entrada.perPage, entrada.page * entrada.perPage)
        : ranking;

    const lista = await this.produtos.listar({
      ids: pagina.map((linha) => linha.id),
      // Com relevância a paginação já foi aplicada acima e a ordem vem do
      // ranking; nos demais critérios o banco ordena e pagina normalmente.
      preservarOrdemDosIds: ordem === 'relevancia',
      ordenar: ordem,
      page: ordem === 'relevancia' ? 1 : entrada.page,
      perPage: entrada.perPage,
    });

    await this.registrar(termo, total);

    return {
      termo,
      items: lista.items,
      page: entrada.page,
      perPage: entrada.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / entrada.perPage)),
      sugestoes: total === 0 ? await this.sugerirAlternativas(termo) : [],
    };
  }

  /**
   * Autocomplete: nomes de produto e categorias que casam com o que já foi
   * digitado.
   *
   * Não registra em `search_queries` — a cada tecla seria um INSERT, e o que
   * interessa medir é o que a pessoa realmente buscou, não o caminho até lá.
   */
  async sugerir(termo: string) {
    if (!isSearchable(termo)) return { produtos: [], categorias: [] };

    const limpo = termo.trim();

    const [produtos, categorias] = await Promise.all([
      this.prisma.$queryRaw<Array<{ name: string; slug: string }>>`
        SELECT p.name, p.slug
          FROM products p
         WHERE p.status = 'ativo'
           AND p.needs_content = false
           AND (
             p.search_vector @@ plainto_tsquery('pt_unaccent', ${limpo})
             OR word_similarity(${limpo}, p.name) >= ${LIMIAR_SEMELHANCA}
             OR unaccent(p.name) ILIKE '%' || unaccent(${limpo}) || '%'
           )
         ORDER BY word_similarity(${limpo}, p.name) DESC, p.name
         LIMIT ${MAX_SUGGESTIONS}
      `,
      this.prisma.category.findMany({
        where: { active: true, name: { contains: limpo, mode: 'insensitive' } },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        take: 4,
        select: { name: true, slug: true },
      }),
    ]);

    return { produtos, categorias };
  }

  /** Termos mais buscados sem resultado — o que falta no catálogo. */
  async semResultado(dias = 30, limite = 50) {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

    return this.prisma.$queryRaw<Array<{ termo: string; vezes: number }>>`
      SELECT MIN(term) AS termo, COUNT(*)::int AS vezes
        FROM search_queries
       WHERE results_count = 0
         AND "createdAt" >= ${desde}
       GROUP BY normalized
       ORDER BY COUNT(*) DESC, MIN(term)
       LIMIT ${limite}
    `;
  }

  // ─────────────────────────────── Internos ────────────────────────────────

  /**
   * Ids ordenados por relevância.
   *
   * Traz o conjunto inteiro, não uma página: o total precisa ser exato para a
   * paginação, e a lista de ids volta para o serviço de catálogo, que é quem
   * sabe montar o card. No tamanho deste catálogo é uma consulta indexada que
   * devolve algumas centenas de linhas de duas colunas.
   */
  private async ranquear(termo: string): Promise<LinhaDaBusca[]> {
    return this.prisma.$queryRaw<LinhaDaBusca[]>`
      SELECT p.id,
             (ts_rank_cd(p.search_vector, plainto_tsquery('pt_unaccent', ${termo})) * ${PESO_TEXTO}
               + word_similarity(${termo}, p.name))::float8 AS nota
        FROM products p
       WHERE p.status = 'ativo'
         AND p.needs_content = false
         AND (
           p.search_vector @@ plainto_tsquery('pt_unaccent', ${termo})
           OR word_similarity(${termo}, p.name) >= ${LIMIAR_SEMELHANCA}
           OR word_similarity(${termo}, coalesce(p.short_desc, '')) >= ${LIMIAR_SEMELHANCA}
         )
       ORDER BY nota DESC, p.name
    `;
  }

  /**
   * Quando a busca não acha nada, oferece o caminho mais próximo.
   *
   * Usa um limiar mais frouxo que o da busca: aqui não custa errar — é um
   * "você quis dizer", não um resultado.
   */
  private async sugerirAlternativas(termo: string): Promise<string[]> {
    const linhas = await this.prisma.$queryRaw<Array<{ name: string }>>`
      SELECT p.name
        FROM products p
       WHERE p.status = 'ativo'
         AND p.needs_content = false
         AND word_similarity(${termo}, p.name) >= 0.3
       ORDER BY word_similarity(${termo}, p.name) DESC
       LIMIT 5
    `;

    return linhas.map((linha) => linha.name);
  }

  /**
   * Guarda o termo buscado.
   *
   * Falha aqui nunca derruba a busca: o registro é para a loja saber o que
   * falta no catálogo, não faz parte da resposta que a cliente espera.
   */
  private async registrar(termo: string, resultados: number): Promise<void> {
    try {
      await this.prisma.searchQuery.create({
        data: { term: termo, normalized: normalizeSearchTerm(termo), resultsCount: resultados },
      });
    } catch (erro) {
      this.logger.warn(`Não foi possível registrar a busca "${termo}": ${String(erro)}`);
    }
  }
}
