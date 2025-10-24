/**
 * Seed inicial — Sprint 0.
 *
 * Popula o que a loja precisa para existir: dados cadastrais, identidade
 * visual, horário de funcionamento, opções de entrega, grupos de preço,
 * papéis de acesso, as categorias do design e um punhado de produtos reais
 * para validar as unidades de venda ponta a ponta.
 *
 * É idempotente: pode rodar quantas vezes precisar.
 *
 * O primeiro usuário administrador NÃO é criado aqui — ele nasce na Sprint 1,
 * junto da autenticação, para não fixar um hash de senha antes de o algoritmo
 * definitivo (argon2id) existir.
 */
import { DEFAULT_ROLES } from '@aurora/types';
import { hash } from '@node-rs/argon2';
import { PrismaClient, type Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const STORE_INFO = {
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
};

/**
 * Identidade visual. Os arquivos de marca entram pelo painel (módulo
 * Identidade Visual) — por isso nascem nulos, e a vitrine cai no wordmark.
 */
const STORE_BRANDING = {
  logoPrincipal: null,
  logoRodape: null,
  logoMono: null,
  favicon: null,
  ogImage: null,
  iconesPwa: [],
  corPrimaria: '#1B3A8C',
  corSecundaria: '#FDC300',
  corDestaque: '#E30613',
};

/** Seg–sex 9h–18h · Sáb 9h–16h · Dom fechado */
const BUSINESS_HOURS = [
  { weekday: 0, opensAt: '00:00', closesAt: '00:00', closed: true },
  { weekday: 1, opensAt: '09:00', closesAt: '18:00', closed: false },
  { weekday: 2, opensAt: '09:00', closesAt: '18:00', closed: false },
  { weekday: 3, opensAt: '09:00', closesAt: '18:00', closed: false },
  { weekday: 4, opensAt: '09:00', closesAt: '18:00', closed: false },
  { weekday: 5, opensAt: '09:00', closesAt: '18:00', closed: false },
  { weekday: 6, opensAt: '09:00', closesAt: '16:00', closed: false },
];

/** As duas únicas formas de receber. Nenhuma delas calcula valor. */
const DELIVERY_METHODS: Prisma.DeliveryMethodCreateInput[] = [
  {
    label: 'Retirar na loja',
    description: 'Av. Exemplo, 1000 — Centro, São Paulo/SP',
    type: 'retirada',
    priceLabel: 'Grátis',
    asksAddress: false,
    position: 1,
  },
  {
    label: 'Motoboy',
    description: 'Combinamos o valor da entrega pelo WhatsApp, conforme a sua região.',
    type: 'motoboy',
    priceLabel: 'Consultar valor',
    asksAddress: true,
    position: 2,
  },
];

const CUSTOMER_GROUPS = [
  { name: 'Varejo', slug: 'varejo', isDefault: true, discountPercent: '0' },
  // Existe desde já no modelo, mas nada de atacado aparece na vitrine da v1.
  { name: 'Atacado', slug: 'atacado', isDefault: false, discountPercent: '0' },
];

/**
 * Os papéis vivem em `@aurora/types` porque o painel também precisa
 * deles para montar a tela de permissões — uma definição só, sem divergência.
 */
const ROLES = DEFAULT_ROLES;

/** As categorias exatamente como aparecem na grade da home do design. */
const CATEGORIES = [
  { name: 'Tecidos', slug: 'tecidos', position: 1 },
  { name: 'Fios e Barbantes', slug: 'fios-e-barbantes', position: 2 },
  { name: 'Aviamentos', slug: 'aviamentos', position: 3 },
  { name: 'Máquinas e Acessórios', slug: 'maquinas-e-acessorios', position: 4 },
  { name: 'Artesanato', slug: 'artesanato', position: 5 },
  { name: 'Retalhos', slug: 'retalhos', position: 6 },
];

interface SeedProduct {
  skuFutura: string;
  name: string;
  slug: string;
  categorySlug: string;
  unit: 'metro' | 'unidade' | 'pacote' | 'kg' | 'conjunto';
  saleStep: string;
  minQty: string;
  packSize?: number;
  price: string;
  promoPrice?: string;
  attributes: Record<string, string>;
  qty: string;
}

/**
 * Produtos do design. Servem para provar as três unidades de venda:
 * tecido por metro (com fração), fio por unidade e aviamento por pacote.
 * Sem foto de propósito — as imagens entram depois, pelo painel.
 */
const PRODUCTS: SeedProduct[] = [
  {
    skuFutura: '10001',
    name: 'Tricoline Estampado 100% Algodão',
    slug: 'tricoline-estampado-100-algodao',
    categorySlug: 'tecidos',
    unit: 'metro',
    saleStep: '0.5',
    minQty: '1',
    price: '15.90',
    attributes: { largura: '1,50m', composicao: '100% Algodão' },
    qty: '120',
  },
  {
    skuFutura: '10002',
    name: 'Tricoline Floral Digital Premium',
    slug: 'tricoline-floral-digital-premium',
    categorySlug: 'tecidos',
    unit: 'metro',
    saleStep: '0.5',
    minQty: '1',
    price: '19.90',
    attributes: {
      largura: '1,50m',
      composicao: '100% Algodão',
      acabamento: 'Estampa digital premium',
    },
    qty: '48',
  },
  {
    skuFutura: '10003',
    name: 'Tricoline Xadrez 100% Algodão',
    slug: 'tricoline-xadrez-100-algodao',
    categorySlug: 'tecidos',
    unit: 'metro',
    saleStep: '0.5',
    minQty: '1',
    price: '15.90',
    attributes: { largura: '1,50m', composicao: '100% Algodão' },
    qty: '2',
  },
  {
    skuFutura: '20001',
    name: 'Fio de Rafia 300m',
    slug: 'fio-de-rafia-300m',
    categorySlug: 'fios-e-barbantes',
    unit: 'unidade',
    saleStep: '1',
    minQty: '1',
    price: '35.90',
    attributes: { metragem: '300m' },
    qty: '25',
  },
  {
    skuFutura: '20002',
    name: 'Fio Amigurumi Círculo 125m',
    slug: 'fio-amigurumi-circulo-125m',
    categorySlug: 'fios-e-barbantes',
    unit: 'unidade',
    saleStep: '1',
    minQty: '1',
    price: '21.90',
    promoPrice: '16.90',
    attributes: { metragem: '125m', marca: 'Círculo' },
    qty: '60',
  },
  {
    skuFutura: '20003',
    name: 'Barbante 6 Fios 700g',
    slug: 'barbante-6-fios-700g',
    categorySlug: 'fios-e-barbantes',
    unit: 'unidade',
    saleStep: '1',
    minQty: '1',
    price: '24.90',
    promoPrice: '18.90',
    attributes: { peso: '700g', fios: '6 fios' },
    qty: '0',
  },
  {
    skuFutura: '30001',
    name: 'Botão de Pérola',
    slug: 'botao-de-perola',
    categorySlug: 'aviamentos',
    unit: 'pacote',
    saleStep: '1',
    minQty: '1',
    packSize: 10,
    price: '11.99',
    attributes: { material: 'Pérola sintética' },
    qty: '80',
  },
];

async function main(): Promise<void> {
  console.info('Semeando dados iniciais da Armarinho Aurora…');

  await prisma.setting.upsert({
    where: { key: 'store.info' },
    create: { key: 'store.info', value: STORE_INFO },
    update: { value: STORE_INFO },
  });

  await prisma.setting.upsert({
    where: { key: 'store.branding' },
    create: { key: 'store.branding', value: STORE_BRANDING },
    update: {}, // não sobrescreve o que a loja já enviou pelo painel
  });

  for (const hour of BUSINESS_HOURS) {
    await prisma.businessHour.upsert({
      where: { weekday: hour.weekday },
      create: hour,
      update: hour,
    });
  }

  for (const method of DELIVERY_METHODS) {
    const existing = await prisma.deliveryMethod.findFirst({ where: { label: method.label } });
    if (existing) {
      await prisma.deliveryMethod.update({ where: { id: existing.id }, data: method });
    } else {
      await prisma.deliveryMethod.create({ data: method });
    }
  }

  for (const group of CUSTOMER_GROUPS) {
    await prisma.customerGroup.upsert({
      where: { slug: group.slug },
      create: group,
      update: { name: group.name, isDefault: group.isDefault },
    });
  }

  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: { name: role.name, description: role.description, permissions: role.permissions },
      update: { description: role.description, permissions: role.permissions },
    });
  }

  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name, position: category.position },
    });
  }

  for (const item of PRODUCTS) {
    const category = await prisma.category.findUnique({ where: { slug: item.categorySlug } });

    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      create: {
        skuFutura: item.skuFutura,
        name: item.name,
        slug: item.slug,
        categoryId: category?.id ?? null,
        unit: item.unit,
        saleStep: item.saleStep,
        minQty: item.minQty,
        packSize: item.packSize ?? null,
        price: item.price,
        promoPrice: item.promoPrice ?? null,
        attributes: item.attributes,
        status: 'ativo',
        // Fotos entram depois; o card exibe "Sem foto" enquanto isso.
        needsContent: true,
      },
      update: {
        name: item.name,
        price: item.price,
        promoPrice: item.promoPrice ?? null,
        attributes: item.attributes,
      },
    });

    const qty = Number(item.qty);

    // `upsert` não serve aqui: no Postgres, dois NULL são valores distintos,
    // então o índice único composto não casa com `variantId = null`.
    const existingInventory = await prisma.inventory.findFirst({
      where: { productId: product.id, variantId: null },
    });

    if (existingInventory) {
      await prisma.inventory.update({
        where: { id: existingInventory.id },
        data: { qty: item.qty, availability: availabilityFor(qty) },
      });
    } else {
      await prisma.inventory.create({
        data: {
          productId: product.id,
          qty: item.qty,
          availability: availabilityFor(qty),
          source: 'manual',
        },
      });
    }
  }

  await seedOwner();

  console.info(
    `Pronto: ${CATEGORIES.length} categorias, ${PRODUCTS.length} produtos, ` +
      `${DELIVERY_METHODS.length} formas de entrega, ${ROLES.length} papéis de acesso.`,
  );
}

