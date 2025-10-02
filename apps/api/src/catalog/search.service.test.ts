import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import type { ListarProdutos, PublicProductsService } from './products.service';
import { SearchService } from './search.service';

/**
 * O ranking em si é do Postgres — quem escolhe entre índice textual e trigrama
 * é o SQL, e isso se verifica no banco, não aqui. O que estes testes cobrem é
 * a costura em volta: paginação sobre o ranking, ordem preservada, registro do
 * termo e o que acontece quando não há resultado.
 */

interface Cenario {
  /** Ids que o ranking devolveria, já em ordem de relevância. */
  ranking?: string[];
  /** Nomes devolvidos pela consulta de sugestão de alternativas. */
  alternativas?: string[];
  /** Faz o registro do termo falhar, como um banco indisponível faria. */
  registroFalha?: boolean;
}

function montar(cenario: Cenario = {}) {
  const ranking = cenario.ranking ?? [];
  const chamadas: ListarProdutos[] = [];
  const registros: Array<{ term: string; normalized: string; resultsCount: number }> = [];

  const prisma = {
    // A primeira consulta bruta é o ranking; a segunda, as alternativas.
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce(ranking.map((id, i) => ({ id, nota: ranking.length - i })))
      .mockResolvedValue((cenario.alternativas ?? []).map((name) => ({ name }))),
    searchQuery: {
      create: ({ data }: { data: (typeof registros)[number] }) => {
        if (cenario.registroFalha) return Promise.reject(new Error('banco fora do ar'));
        registros.push(data);
        return Promise.resolve(data);
      },
    },
  } as unknown as PrismaService;

  const produtos = {
    listar: (entrada: ListarProdutos) => {
      chamadas.push(entrada);
      return Promise.resolve({
        items: (entrada.ids ?? []).map((id) => ({ id, name: id })),
        page: entrada.page,
        perPage: entrada.perPage,
        total: (entrada.ids ?? []).length,
        totalPages: 1,
      });
    },
  } as unknown as PublicProductsService;

  return { servico: new SearchService(prisma, produtos), chamadas, registros };
}

describe('busca', () => {
  it('devolve os produtos do ranking na ordem da relevância', async () => {
    const { servico, chamadas } = montar({ ranking: ['b', 'a', 'c'] });

    const resposta = await servico.buscar({ termo: 'tricoline', page: 1, perPage: 24 });

    expect(resposta.items.map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(chamadas[0]?.preservarOrdemDosIds).toBe(true);
  });

  it('pagina sobre o ranking, e não sobre o banco', async () => {
    const { servico, chamadas } = montar({ ranking: ['a', 'b', 'c', 'd', 'e'] });

    const resposta = await servico.buscar({ termo: 'fio', page: 2, perPage: 2 });

    // A segunda página do ranking são o terceiro e o quarto colocados.
    expect(chamadas[0]?.ids).toEqual(['c', 'd']);
    // E o serviço de catálogo não pode paginar de novo em cima disso.
    expect(chamadas[0]?.page).toBe(1);
    expect(resposta.total).toBe(5);
    expect(resposta.totalPages).toBe(3);
    expect(resposta.page).toBe(2);
  });

  it('ao trocar a ordenação, entrega o conjunto inteiro para o banco ordenar', async () => {
    const { servico, chamadas } = montar({ ranking: ['a', 'b', 'c'] });

    await servico.buscar({ termo: 'fio', ordenar: 'menor-preco', page: 2, perPage: 2 });

    // Quem escolheu "menor preço" quer o mais barato de todos, não o mais
    // barato entre os mais relevantes.
    expect(chamadas[0]?.ids).toEqual(['a', 'b', 'c']);
    expect(chamadas[0]?.preservarOrdemDosIds).toBe(false);
    expect(chamadas[0]?.page).toBe(2);
  });

  it('registra o termo buscado e quantos resultados teve', async () => {
    const { servico, registros } = montar({ ranking: ['a'] });

    await servico.buscar({ termo: '  Tricoline Algodão ', page: 1, perPage: 24 });

    expect(registros).toEqual([
      { term: 'Tricoline Algodão', normalized: 'tricoline algodao', resultsCount: 1 },
    ]);
  });

  it('sem resultado, registra o zero e oferece o caminho mais próximo', async () => {
    const { servico, registros } = montar({ ranking: [], alternativas: ['Tricoline Estampado'] });

    const resposta = await servico.buscar({ termo: 'tricolone', page: 1, perPage: 24 });

    expect(resposta.total).toBe(0);
    expect(resposta.sugestoes).toEqual(['Tricoline Estampado']);
    // É este registro que diz à loja o que falta no catálogo.
    expect(registros[0]?.resultsCount).toBe(0);
  });

  it('com resultado, não gasta consulta procurando alternativa', async () => {
    const { servico } = montar({ ranking: ['a'], alternativas: ['Nunca'] });

    const resposta = await servico.buscar({ termo: 'fio', page: 1, perPage: 24 });

    expect(resposta.sugestoes).toEqual([]);
  });

  it('falha ao registrar não derruba a busca', async () => {
    const { servico } = montar({ ranking: ['a'], registroFalha: true });

    const resposta = await servico.buscar({ termo: 'fio', page: 1, perPage: 24 });

    expect(resposta.items.map((item) => item.id)).toEqual(['a']);
  });

  it('termo curto demais nem chega ao banco', async () => {
    const { servico, chamadas, registros } = montar({ ranking: ['a'] });

    const resposta = await servico.buscar({ termo: 'a', page: 1, perPage: 24 });

    expect(resposta.total).toBe(0);
    expect(chamadas).toEqual([]);
    expect(registros).toEqual([]);
  });

  it('autocomplete ignora termo curto', async () => {
    const { servico } = montar();

    expect(await servico.sugerir(' ')).toEqual({ produtos: [], categorias: [] });
  });
});
