import type {
  Branding,
  Cents,
  CourseLevel,
  EnrollmentStatus,
  OrderStatus,
  PaymentMethod,
  SaleUnit,
  SeatStatus,
  StoreInfo,
  TaskPriority,
  TaskStatus,
} from '@aurora/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api';

/**
 * Cliente HTTP do painel.
 *
 * O access token vive **em memória**, nunca em localStorage: um XSS que
 * consiga ler o storage teria a sessão inteira. O refresh fica num cookie
 * httpOnly que o JavaScript não enxerga, e a renovação é automática — quando
 * uma chamada volta 401, tentamos o refresh uma vez e repetimos a requisição.
 */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Mensagem do campo, para exibir junto do input. */
  fieldMessage(field: string): string | undefined {
    return this.errors.find((error) => error.field === field)?.message;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** FormData para upload — o navegador define o Content-Type sozinho. */
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Interno: evita laço infinito de refresh. */
  retry?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body:
      options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });

  if (response.status === 401 && !options.retry && path !== '/auth/refresh') {
    const renewed = await refreshSession();
    if (renewed) return request<T>(path, { ...options, retry: true });
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      errors?: FieldError[];
    } | null;

    throw new ApiError(
      payload?.message ?? 'Não foi possível concluir a operação.',
      response.status,
      payload?.errors ?? [],
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Renova a sessão. Chamadas simultâneas compartilham a mesma tentativa. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        accessToken = null;
        return false;
      }

      const data = (await response.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

// ─────────────────────────────── Contratos ─────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  position: number;
  active: boolean;
  parentId: string | null;
  productCount: number;
  children: CategoryNode[];
}

export interface CollectionSummary {
  id: string;
  name: string;
  slug: string;
  type: 'sazonal' | 'oferta' | 'curadoria';
  bannerUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  position: number;
  productCount: number;
  live: boolean;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  skuFutura: string | null;
  status: 'rascunho' | 'ativo' | 'inativo' | 'arquivado';
  needsContent: boolean;
  unit: 'metro' | 'unidade' | 'pacote' | 'kg' | 'conjunto';
  price: number;
  promoPrice: number | null;
  effectivePrice: number;
  compareAt: number | null;
  category: { id: string; name: string; slug: string } | null;
  imageUrl: string | null;
  availability: 'em_estoque' | 'ultimas_unidades' | 'sob_consulta' | 'esgotado';
  stockQty: number;
  variantCount: number;
  imageCount: number;
  updatedAt: string;
}

export interface ProductVariantDto {
  id?: string;
  name: string;
  skuFutura: string | null;
  color: string | null;
  colorHex: string | null;
  size: string | null;
  priceDelta: number;
}

export interface ProductImageDto {
  mediaId: string;
  variantId?: string | null;
  alt: string | null;
  url: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
}

export interface PriceTierDto {
  groupId: string | null;
  minQty: number;
  price: number;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  skuFutura: string | null;
  shortDesc: string | null;
  description: string | null;
  categoryId: string | null;
  brandId: string | null;
  unit: ProductListItem['unit'];
  saleStep: number;
  minQty: number;
  packSize: number | null;
  price: number;
  promoPrice: number | null;
  promoStartsAt: string | null;
  promoEndsAt: string | null;
  attributes: Record<string, string>;
  status: ProductListItem['status'];
  needsContent: boolean;
  seo: { title?: string | null; description?: string | null } | null;
  images: ProductImageDto[];
  variants: ProductVariantDto[];
  priceTiers: PriceTierDto[];
  collectionIds: string[];
  stock: {
    qty: number;
    lowStockThreshold: number;
    availability: ProductListItem['availability'];
  };
}

export interface MediaAsset {
  id: string;
  url: string;
  key: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  alt: string | null;
  folder: string;
  createdAt: string;
}

export interface CustomerGroup {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
}

