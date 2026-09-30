import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { CreateStaffDto, UpdateStaffAccessDto, UpdateStaffDto } from './dto/create-staff.dto';

const defaultCodes = ['shipment:create', 'shipment:view', 'documents:view', 'documents:create', 'customer:view', 'customer:create'];
const riderCodes = ['shipment:view', 'pickup:view', 'pickup:update', 'delivery:view', 'delivery:scan', 'delivery:update', 'delivery:complete'];

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}
  async list(actor: AuthenticatedUser) {
    this.admin(actor);
    const users = await this.prisma.user.findMany({ where: { organizationId: actor.organizationId, isActive: true, roles: { some: { role: { OR: [{ name: 'BRANCH_STAFF' }, { name: { startsWith: 'STAFF_ACCESS_' } }] } } } }, select: { id: true, displayName: true, email: true, phone: true, isActive: true, branch: { select: { id: true, name: true, code: true } }, rider: { select: { id: true, employeeCode: true, isActive: true } }, roles: { select: { role: { select: { name: true, permissions: { select: { permission: { select: { code: true } } } } } } } } }, orderBy: { displayName: 'asc' } });
    return users.map((user) => ({ ...user, permissions: [...new Set(user.roles.flatMap((assignment) => assignment.role.permissions.map((item) => item.permission.code)))], riderEnabled: Boolean(user.rider?.isActive) }));
  }
  accessOptions(actor: AuthenticatedUser) { this.admin(actor); return this.prisma.permission.findMany({ where: { organizationId: actor.organizationId }, select: { code: true, description: true }, orderBy: { code: 'asc' } }); }
  async create(input: CreateStaffDto, actor: AuthenticatedUser) {
    this.admin(actor);
    return this.prisma.$transaction(async (tx) => {
      const email = input.email.trim().toLowerCase();
      if (await tx.user.findFirst({ where: { organizationId: actor.organizationId, email } })) throw new BadRequestException('A user with this email already exists');
      const permissions = await tx.permission.findMany({ where: { organizationId: actor.organizationId, code: { in: defaultCodes } } });
      const user = await tx.user.create({ data: { organizationId: actor.organizationId, email, displayName: input.displayName.trim(), phone: input.phone, passwordHash: await bcrypt.hash(input.password, 12) } });
      const role = await tx.role.create({ data: { organizationId: actor.organizationId, name: `STAFF_ACCESS_${user.id}`, description: `Individual access for ${user.displayName}` } });
      await tx.userRole.create({ data: { userId: user.id, roleId: role.id, organizationId: actor.organizationId } });
      await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'staff.created', entityType: 'user', entityId: user.id, newValues: { email: user.email, permissions: defaultCodes } } });
      return user;
    });
  }
  async update(id: string, input: UpdateStaffDto, actor: AuthenticatedUser) { this.admin(actor); await this.staff(id, actor); return this.prisma.user.update({ where: { id }, data: { ...(input.displayName ? { displayName: input.displayName.trim() } : {}), ...(input.email ? { email: input.email.trim().toLowerCase() } : {}), ...(input.phone !== undefined ? { phone: input.phone || null } : {}) }, select: { id: true, displayName: true, email: true, phone: true, isActive: true } }); }
  async updateAccess(id: string, input: UpdateStaffAccessDto, actor: AuthenticatedUser) {
    this.admin(actor); const user = await this.staff(id, actor);
    return this.prisma.$transaction(async (tx) => {
      const accessRole = await tx.role.upsert({ where: { organizationId_name: { organizationId: actor.organizationId, name: `STAFF_ACCESS_${id}` } }, create: { organizationId: actor.organizationId, name: `STAFF_ACCESS_${id}`, description: `Individual access for ${user.displayName}` }, update: {} });
      const requested = await tx.permission.findMany({ where: { organizationId: actor.organizationId, code: { in: input.permissions } } });
      if (requested.length !== input.permissions.length) throw new BadRequestException('One or more permissions are invalid');
      await tx.userRole.upsert({ where: { userId_roleId: { userId: id, roleId: accessRole.id } }, create: { userId: id, roleId: accessRole.id, organizationId: actor.organizationId }, update: {} });
      await tx.rolePermission.deleteMany({ where: { roleId: accessRole.id } });
      await tx.rolePermission.createMany({ data: requested.map((permission) => ({ roleId: accessRole.id, permissionId: permission.id })) });
      await tx.userRole.deleteMany({ where: { userId: id, role: { name: 'BRANCH_STAFF' } } });
      const riderRole = await tx.role.upsert({ where: { organizationId_name: { organizationId: actor.organizationId, name: 'RIDER' } }, create: { organizationId: actor.organizationId, name: 'RIDER', description: 'Assigned delivery rider' }, update: {} });
      if (input.riderEnabled) {
        if (!input.employeeCode?.trim()) throw new BadRequestException('Employee code is required for rider access');
        const riderPermissions = await tx.permission.findMany({ where: { organizationId: actor.organizationId, code: { in: riderCodes } } });
        await tx.rolePermission.createMany({ data: riderPermissions.map((permission) => ({ roleId: riderRole.id, permissionId: permission.id })), skipDuplicates: true });
        await tx.userRole.upsert({ where: { userId_roleId: { userId: id, roleId: riderRole.id } }, create: { userId: id, roleId: riderRole.id, organizationId: actor.organizationId }, update: {} });
        await tx.rider.upsert({ where: { userId: id }, create: { userId: id, organizationId: actor.organizationId, employeeCode: input.employeeCode.trim().toUpperCase() }, update: { employeeCode: input.employeeCode.trim().toUpperCase(), isActive: true } });
      } else {
        if (user.rider?._count.assignments) throw new BadRequestException('Rider access cannot be removed while active assignments exist');
        await tx.userRole.deleteMany({ where: { userId: id, roleId: riderRole.id } });
        await tx.rider.updateMany({ where: { userId: id }, data: { isActive: false } });
      }
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'staff.access.updated', entityType: 'user', entityId: id, newValues: { permissions: input.permissions, riderEnabled: input.riderEnabled } } });
      return { success: true };
    });
  }
  async remove(id: string, actor: AuthenticatedUser) { this.admin(actor); await this.staff(id, actor); await this.prisma.$transaction([this.prisma.user.update({ where: { id }, data: { isActive: false } }), this.prisma.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })]); return { success: true }; }
  private async staff(id: string, actor: AuthenticatedUser) { const user = await this.prisma.user.findFirst({ where: { id, organizationId: actor.organizationId, roles: { some: { role: { OR: [{ name: 'BRANCH_STAFF' }, { name: { startsWith: 'STAFF_ACCESS_' } }] } } } }, include: { rider: { include: { _count: { select: { assignments: { where: { status: 'ACTIVE' } } } } } } } }); if (!user) throw new NotFoundException('Staff member not found'); return user; }
  private admin(actor: AuthenticatedUser) { if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator access required'); }
}
