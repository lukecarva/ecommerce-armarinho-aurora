/**
 * Regras da conta do cliente, compartilhadas entre API, vitrine e painel.
 *
 * O que mora aqui é o que precisa valer igual dos dois lados da rede: o que
 * conta como senha aceitável, como um CEP é escrito, e como um cliente
 * anonimizado aparece.
 */
import { stripAccents } from './slug.js';

// ──────────────────────────────── Senha ────────────────────────────────────

/**
 * Mínimo de oito caracteres, sem exigir símbolo ou maiúscula.
 *
 * Regra de composição ("uma maiúscula, um número, um símbolo") empurra as
 * pessoas para `Senha@123`, que atende a regra e cai em qualquer lista de
 * vazamento. Comprimento mínimo mais uma lista das senhas mais comuns protege
 * mais e irrita menos — é o que a NIST 800-63B recomenda.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Teto que o argon2 aceita com folga; acima disso é colagem acidental. */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * As senhas que aparecem no topo de toda lista de vazamento brasileira.
 *
 * Não é uma lista completa — é o suficiente para barrar o óbvio. Comparação
 * sem acento e sem caixa.
 */
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',
  '12341234',
  'senha123',
  'senha1234',
  'senhasenha',
  'password',
  'password1',
  'qwerty123',
  'abcd1234',
  'abc12345',
  'brasil123',
  'mudar123',
  'teste123',
  'aurora',
  'aurora123',
  'iloveyou',
]);

export type PasswordProblem = 'curta' | 'longa' | 'comum';

export const PASSWORD_PROBLEM_MESSAGES: Record<PasswordProblem, string> = {
  curta: `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  longa: `Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`,
  comum: 'Essa senha é uma das mais usadas — escolha outra.',
};

/** `null` quando a senha serve; senão, o motivo. */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'curta';
  if (password.length > PASSWORD_MAX_LENGTH) return 'longa';
  if (COMMON_PASSWORDS.has(stripAccents(password).toLowerCase())) return 'comum';

  return null;
}

// ─────────────────────────────── E-mail ────────────────────────────────────

/**
 * E-mail em minúsculas e sem espaço.
 *
 * "Maria@Gmail.com" e "maria@gmail.com" são a mesma caixa para qualquer
 * provedor que a cliente vá usar. Sem normalizar, a mesma pessoa cria duas
 * contas e não acha a primeira na hora de recuperar a senha.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ──────────────────────────────── CEP ──────────────────────────────────────

/** Só os oito dígitos: "01000-000" → "01000000". */
export function normalizeCep(cep: string): string {
  return cep.replace(/\D/g, '');
}

export function isValidCep(cep: string): boolean {
  const digitos = normalizeCep(cep);
  // "00000000" tem oito dígitos e não existe — é o que o autocompletar do
  // navegador às vezes preenche.
  return digitos.length === 8 && digitos !== '00000000';
}

/** "01000000" → "01000-000". Devolve o texto como veio se não for CEP. */
export function formatCep(cep: string): string {
  const digitos = normalizeCep(cep);
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : cep;
}

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export type Uf = (typeof UFS)[number];

export function isUf(valor: string): valor is Uf {
  return (UFS as readonly string[]).includes(valor.toUpperCase());
}

/**
 * Endereço numa linha, como a atendente copia para o motoboy.
 * "Av. Exemplo, 1000 — Centro, São Paulo/SP"
 */
export function formatAddressLine(endereco: {
  street: string;
  number: string;
  complement?: string | null;
  district: string;
  city: string;
  uf: string;
}): string {
  const complemento = endereco.complement ? ` (${endereco.complement})` : '';
  return `${endereco.street}, ${endereco.number}${complemento} — ${endereco.district}, ${endereco.city}/${endereco.uf}`;
}

// ─────────────────────────────── Telefone ──────────────────────────────────

/**
 * "5511999990000" → "(11) 99999-0000".
 *
 * Aceita com ou sem DDI. O que não parecer telefone brasileiro volta como
 * veio — melhor mostrar o número cru que um formato errado.
 */
export function formatPhoneBR(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '');
  const local = digitos.length >= 12 && digitos.startsWith('55') ? digitos.slice(2) : digitos;

  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;

  return telefone;
}

// ───────────────────────────── Notificações ────────────────────────────────

export const NOTIFICATION_TYPES = [
  'pedido_recebido',
  'status_alterado',
  'cupom_novo',
  'conta',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  pedido_recebido: 'Pedido recebido',
  status_alterado: 'Pedido atualizado',
  cupom_novo: 'Cupom novo',
  conta: 'Sua conta',
};

// ──────────────────────────────── LGPD ─────────────────────────────────────

/**
 * Como um cliente anonimizado aparece em pedidos e relatórios.
 *
 * O pedido fica — é registro de venda, com obrigação fiscal —, mas deixa de
 * dizer de quem era. O código do pedido e os valores continuam para o
 * relatório da loja fazer sentido.
 */
export const ANONYMIZED_NAME = 'Cliente anonimizado';

/**
 * Texto dos consentimentos, versionado.
 *
 * Mudar o texto dos termos exige mudar a versão: o consentimento gravado
 * aponta para o texto que a pessoa realmente leu, e não para o atual.
 */
export const TERMS_VERSION = '2026-09';