export interface BusinessHourDto {
  weekday: number;
  opensAt: string;
  closesAt: string;
  closed: boolean;
}

export interface SettingsPayload {
  info: StoreInfo | null;
  branding: Branding;
  hours: BusinessHourDto[];
  holidays: Array<{ date: string; label: string }>;
  deliveryMethods: Array<{
    id: string;
    label: string;
    description: string | null;
    type: string;
    priceLabel: string;
    asksAddress: boolean;
    active: boolean;
    position: number;
  }>;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastLoginAt: string | null;
  role: { id: string; name: string };
  createdAt: string;
}

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  _count: { users: number };
}

export interface AuditRow {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  diff: Record<string, { de: unknown; para: unknown }> | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

// ─────────────────────── Importação e exportação ───────────────────────────

export type ImportKind = 'produtos' | 'precos' | 'estoque';
export type ImportStatus = 'simulado' | 'processando' | 'concluido' | 'falhou' | 'desfeito';
export type RowAction = 'criar' | 'atualizar' | 'sem_mudanca' | 'ignorar' | 'erro';

export interface Deteccao {
  formato: 'csv' | 'xlsx';
  encoding?: string;
  delimitador?: string;
}

export interface InspecaoResultado {
  headers: string[];
  deteccao: Deteccao;
  totalLinhas: number;
  columnMap: Record<string, string>;
  amostra: Array<Record<string, string>>;
}

export interface RowDiff {
  linha: number;
  skuFutura: string | null;
  nome: string | null;
  acao: RowAction;
  mudancas: Record<string, { de: unknown; para: unknown }>;
  erros: string[];
  avisos: string[];
}

export interface ImportResumo {
  total: number;
  criar: number;
  atualizar: number;
  semMudanca: number;
  ignorar: number;
  erro: number;
  duplicados: string[];
}

export interface SimulacaoResultado {
  runId: string;
  headers: string[];
  columnMap: Record<string, string>;
  deteccao: Deteccao;
  resumo: ImportResumo;
  previa: RowDiff[];
  categoriasDesconhecidas: string[];
}

export interface ImportRun {
  id: string;
  filename: string;
  kind: ImportKind;
  status: ImportStatus;
  dryRun: boolean;
  rowsTotal: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsError: number;
  startedAt: string;
  finishedAt: string | null;
  actorName: string | null;
  error: string | null;
}

export interface ImportProfile {
  id: string;
  name: string;
  kind: ImportKind;
  columnMap: Record<string, string>;
  options: Record<string, unknown>;
}

export type ExportFormat = 'csv' | 'xlsx' | 'zip';

export interface ExportRun {
  id: string;
  format: ExportFormat;
  status: 'processando' | 'concluido' | 'falhou' | 'expirado';
  rowsTotal: number;
  fileSize: number | null;
  expiresAt: string | null;
  createdAt: string;
  actorName: string | null;
  error: string | null;
}

export interface ZipResultado {
  planilha: { nome: string; bytes: number } | null;
  imagens: {
    enviadas: number;
    vinculadas: number;
    semProduto: string[];
    erros: Array<{ arquivo: string; motivo: string }>;
  };
  ignorados: string[];
}

export interface MovimentacaoEstoque {
  id: string;
  delta: number;
  reason: string;
  autor: string | null;
  createdAt: string;
}

export interface EstoqueDetalhe {
  qty: number;
  lowStockThreshold: number;
  availability: ProductListItem['availability'];
  source?: string;
  updatedAt?: string;
  movimentacoes: MovimentacaoEstoque[];
}

export interface AlertaDeEstoque {
  id: string;
  name: string;
  skuFutura: string | null;
  unit: ProductListItem['unit'];
  categoria: string | null;
  imageUrl: string | null;
  qty: number;
  lowStockThreshold: number;
  availability: ProductListItem['availability'];
}

export interface HealthPayload {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  uptime: number;
  timestamp: string;
}

// ─────────────────────────────── Endpoints ─────────────────────────────────

// ──────────────────────────────── Pedidos ──────────────────────────────────

export interface OrderCard {
  code: string;
  status: OrderStatus;
  createdAt: string;
  name: string;
  phone: string;
  deliveryLabel: string;
  itemCount: number;
  subtotal: Cents;
  discount: Cents;
  total: Cents;
  finalValue: Cents | null;
  whatsappClickedAt: string | null;
  /** Novo e parado há mais de 24 h — o card fica marcado no quadro. */
  atrasado: boolean;
}

export interface OrderItemDto {
  name: string;
  variantName?: string | null;
  unit: SaleUnit;
  packSize?: number | null;
  imageUrl?: string | null;
  qty: number;
  unitPrice: Cents;
  lineTotal: Cents;
}

export interface OrderEventDto {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  actor: string | null;
  createdAt: string;
}

export interface OrderDetail extends OrderCard {
  email: string | null;
  deliveryNote: string | null;
  couponCode: string | null;
  notesCustomer: string | null;
  notesInternal: string | null;
  lostReason: string | null;
  closedAt: string | null;
  publicToken: string;
  items: OrderItemDto[];
  timeline: OrderEventDto[];
}

export interface KanbanBoard {
  colunas: Array<{
    key: string;
    label: string;
    statuses: OrderStatus[];
    items: OrderCard[];
  }>;
  atualizadoEm: string;
}

export interface OrdersReport {
  periodo: { de: string; ate: string };
  total: number;
  porStatus: Array<{ status: OrderStatus; quantidade: number; estimado: Cents }>;
  vendido: Cents;
  pedidosFechados: number;
  cliquesWhatsApp: number;
}

// ──────────────────────────────── Clientes ─────────────────────────────────

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  grupo: string | null;
  pedidos: number;
  ultimoPedido: string | null;
  emailVerified: boolean;
  anonymized: boolean;
  createdAt: string;
}

