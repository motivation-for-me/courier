import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { CurrentUser } from '../../common/current-user.decorator';
import { requirePasswordBytes } from '../../common/password';

export function admin(actor: AuthenticatedUser) {
  if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator access required');
}
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 };

export async function deleteAccount(tx: Prisma.TransactionClient, id: string, actor: AuthenticatedUser, type = 'ACCOUNT') {
  admin(actor);
  if (id === actor.id) throw new BadRequestException('You cannot delete your own account');
  const user = await tx.user.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null }, include: { rider: true, roles: { include: { role: true } } } });
  if (!user) throw new NotFoundException('Account not found');
  if (user.rider && await tx.riderAssignment.count({ where: { riderId: user.rider.id, status: 'ACTIVE' } })) throw new BadRequestException('Reassign active deliveries before deleting this account');
  if (await tx.pickup.count({ where: { assignedToId: id, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } })) throw new BadRequestException('Reassign active pickups before deleting this account');
  await protectLastAdmin(tx, user, actor, false);
  const now = new Date();
  const entityType = user.rider ? 'RIDER' : type;
  await tx.recycleBinItem.create({ data: { organizationId: actor.organizationId, entityType, entityId: user.rider?.id ?? id, label: user.displayName, deletedById: actor.id, snapshot: { userId: id, userActive: user.isActive, riderId: user.rider?.id ?? null, riderActive: user.rider?.isActive ?? false } } });
  await tx.user.update({ where: { id }, data: { deletedAt: now, isActive: false, authVersion: { increment: 1 } } });
  if (user.rider) await tx.rider.update({ where: { id: user.rider.id }, data: { deletedAt: now, isActive: false } });
  await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });
  await tx.emailAction.updateMany({ where: { userId: id, consumedAt: null }, data: { consumedAt: now } });
  await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'account.deleted', entityType, entityId: id } });
}
async function protectLastAdmin(tx: Prisma.TransactionClient, user: { id: string; isActive: boolean; roles: Array<{ role: { name: string } }> }, actor: AuthenticatedUser, active: boolean) {
  if (!active && user.isActive && user.roles.some(({ role }) => role.name === 'ADMIN') && await tx.user.count({ where: { organizationId: actor.organizationId, deletedAt: null, isActive: true, roles: { some: { role: { name: 'ADMIN' } } } } }) <= 1) throw new BadRequestException('Keep at least one active administrator');
}
class AccountInput {
  @IsString() @MinLength(1) @MaxLength(100) displayName!: string;
  @IsString() @MinLength(1) @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MinLength(12) @MaxLength(72) password?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsIn(['ADMIN', 'RIDER', 'SHOP']) role?: string;
  @IsOptional() @IsString() @MaxLength(50) employeeCode?: string;
  @IsOptional() @IsString() customerId?: string;
}
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}
  private transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(operation, transactionOptions).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('The account ID or rider code already exists. Refresh and try again.');
        if (error.code === 'P2034') throw new ConflictException('This record changed during the request. Refresh and try again.');
      }
      throw error;
    });
  }
  async save(id: string | null, input: AccountInput, actor: AuthenticatedUser) {
    admin(actor);
    const email = input.email.trim().toLowerCase(), displayName = input.displayName.trim();
    if (!email || !displayName) throw new BadRequestException('Name and email/account ID are required');
    if (input.password) requirePasswordBytes(input.password);
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined;
    return this.transaction(async (tx) => {
      if (await tx.user.findFirst({ where: { organizationId: actor.organizationId, email: { equals: email, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) }, select: { id: true } })) throw new BadRequestException('Email/account ID already exists, including in the Recycle Bin');
      if (!id) {
        if (!passwordHash || !input.role) throw new BadRequestException('Choose a role and an initial password');
        let role = await tx.role.findUnique({ where: { organizationId_name: { organizationId: actor.organizationId, name: input.role } } });
        if (input.role !== 'ADMIN') {
          const codes = input.role === 'RIDER' ? ['delivery:view', 'delivery:scan', 'delivery:update', 'delivery:complete', 'shipment:view', 'pickup:view', 'pickup:update'] : ['shipment:create', 'shipment:view', 'customer:view', 'documents:view', 'documents:create'];
          const permissions = await tx.permission.findMany({ where: { organizationId: actor.organizationId, code: { in: codes } } });
          if (permissions.length !== codes.length) throw new BadRequestException('Account permissions are not configured');
          if (!role) role = await tx.role.create({ data: { organizationId: actor.organizationId, name: input.role } });
          await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role!.id, permissionId: permission.id })), skipDuplicates: true });
        }
        if (!role) throw new BadRequestException('This role is not configured');
        if (input.role === 'SHOP' && (!input.customerId || !await tx.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId, deletedAt: null } }))) throw new BadRequestException('Select a shop in your organization');
        if (input.role === 'RIDER' && !input.employeeCode?.trim()) throw new BadRequestException('Rider employee code is required');
        if (input.role === 'RIDER' && await tx.rider.findFirst({ where: { organizationId: actor.organizationId, employeeCode: input.employeeCode!.trim().toUpperCase() }, select: { id: true } })) throw new BadRequestException('Rider employee code already exists, including in the Recycle Bin');
        const data: Prisma.UserUncheckedCreateInput = { organizationId: actor.organizationId, displayName, email, phone: input.phone?.trim() || null, passwordHash, customerId: input.role === 'SHOP' ? input.customerId : null, roles: { create: { roleId: role.id, organizationId: actor.organizationId } } };
        if (input.role === 'RIDER') data.rider = { create: { organizationId: actor.organizationId, employeeCode: input.employeeCode!.trim().toUpperCase() } };
        const user = await tx.user.create({ data, select: { id: true } });
        await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'account.created', entityType: 'user', entityId: user.id, newValues: { role: input.role } } });
        return user;
      }
      const user = await tx.user.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null }, include: { roles: { include: { role: true } } } });
      if (!user) throw new NotFoundException('Account not found');
      if (input.role || input.customerId || input.employeeCode) throw new BadRequestException('Manage role profiles through their management section');
      if (id === actor.id && input.isActive === false) throw new BadRequestException('You cannot disable your own account');
      await protectLastAdmin(tx, user, actor, input.isActive ?? user.isActive);
      const changedEmail = email !== user.email;
      const revoke = changedEmail || !!passwordHash || input.isActive === false;
      await tx.user.update({ where: { id }, data: { displayName, email, phone: input.phone?.trim() || null, ...(passwordHash ? { passwordHash } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}), ...(changedEmail ? { emailVerifiedAt: null, googleSubject: null } : {}), ...(revoke ? { authVersion: { increment: 1 } } : {}) } });
      if (revoke) {
        await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.emailAction.updateMany({ where: { userId: id, consumedAt: null }, data: { consumedAt: new Date() } });
      }
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'account.updated', entityType: 'user', entityId: id, newValues: { displayName, email, isActive: input.isActive ?? user.isActive, passwordChanged: !!passwordHash } } });
      return { id };
    });
  }
  async remove(id: string, actor: AuthenticatedUser) { admin(actor); await this.transaction((tx) => deleteAccount(tx, id, actor)); return { success: true }; }
  async bin(actor: AuthenticatedUser, query: { type?: string; search?: string; page?: string }) {
    admin(actor);
    const page = Number(query.page || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000 || (query.type && !['ACCOUNT', 'RIDER', 'SHIPMENT'].includes(query.type))) throw new BadRequestException('Invalid Recycle Bin filter');
    const where = { organizationId: actor.organizationId, restoredAt: null, ...(query.type ? { entityType: query.type } : {}), ...(query.search ? { label: { contains: query.search.trim().slice(0, 200), mode: 'insensitive' as const } } : {}) };
    const [total, items] = await Promise.all([this.prisma.recycleBinItem.count({ where }), this.prisma.recycleBinItem.findMany({ where, take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, label: true, entityType: true, createdAt: true } })]);
    return { items, total, page, pages: Math.max(1, Math.ceil(total / 50)) };
  }
  async restore(id: string, actor: AuthenticatedUser) {
    admin(actor);
    await this.transaction(async (tx) => {
      const item = await tx.recycleBinItem.findFirst({ where: { id, organizationId: actor.organizationId, restoredAt: null } });
      if (!item) throw new NotFoundException('Deleted record not found');
      const snapshot = item.snapshot as { userId?: string; userActive?: boolean; riderId?: string; riderActive?: boolean };
      if (item.entityType === 'SHIPMENT') {
        const changed = await tx.consignment.updateMany({ where: { id: item.entityId, organizationId: actor.organizationId, deletedAt: { not: null } }, data: { deletedAt: null } });
        if (!changed.count) throw new BadRequestException('Shipment is no longer deleted');
      } else {
        if (!snapshot.userId) throw new BadRequestException('Deleted account metadata is incomplete');
        const user = await tx.user.findFirst({ where: { id: snapshot.userId, organizationId: actor.organizationId, deletedAt: { not: null } }, select: { customerId: true } });
        if (!user) throw new NotFoundException('Deleted account not found');
        if (user.customerId && !await tx.customer.findFirst({ where: { id: user.customerId, organizationId: actor.organizationId, deletedAt: null } })) throw new BadRequestException('The linked shop has been deleted. Restore the shop before restoring its account');
        const changed = await tx.user.updateMany({ where: { id: snapshot.userId, organizationId: actor.organizationId, deletedAt: { not: null } }, data: { deletedAt: null, isActive: snapshot.userActive === true, authVersion: { increment: 1 } } });
        if (!changed.count) throw new BadRequestException('Account is no longer deleted');
        if (snapshot.riderId) await tx.rider.updateMany({ where: { id: snapshot.riderId, organizationId: actor.organizationId, deletedAt: { not: null } }, data: { deletedAt: null, isActive: snapshot.riderActive === true } });
      }
      await tx.recycleBinItem.update({ where: { id }, data: { restoredAt: new Date(), restoredById: actor.id } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'record.restored', entityType: item.entityType, entityId: item.entityId } });
    });
    return { success: true };
  }
}
@Controller('accounts')
class AccountsController {
  constructor(private readonly service: AccountsService) {}
  @Post() create(@Body() input: AccountInput, @CurrentUser() actor: AuthenticatedUser) { return this.service.save(null, input, actor); }
  @Patch(':id') update(@Param('id') id: string, @Body() input: AccountInput, @CurrentUser() actor: AuthenticatedUser) { return this.service.save(id, input, actor); }
  @Delete(':id') remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.remove(id, actor); }
}
@Controller('recycle-bin')
class RecycleBinController {
  constructor(private readonly service: AccountsService) {}
  @Get() list(@CurrentUser() actor: AuthenticatedUser, @Query() query: { type?: string; search?: string; page?: string }) { return this.service.bin(actor, query); }
  @Post(':id/restore') restore(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.service.restore(id, actor); }
}
@Module({ controllers: [AccountsController, RecycleBinController], providers: [AccountsService] })
export class AccountsModule {}