/**
 * Cria o primeiro usuário do painel, uma única vez.
 *
 * A senha vem de `ADMIN_PASSWORD` quando definida; caso contrário sorteamos
 * uma e mostramos no terminal. Nunca existe senha padrão fixa — um painel
 * administrativo com "admin/admin" é um convite aberto.
 */
async function seedOwner(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@exemplo.com').trim().toLowerCase();

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.info(`Usuário administrador já existe: ${email}`);
    return;
  }

  const owner = await prisma.role.findUnique({ where: { name: 'Dono' } });
  if (!owner) throw new Error('Papel "Dono" não encontrado — rode o seed completo.');

  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString('base64url');

  await prisma.adminUser.create({
    data: {
      name: process.env.ADMIN_NAME ?? 'Administrador',
      email,
      passwordHash: await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
      roleId: owner.id,
      active: true,
    },
  });

  console.info('');
  console.info('Usuário administrador criado:');
  console.info(`  e-mail: ${email}`);
  console.info(`  senha:  ${password}`);
  if (generated) {
    console.info('  (senha sorteada — anote agora, ela não será exibida de novo)');
  }
  console.info('');
}

/** Traduz quantidade em estado — nunca exibimos o número exato na vitrine. */
function availabilityFor(qty: number): 'em_estoque' | 'ultimas_unidades' | 'sob_consulta' {
  if (qty <= 0) return 'sob_consulta';
  if (qty <= 3) return 'ultimas_unidades';
  return 'em_estoque';
}

main()
  .catch((error: unknown) => {
    console.error('Falha ao semear o banco:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