export interface CustomerDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  grupo: { id: string; name: string } | null;
  emailVerified: boolean;
  acceptsMarketing: boolean;
  consent: Record<string, unknown>;
  lastLoginAt: string | null;
  anonymizedAt: string | null;
  createdAt: string;
  addresses: Array<{
    id: string;
    label: string | null;
    cep: string;
    street: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    uf: string;
    reference: string | null;
    isDefault: boolean;
  }>;
  favoritos: number;
  totalPedidos: number;
  sessoesAtivas: number;
  pedidos: Array<{
    code: string;
    status: OrderStatus;
    createdAt: string;
    total: Cents;
    finalValue: Cents | null;
  }>;
}

// ──────────────────────────────── Cupons ───────────────────────────────────

export interface CouponRow {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  /** Percentual (1–100) ou centavos. */
  value: number;
  minSubtotal: Cents | null;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  listed: boolean;
  description: string | null;
  createdAt: string;
  usos?: number;
  descontoConcedido?: Cents;
}

export interface CouponDetail extends CouponRow {
  relatorio: {
    usos: number;
    descontoConcedido: Cents;
    vendido: Cents;
    pedidosFechados: number;
    pedidos: Array<{
      code: string;
      createdAt: string;
      cliente: string;
      status: OrderStatus;
      desconto: Cents;
      total: Cents;
      finalValue: Cents | null;
    }>;
  };
}

export interface CursoResumoAdmin {
  id: string;
  title: string;
  slug: string;
  price: Cents;
  active: boolean;
  proximasTurmas: number;
  proximaTurma: string | null;
  totalInscricoes: number;
}

export interface TurmaAdmin {
  id: string;
  startsAt: string;
  endsAt: string;
  dataTexto: string;
  room: string | null;
  instructor: string | null;
  instructorPhone: string | null;
  instructorFeeType: string | null;
  instructorFee: number | null;
  instructorPaidAmount: number | null;
  instructorPaidAt: string | null;
  seatsTotal: number;
  notes: string | null;
  cancelledAt: string | null;
  situacao: SeatStatus;
  inscricoes: Record<'confirmada' | 'pendente' | 'lista_de_espera' | 'cancelada', number>;
}

