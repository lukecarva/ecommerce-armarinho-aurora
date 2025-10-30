import {
  DEFAULT_SCHEDULE,
  formatScheduleLines,
  getStoreStatus,
  type Branding,
  type StoreInfo,
  type StoreSchedule,
  type StoreStatus,
} from '@aurora/types';

/**
 * Endereço da API.
 *
 * A renderização no servidor usa `API_INTERNAL_URL` — a chamada não precisa
 * sair para a internet, e assim não esbarra em proxy, TLS ou na senha que
 * protege o ambiente de homologação. Sem ela, cai na URL pública, que é a
 * mesma usada pelo navegador.
 */
const API_URL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface DeliveryMethodSummary {
  id: string;
  label: string;
  description: string | null;
  type: string;
  priceLabel: string;
  asksAddress: boolean;
}

export interface StorePayload {
  info: StoreInfo;
  branding: Partial<Branding>;
  schedule: StoreSchedule;
  scheduleLines: string[];
  status: StoreStatus;
  deliveryMethods: DeliveryMethodSummary[];
}

export type SaleUnitValue = 'metro' | 'unidade' | 'pacote' | 'kg' | 'conjunto';
export type AvailabilityValue = 'em_estoque' | 'ultimas_unidades' | 'sob_consulta' | 'esgotado';

export interface ProdutoDaVitrine {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAt: number | null;
  descontoPercent: number;
  unit: SaleUnitValue;
  packSize: number | null;
  availability: AvailabilityValue;
  imageUrl: string | null;
  blurhash: string | null;
  highlight: string | null;
}

export interface CategoriaResumo {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
}

export interface HomePayload {
  categorias: CategoriaResumo[];
  ofertas: ProdutoDaVitrine[];
  colecoes: Array<{
    id: string;
    name: string;
    slug: string;
    bannerUrl: string | null;
    type: string;
  }>;
  novidades: ProdutoDaVitrine[];
}

