import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Recordish = Record<string, unknown>;

export interface AuditEntry {
  actorId: string | null;
  entity: string;
  entityId: string;
  action:
    | 'criar'
    | 'editar'
    | 'excluir'
    | 'login'
    | 'logout'
    | 'reordenar'
    | 'upload'
    // Direitos do titular (LGPD, art. 18): quem exportou ou apagou, e quando.
    | 'exportar'
    | 'anonimizar';
  before?: Recordish | null;
  after?: Recordish | null;
  ip?: string | null;
}

/**
 * Trilha de auditoria do painel.
 *
 * Guarda apenas o que mudou, não o registro inteiro — um produto com descrição
 * longa e atributos viraria um log gigante e ilegível. Campos sensíveis nunca
 * entram no diff.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          entity: entry.entity,
          entityId: entry.entityId,
          action: entry.action,
          diff: (diffOf(entry.before, entry.after) as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          ip: entry.ip ?? null,
        },
      });
    } catch (error) {
      // Auditoria nunca pode derrubar a operação que o usuário pediu.
      this.logger.error(`Falha ao registrar auditoria de ${entry.entity}:${entry.entityId}`, error);
    }
  }
}

const REDACTED = ['passwordHash', 'password', 'totpSecret', 'tokenHash'];

/** Diferença campo a campo: `{ preco: { de: 1590, para: 1390 } }`. */
export function diffOf(
  before: Recordish | null | undefined,
  after: Recordish | null | undefined,
): Recordish | null {
  if (!before && !after) return null;
  if (!before) return { criado: redact(after ?? {}) };
  if (!after) return { removido: redact(before) };

  const changes: Recordish = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (REDACTED.includes(key)) continue;

    const from = before[key];
    const to = after[key];
    if (!isEqual(from, to)) {
      changes[key] = { de: serialize(from), para: serialize(to) };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

function redact(value: Recordish): Recordish {
  const copy: Recordish = {};
  for (const [key, item] of Object.entries(value)) {
    if (REDACTED.includes(key)) continue;
    copy[key] = serialize(item);
  }
  return copy;
}

/** Normaliza tipos que não sobrevivem ao JSON (Date, Decimal do Prisma). */
function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'toFixed' in (value as object)) return String(value);
  return value;
}

function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(serialize(a)) === JSON.stringify(serialize(b));
}