export interface TurmaDetalheAdmin {
  id: string;
  startsAt: string;
  endsAt: string;
  dataTexto: string;
  room: string | null;
  notes: string | null;
  curso: { id: string; title: string; price: number | string };
  seatsTotal: number;
  cancelada: boolean;
  instructor: string | null;
  instructorPhone: string | null;
  instructorFeeType: string | null;
  instructorFee: number | null;
  instructorPaidAmount: number | null;
  instructorPaidAt: string | null;
  cacheCalculado: number | null;
}

export interface CursoDetalheAdmin {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  coverUrl: string | null;
  price: Cents;
  durationMinutes: number | null;
  level: CourseLevel;
  materials: string | null;
  active: boolean;
  sessions: TurmaAdmin[];
}

export interface InscricaoAdmin {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: EnrollmentStatus;
  statusLabel: string;
  notes: string | null;
  createdAt: string;
  paidAt: string | null;
  paidAmount: number | null;
  totalAmount: number | null;
  paymentMethod: PaymentMethod | null;
}

export interface AgendaEventoAdmin {
  id: string;
  courseId: string;
  courseTitle: string;
  startsAt: string;
  endsAt: string;
  dataTexto: string;
  room: string | null;
  instructor: string | null;
  seatsTotal: number;
  confirmadas: number;
  situacao: SeatStatus;
}

export interface MembroAdmin {
  id: string;
  name: string;
}

export interface TarefaCard {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  atrasada: boolean;
  createdAt: string;
}

export interface TarefaKanban {
  colunas: Array<{
    key: TaskStatus;
    label: string;
    items: TarefaCard[];
  }>;
  atualizadoEm: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<AuthUser>('/auth/me'),
  health: () => request<HealthPayload>('/health'),

  categories: {
    list: () => request<CategoryNode[]>('/admin/categories'),
    create: (body: unknown) => request<CategoryNode>('/admin/categories', { method: 'POST', body }),
    update: (id: string, body: unknown) =>
      request<CategoryNode>(`/admin/categories/${id}`, { method: 'PUT', body }),
    remove: (id: string) => request<{ ok: true }>(`/admin/categories/${id}`, { method: 'DELETE' }),
    reorder: (items: Array<{ id: string; parentId: string | null; position: number }>) =>
      request<CategoryNode[]>('/admin/categories/reorder', { method: 'PATCH', body: { items } }),
  },

  collections: {
    list: () => request<CollectionSummary[]>('/admin/collections'),
    get: (id: string) =>
      request<CollectionSummary & { productIds: string[] }>(`/admin/collections/${id}`),
    create: (body: unknown) =>
      request<CollectionSummary>('/admin/collections', { method: 'POST', body }),
    update: (id: string, body: unknown) =>
      request<CollectionSummary>(`/admin/collections/${id}`, { method: 'PUT', body }),
    remove: (id: string) => request<{ ok: true }>(`/admin/collections/${id}`, { method: 'DELETE' }),
  },

  products: {
    list: (query: Record<string, string | number | boolean | undefined>) =>
      request<Paginated<ProductListItem>>('/admin/products', { query }),
    get: (id: string) => request<ProductDetail>(`/admin/products/${id}`),
    create: (body: unknown) => request<ProductDetail>('/admin/products', { method: 'POST', body }),
    update: (id: string, body: unknown) =>
      request<ProductDetail>(`/admin/products/${id}`, { method: 'PUT', body }),
    remove: (id: string) => request<{ ok: true }>(`/admin/products/${id}`, { method: 'DELETE' }),
    bulk: (body: unknown) =>
      request<{ updated: number }>('/admin/products/bulk', { method: 'PATCH', body }),
  },