export interface ListaDeProdutos {
  items: ProdutoDaVitrine[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface FacetaValor {
  valor: string;
  total: number;
}

export interface Facetas {
  atributos: Record<string, FacetaValor[]>;
  disponibilidade: FacetaValor[];
  preco: { min: number; max: number };
}

export interface ImagemDaGaleria {
  url: string;
  blurhash: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
}

export interface VariacaoDoProduto {
  id: string;
  name: string;
  color: string | null;
  colorHex: string | null;
  size: string | null;
  price: number;
  availability: AvailabilityValue;
  imageUrl: string | null;
}

export interface ProdutoDetalhe extends ProdutoDaVitrine {
  sku: string | null;
  shortDesc: string | null;
  description: string | null;
  quantidade: { step: number; min: number; max?: number };
  attributes: Array<{ chave: string; valor: string }>;
  images: ImagemDaGaleria[];
  variants: VariacaoDoProduto[];
  categoria: { name: string; slug: string } | null;
  marca: { name: string; slug: string } | null;
  trilha: Array<{ name: string; slug: string }>;
  seo: { title?: string; description?: string } | null;
  relacionados: ProdutoDaVitrine[];
}

export interface ResultadoDaBusca extends ListaDeProdutos {
  termo: string;
  /** "Você quis dizer" — só vem quando a busca não achou nada. */
  sugestoes: string[];
}

export interface SugestoesDaBusca {
  produtos: Array<{ name: string; slug: string }>;
  categorias: Array<{ name: string; slug: string }>;
}

export interface CategoriaDetalhe {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  seo: { title?: string | null; description?: string | null } | null;
  children: CategoriaResumo[];
  trilha: Array<{ name: string; slug: string }>;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  position: number;
  children: CategoryNode[];
}

/**
 * Busca no backend com degradação controlada.
 *
 * A vitrine nunca deve mostrar erro por causa da API: header, rodapé e grade
 * de categorias são a primeira coisa que o cliente vê. Se o backend não
 * responder, caímos no conteúdo padrão e seguimos.
 */
async function fetchJson<T>(path: string, fallback: T, revalidate = 300): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

/** Usado enquanto a API não responde (e no primeiro `pnpm dev`, sem banco). */
export const FALLBACK_STORE: StorePayload = {
  info: {
    name: 'Armarinho Aurora',
    legalName: 'Armarinho Aurora Comércio de Tecidos Ltda',
    cnpj: '12345678000195',
    whatsapp: '5511999990000',
    phone: '1130000000',
    email: null,
    address: {
      street: 'Av. Exemplo',
      number: '1000',
      district: 'Centro',
      city: 'São Paulo',
      uf: 'SP',
      cep: '01000000',
    },
    instagram: 'https://www.instagram.com/armarinhoaurora/',
  },
  branding: {},
  schedule: DEFAULT_SCHEDULE,
  scheduleLines: formatScheduleLines(DEFAULT_SCHEDULE),
  status: getStoreStatus(DEFAULT_SCHEDULE),
  deliveryMethods: [
    {
      id: 'retirada',
      label: 'Retirar na loja',
      description: 'Av. Exemplo, 1000 — Centro, São Paulo/SP',
      type: 'retirada',
      priceLabel: 'Grátis',
      asksAddress: false,
    },
    {
      id: 'motoboy',
      label: 'Motoboy',
      description: 'Combinamos o valor da entrega pelo WhatsApp, conforme a sua região.',
      type: 'motoboy',
      priceLabel: 'Consultar valor',
      asksAddress: true,
    },
  ],
};

export async function getStore(): Promise<StorePayload> {
  const store = await fetchJson<StorePayload>('/store', FALLBACK_STORE, 60);

  // O status depende da hora atual, então é sempre recalculado no servidor —
  // uma resposta em cache não pode dizer "aberto" às 23h.
  return { ...store, status: getStoreStatus(store.schedule ?? DEFAULT_SCHEDULE) };
}

export async function getCategories(): Promise<CategoryNode[]> {
  return fetchJson<CategoryNode[]>('/categories', []);
}

// ─────────────────────────────── Catálogo ──────────────────────────────────

const HOME_VAZIA: HomePayload = { categorias: [], ofertas: [], colecoes: [], novidades: [] };

export async function getHome(): Promise<HomePayload> {
  return fetchJson<HomePayload>('/catalog/home', HOME_VAZIA, 300);
}

/**
 * Monta a query da API.
 *
 * Vários valores repetem o parâmetro (`attr.largura=1,50m&attr.largura=2,80m`)
 * em vez de juntar por vírgula: medida em português já tem vírgula, e "1,50m"
 * seria partido em dois valores inexistentes.
 */
export function montarQuery(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();

  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined) continue;

    if (Array.isArray(valor)) {
      for (const item of valor) if (item !== '') query.append(chave, item);
    } else if (valor !== '') {
      query.set(chave, valor);
    }
  }

  const texto = query.toString();
  return texto ? `?${texto}` : '';
}

export async function getProdutos(
  params: Record<string, string | string[] | undefined>,
): Promise<ListaDeProdutos> {
  return fetchJson<ListaDeProdutos>(
    `/catalog/products${montarQuery(params)}`,
    { items: [], page: 1, perPage: 24, total: 0, totalPages: 1 },
    60,
  );
}

export async function getFacetas(
  params: Record<string, string | string[] | undefined>,
): Promise<Facetas> {
  return fetchJson<Facetas>(
    `/catalog/facets${montarQuery(params)}`,
    { atributos: {}, disponibilidade: [], preco: { min: 0, max: 0 } },
    60,
  );
}

/** `null` quando a categoria não existe — a página responde 404. */
export async function getCategoria(slug: string): Promise<CategoriaDetalhe | null> {
  return fetchJson<CategoriaDetalhe | null>(`/catalog/categories/${slug}`, null, 300);
}

/** `null` quando o produto não existe ou saiu do ar — a página responde 404. */
export async function getProduto(slug: string): Promise<ProdutoDetalhe | null> {
  return fetchJson<ProdutoDetalhe | null>(`/catalog/products/${slug}`, null, 300);
}

/**
 * Resultado da busca.
 *
 * Revalidação curta: quem busca espera ver o que a loja acabou de cadastrar, e
 * o termo varia muito mais que uma categoria — cache longo aqui renderia
 * pouco e envelheceria rápido.
 */
export async function getBusca(
  params: Record<string, string | string[] | undefined>,
): Promise<ResultadoDaBusca> {
  return fetchJson<ResultadoDaBusca>(
    `/catalog/search${montarQuery(params)}`,
    { termo: '', items: [], page: 1, perPage: 24, total: 0, totalPages: 1, sugestoes: [] },
    30,
  );
}
