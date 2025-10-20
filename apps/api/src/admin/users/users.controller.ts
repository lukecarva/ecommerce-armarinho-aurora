import { allPermissions } from '@aurora/types';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService } from '../../auth/auth.service';
import { AuditService } from '../../common/audit.service';
import { clientIp, CurrentUser, type AuthenticatedUser } from '../../common/current-user';
import { RequirePermissions } from '../../common/permissions.decorator';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';

const userCreateSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(80),
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  password: z.string().min(10, 'A senha precisa de pelo menos 10 caracteres').max(128),
  roleId: z.string().uuid('Escolha um perfil de acesso'),
  active: z.boolean().default(true),
});

const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  roleId: z.string().uuid(),
  active: z.boolean(),
  /** Opcional: só troca a senha quando vem preenchida. */
  password: z.string().min(10).max(128).optional().or(z.literal('')),
});

const roleSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(160).nullable().optional(),
  permissions: z.array(z.string()).min(1, 'Escolha ao menos uma permissão'),
});

const auditQuerySchema = z.object({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
});

@ApiTags('Admin — Usuários')
@Controller('admin')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  @RequirePermissions('usuarios:ver')
  async listUsers() {
    const users = await this.prisma.adminUser.findMany({
      orderBy: { name: 'asc' },
      include: { role: { select: { id: true, name: true } } },
    });

    // O hash da senha nunca sai daqui, nem para quem administra usuários.
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      active: user.active,
      lastLoginAt: user.lastLoginAt,
      role: user.role,
      createdAt: user.createdAt,
    }));
  }

  @Post('users')
  @RequirePermissions('usuarios:criar')
  async createUser(
    @Body(new ZodValidationPipe(userCreateSchema)) body: z.infer<typeof userCreateSchema>,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const user = await this.prisma.adminUser.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash: await AuthService.hashPassword(body.password),
        roleId: body.roleId,
        active: body.active,
      },
      include: { role: { select: { id: true, name: true } } },
    });

    await this.audit.record({
      actorId: actor.id,
      entity: 'usuario',
      entityId: user.id,
      action: 'criar',
      after: { name: user.name, email: user.email, role: user.role.name },
      ip: clientIp(request),
    });

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  @Put('users/:id')
  @RequirePermissions('usuarios:editar')
  async updateUser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) body: z.infer<typeof userUpdateSchema>,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const before = await this.prisma.adminUser.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!before) throw new BadRequestException('Usuário não encontrado.');

    // Ninguém desativa a própria conta e fica trancado do lado de fora.
    if (id === actor.id && !body.active) {
      throw new ForbiddenException('Você não pode desativar a sua própria conta.');
    }

    const user = await this.prisma.adminUser.update({
      where: { id },
      data: {
        name: body.name,
        email: body.email,
        roleId: body.roleId,
        active: body.active,
        ...(body.password ? { passwordHash: await AuthService.hashPassword(body.password) } : {}),
      },
      include: { role: { select: { id: true, name: true } } },
    });

    // Trocar senha, desativar ou mudar de papel derruba as sessões abertas:
    // a mudança precisa valer agora, não quando o token expirar.
    if (body.password || !body.active || before.roleId !== body.roleId) {
      await this.auth.revokeAllSessions(id);
    }

    await this.audit.record({
      actorId: actor.id,
      entity: 'usuario',
      entityId: id,
      action: 'editar',
      before: {
        name: before.name,
        email: before.email,
        active: before.active,
        roleId: before.roleId,
      },
      after: { name: user.name, email: user.email, active: user.active, roleId: user.roleId },
      ip: clientIp(request),
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
    };
  }

  @Delete('users/:id')
  @RequirePermissions('usuarios:excluir')
  @ApiOkResponse({ description: 'Desativa o usuário e encerra as sessões dele.' })
  async deactivateUser(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    if (id === actor.id) {
      throw new ForbiddenException('Você não pode desativar a sua própria conta.');
    }

    // Desativamos em vez de apagar: os registros de auditoria precisam
    // continuar apontando para quem fez cada alteração.
    await this.prisma.adminUser.update({ where: { id }, data: { active: false } });
    await this.auth.revokeAllSessions(id);

    await this.audit.record({
      actorId: actor.id,
      entity: 'usuario',
      entityId: id,
      action: 'excluir',
      ip: clientIp(request),
    });

    return { ok: true };
  }

  // ─────────────────────────────── Papéis ──────────────────────────────────

  @Get('roles')
  @RequirePermissions('usuarios:ver')
  async listRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  @Get('permissions')
  @RequirePermissions('usuarios:ver')
  @ApiOkResponse({ description: 'Catálogo de permissões para montar a tela de papéis.' })
  listPermissions() {
    return allPermissions();
  }

  @Post('roles')
  @RequirePermissions('usuarios:criar')
  createRole(@Body(new ZodValidationPipe(roleSchema)) body: z.infer<typeof roleSchema>) {
    return this.prisma.role.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        permissions: body.permissions,
      },
    });
  }

  @Put('roles/:id')
  @RequirePermissions('usuarios:editar')
  async updateRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(roleSchema)) body: z.infer<typeof roleSchema>,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const role = await this.prisma.role.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description ?? null,
        permissions: body.permissions,
      },
      include: { users: { select: { id: true } } },
    });

    // Mudou o que o papel permite: quem o usa precisa reautenticar para não
    // continuar com acesso que já foi retirado.
    await Promise.all(role.users.map((user) => this.auth.revokeAllSessions(user.id)));

    await this.audit.record({
      actorId: actor.id,
      entity: 'papel',
      entityId: id,
      action: 'editar',
      after: { name: role.name, permissions: body.permissions },
      ip: clientIp(request),
    });

    return { id: role.id, name: role.name, permissions: role.permissions };
  }

  // ────────────────────────────── Auditoria ────────────────────────────────

  @Get('audit')
  @RequirePermissions('usuarios:ver')
  @ApiOkResponse({ description: 'Trilha de auditoria das ações do painel.' })
  async listAudit(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>,
  ) {
    const where = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        include: { actor: { select: { id: true, name: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
    };
  }
}