  media: {
    list: (query: Record<string, string | number | undefined>) =>
      request<Paginated<MediaAsset>>('/admin/media', { query }),
    upload: (file: File, folder = 'produtos') => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);
      return request<MediaAsset>('/admin/media', { method: 'POST', formData });
    },
    updateAlt: (id: string, alt: string | null) =>
      request<MediaAsset>(`/admin/media/${id}`, { method: 'PATCH', body: { alt } }),
    remove: (id: string) => request<{ ok: true }>(`/admin/media/${id}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => request<SettingsPayload>('/admin/settings'),
    updateStore: (body: unknown) =>
      request<StoreInfo>('/admin/settings/store', { method: 'PUT', body }),
    updateHours: (hours: BusinessHourDto[]) =>
      request<BusinessHourDto[]>('/admin/settings/hours', { method: 'PUT', body: { hours } }),
    getBranding: () => request<Branding>('/admin/settings/branding'),
    updateBranding: (body: Partial<Branding>) =>
      request<Branding>('/admin/settings/branding', { method: 'PUT', body }),
    uploadBrand: (slot: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<Branding>(`/admin/settings/branding/${slot}`, { method: 'POST', formData });
    },
  },

  users: {
    list: () => request<AdminUserRow[]>('/admin/users'),
    create: (body: unknown) => request<AdminUserRow>('/admin/users', { method: 'POST', body }),
    update: (id: string, body: unknown) =>
      request<AdminUserRow>(`/admin/users/${id}`, { method: 'PUT', body }),
    deactivate: (id: string) => request<{ ok: true }>(`/admin/users/${id}`, { method: 'DELETE' }),
    roles: () => request<RoleRow[]>('/admin/roles'),
    updateRole: (id: string, body: unknown) =>
      request<RoleRow>(`/admin/roles/${id}`, { method: 'PUT', body }),
    audit: (query: Record<string, string | number | undefined>) =>
      request<Paginated<AuditRow>>('/admin/audit', { query }),
  },

  importar: {
    campos: () =>
      request<{
        campos: Array<{ valor: string; rotulo: string }>;
        porTipo: Record<string, string[]>;
      }>('/admin/import/fields'),
    inspecionar: (file: File, kind: ImportKind) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<InspecaoResultado>(`/admin/import/inspect?kind=${kind}`, {
        method: 'POST',
        formData,
      });
    },
    simular: (
      file: File,
      kind: ImportKind,
      columnMap: Record<string, string>,
      opcoes: { atualizarNome: boolean; criarAusentes: boolean; markupPercent: number },
    ) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);
      formData.append('columnMap', JSON.stringify(columnMap));
      formData.append('atualizarNome', String(opcoes.atualizarNome));
      formData.append('criarAusentes', String(opcoes.criarAusentes));
      formData.append('markupPercent', String(opcoes.markupPercent));
      return request<SimulacaoResultado>('/admin/import/simulate', { method: 'POST', formData });
    },
    aplicar: (id: string) => request<ImportRun>(`/admin/import/${id}/apply`, { method: 'POST' }),
    desfazer: (id: string) => request<ImportRun>(`/admin/import/${id}/undo`, { method: 'POST' }),
    zip: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return request<ZipResultado>('/admin/import/zip', { method: 'POST', formData });
    },
    historico: (query: Record<string, string | number | undefined>) =>
      request<Paginated<ImportRun>>('/admin/import/runs', { query }),
    perfis: () => request<ImportProfile[]>('/admin/import/profiles'),
    salvarPerfil: (body: unknown) =>
      request<ImportProfile>('/admin/import/profiles', { method: 'POST', body }),
    removerPerfil: (id: string) =>
      request<{ ok: true }>(`/admin/import/profiles/${id}`, { method: 'DELETE' }),
  },

  exportar: {
    solicitar: (body: unknown) => request<ExportRun>('/admin/export', { method: 'POST', body }),
    listar: (query: Record<string, string | number | undefined>) =>
      request<Paginated<ExportRun>>('/admin/export', { query }),
    detalhe: (id: string) => request<ExportRun>(`/admin/export/${id}`),
    /**
     * Baixa o arquivo pela API, com o token no cabeçalho.
     *
     * Um `<a href>` simples não levaria a autenticação, e o endpoint é
     * protegido de propósito: o catálogo tem preço e estoque da loja.
     */
    baixar: async (id: string, nome: string) => {
      const resposta = await fetch(`${API_URL}/admin/export/${id}/download`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: 'include',
      });

      if (!resposta.ok) {
        throw new ApiError('Não foi possível baixar o arquivo.', resposta.status);
      }

      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      link.click();
      URL.revokeObjectURL(url);
    },
  },

  estoque: {
    detalhe: (productId: string) => request<EstoqueDetalhe>(`/admin/products/${productId}/stock`),
    ajustar: (productId: string, body: unknown) =>
      request<{
        produto: string;
        anterior: number;
        atual: number;
        delta: number;
        availability: string;
      }>(`/admin/products/${productId}/stock`, { method: 'POST', body }),
    motivos: () => request<string[]>('/admin/stock/reasons'),
    alertas: (query: Record<string, string | number | undefined>) =>
      request<Paginated<AlertaDeEstoque>>('/admin/stock/alerts', { query }),
  },

  pedidos: {
    lista: (query: Record<string, string | number | undefined>) =>
      request<Paginated<OrderCard>>('/admin/orders', { query }),
    kanban: () => request<KanbanBoard>('/admin/orders/kanban'),
    recuperacao: () => request<{ horas: number; items: OrderCard[] }>('/admin/orders/recuperacao'),
    relatorio: (query: Record<string, string | undefined> = {}) =>
      request<OrdersReport>('/admin/orders/relatorio', { query }),
    detalhe: (code: string) => request<OrderDetail>(`/admin/orders/${code}`),
    mudarStatus: (code: string, body: unknown) =>
      request<OrderCard>(`/admin/orders/${code}/status`, { method: 'PATCH', body }),
    anotar: (code: string, texto: string) =>
      request<OrderDetail>(`/admin/orders/${code}/notes`, { method: 'POST', body: { texto } }),
  },

  clientes: {
    lista: (query: Record<string, string | number | undefined>) =>
      request<Paginated<CustomerRow>>('/admin/customers', { query }),
    detalhe: (id: string) => request<CustomerDetail>(`/admin/customers/${id}`),
    mudarGrupo: (id: string, groupId: string | null) =>
      request<CustomerDetail>(`/admin/customers/${id}/group`, {
        method: 'PATCH',
        body: { groupId },
      }),
    /** Tudo o que a loja guarda da pessoa. Fica registrado na auditoria. */
    exportar: (id: string) => request<unknown>(`/admin/customers/${id}/export`),
    anonimizar: (id: string) =>
      request<{ ok: true; pedidosAnonimizados: number }>(`/admin/customers/${id}/anonymize`, {
        method: 'POST',
        body: { confirmacao: 'ANONIMIZAR' },
      }),
  },

  cupons: {
    lista: () => request<CouponRow[]>('/admin/coupons'),
    obter: (id: string) => request<CouponDetail>(`/admin/coupons/${id}`),
    criar: (body: unknown) => request<CouponDetail>('/admin/coupons', { method: 'POST', body }),
    atualizar: (id: string, body: unknown) =>
      request<CouponDetail>(`/admin/coupons/${id}`, { method: 'PUT', body }),
  },

  customerGroups: () => request<CustomerGroup[]>('/admin/customer-groups'),

  cursos: {
    lista: () => request<CursoResumoAdmin[]>('/admin/courses'),
    obter: (id: string) => request<CursoDetalheAdmin>(`/admin/courses/${id}`),
    criar: (body: unknown) =>
      request<CursoDetalheAdmin>('/admin/courses', { method: 'POST', body }),
    atualizar: (id: string, body: unknown) =>
      request<CursoDetalheAdmin>(`/admin/courses/${id}`, { method: 'PUT', body }),
    remover: (id: string) => request<{ ok: true }>(`/admin/courses/${id}`, { method: 'DELETE' }),
    criarTurma: (cursoId: string, body: unknown) =>
      request<CursoDetalheAdmin>(`/admin/courses/${cursoId}/sessions`, { method: 'POST', body }),
    atualizarTurma: (id: string, body: unknown) =>
      request<CursoDetalheAdmin>(`/admin/courses/sessions/${id}`, { method: 'PUT', body }),
    cancelarTurma: (id: string) =>
      request<CursoDetalheAdmin>(`/admin/courses/sessions/${id}/cancel`, { method: 'POST' }),
    inscricoes: (sessionId: string) =>
      request<{ turma: TurmaDetalheAdmin; inscricoes: InscricaoAdmin[] }>(
        `/admin/courses/sessions/${sessionId}/enrollments`,
      ),
    criarInscricao: (sessionId: string, body: unknown) =>
      request<{ turma: TurmaDetalheAdmin; inscricoes: InscricaoAdmin[] }>(
        `/admin/courses/sessions/${sessionId}/enrollments`,
        { method: 'POST', body },
      ),
    atualizarInscricao: (id: string, body: unknown) =>
      request<{ turma: TurmaDetalheAdmin; inscricoes: InscricaoAdmin[] }>(
        `/admin/courses/enrollments/${id}`,
        { method: 'PUT', body },
      ),
    mudarStatusInscricao: (id: string, body: unknown) =>
      request<unknown>(`/admin/courses/enrollments/${id}`, { method: 'PATCH', body }),
    registrarPagamento: (id: string, body: unknown) =>
      request<unknown>(`/admin/courses/enrollments/${id}/payment`, { method: 'PATCH', body }),
    registrarPagamentoProfessor: (sessionId: string, body: unknown) =>
      request<unknown>(`/admin/courses/sessions/${sessionId}/instructor-payment`, {
        method: 'PATCH',
        body,
      }),
    agenda: () => request<AgendaEventoAdmin[]>('/admin/courses/agenda'),
  },

  relatorios: {
    dados: (relatorio: string, periodo: string) =>
      request<unknown>(`/admin/reports/${relatorio}`, { query: { periodo } }),
    baixarCsv: async (relatorio: string, periodo: string) => {
      const url = new URL(`${API_URL}/admin/reports/${relatorio}`, window.location.href);
      url.searchParams.set('periodo', periodo);
      url.searchParams.set('formato', 'csv');

      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch(url, { headers, credentials: 'include' });
      if (!res.ok) throw new Error('Não consegui gerar o arquivo.');

      const blob = await res.blob();
      const nome =
        res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        `relatorio-${relatorio}.csv`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = nome;
      link.click();
      URL.revokeObjectURL(link.href);
    },
  },

  tarefas: {
    kanban: () => request<TarefaKanban>('/admin/tasks/kanban'),
    membros: () => request<MembroAdmin[]>('/admin/tasks/membros'),
    criar: (body: unknown) => request<TarefaKanban>('/admin/tasks', { method: 'POST', body }),
    mover: (id: string, status: TaskStatus) =>
      request<TarefaKanban>(`/admin/tasks/${id}/status`, { method: 'PATCH', body: { status } }),
    atualizar: (id: string, body: unknown) =>
      request<TarefaKanban>(`/admin/tasks/${id}`, { method: 'PATCH', body }),
    remover: (id: string) => request<TarefaKanban>(`/admin/tasks/${id}`, { method: 'DELETE' }),
  },
};
