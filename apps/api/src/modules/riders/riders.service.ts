import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus, PaymentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { CreateRiderDto, UpdateRiderDto } from './dto/create-rider.dto';
import { allowedRiderStatuses } from '../../common/rider-status';

const riderPermissions = ['delivery:view', 'delivery:scan', 'delivery:update', 'delivery:complete', 'shipment:view', 'pickup:view', 'pickup:update'];

@Injectable()
export class RidersService {
  constructor(private readonly prisma: PrismaService) {}

  async myAssignments(actor: AuthenticatedUser) {
    if (!actor.riderId) throw new ForbiddenException('Rider profile required');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const assignments = await this.prisma.riderAssignment.findMany({
      where: { riderId: actor.riderId, OR: [{ status: 'ACTIVE', consignment: { organizationId: actor.organizationId, deletedAt: null, status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } } }, { status: 'ENDED', consignment: { organizationId: actor.organizationId, deletedAt: null, status: 'DELIVERED', deliveredAt: { gte: today } } }] },
      orderBy: { assignedAt: 'asc' },
      select: { id: true, status: true, assignedAt: true, endedAt: true, consignment: { select: { id: true, cnNumber: true, status: true, serviceType: true, parties: true, addresses: true, packages: true, items: true, payments: true } } },
    });
    return assignments.map((assignment) => ({
      ...assignment,
      allowedStatuses: allowedRiderStatuses(
        assignment.consignment.status,
        assignment.consignment.payments.some((payment) => payment.method === 'CASH' && payment.status !== PaymentStatus.VERIFIED),
      ),
    }));
  }

  async enableCurrentAdmin(employeeCode: string, actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    return this.prisma.$transaction(async (transaction) => {
      const role = await transaction.role.upsert({ where: { organizationId_name: { organizationId: actor.organizationId, name: 'RIDER' } }, create: { organizationId: actor.organizationId, name: 'RIDER', description: 'Assigned delivery rider' }, update: {} });
      const permissions = await transaction.permission.findMany({ where: { organizationId: actor.organizationId, code: { in: riderPermissions } } });
      if (permissions.length !== riderPermissions.length) throw new BadRequestException('Rider permissions are not configured');
      await transaction.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
      await transaction.userRole.upsert({ where: { userId_roleId: { userId: actor.id, roleId: role.id } }, create: { userId: actor.id, roleId: role.id, organizationId: actor.organizationId }, update: {} });
      const rider = await transaction.rider.upsert({ where: { userId: actor.id }, create: { userId: actor.id, organizationId: actor.organizationId, employeeCode: employeeCode.trim().toUpperCase() }, update: { employeeCode: employeeCode.trim().toUpperCase(), isActive: true } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'admin.rider_access_enabled', entityType: 'rider', entityId: rider.id, newValues: { employeeCode: rider.employeeCode } } });
      return rider;
    });
  }

  list(actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    return this.prisma.rider.findMany({
      where: { organizationId: actor.organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, employeeCode: true, isActive: true, vehicleDetails: true, serviceAreas: true, dailyCapacity: true, deliveryFee: true, availability: true, branch: { select: { id: true, name: true, code: true } }, user: { select: { id: true, displayName: true, email: true, phone: true } }, assignments: { where: { status: 'ACTIVE', consignment: { deletedAt: null, status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } } }, select: { consignmentId: true } }, earnings: { select: { amount: true, status: true } } },
    });
  }

  async recommendations(consignmentId: string, actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    const shipment = await this.prisma.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true, addresses: { where: { kind: 'DESTINATION' }, take: 1, select: { zone: true, addressLine: true, city: true } } } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    const destination = shipment.addresses[0];
    const haystack = `${destination?.zone ?? ''} ${destination?.addressLine ?? ''} ${destination?.city ?? ''}`.toLowerCase();
    const riders = await this.list(actor);
    return riders.map((rider) => {
      const matchedAreas = rider.serviceAreas.filter((area) => haystack.includes(area.trim().toLowerCase()));
      const activeParcels = rider.assignments.length;
      const remainingCapacity = Math.max(0, rider.dailyCapacity - activeParcels);
      return { ...rider, activeParcels, remainingCapacity, atCapacity: remainingCapacity === 0, areaMatched: matchedAreas.length > 0, matchedArea: matchedAreas[0] ?? null };
    }).sort((a, b) => Number(b.availability === 'AVAILABLE') - Number(a.availability === 'AVAILABLE') || Number(b.areaMatched) - Number(a.areaMatched) || Number(a.atCapacity) - Number(b.atCapacity) || a.activeParcels - b.activeParcels || a.user.displayName.localeCompare(b.user.displayName));
  }

  async create(input: CreateRiderDto, actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    return this.prisma.$transaction(async (transaction) => {
      const email = input.email.trim().toLowerCase();
      const existing = await transaction.user.findFirst({ where: { organizationId: actor.organizationId, email }, select: { id: true } });
      if (existing) throw new BadRequestException('A user with this email already exists');
      const permissions = await transaction.permission.findMany({ where: { organizationId: actor.organizationId, code: { in: riderPermissions } } });
      if (permissions.length !== riderPermissions.length) throw new BadRequestException('Rider permissions are not configured');
      const role = await transaction.role.upsert({ where: { organizationId_name: { organizationId: actor.organizationId, name: 'RIDER' } }, create: { organizationId: actor.organizationId, name: 'RIDER', description: 'Assigned delivery rider' }, update: {} });
      await transaction.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
      const user = await transaction.user.create({ data: { organizationId: actor.organizationId, email, passwordHash: await bcrypt.hash(input.password, 12), displayName: input.displayName.trim(), phone: input.phone, roles: { create: { organizationId: actor.organizationId, roleId: role.id } } } });
      const rider = await transaction.rider.create({ data: { organizationId: actor.organizationId, userId: user.id, employeeCode: input.employeeCode.trim().toUpperCase(), vehicleDetails: input.vehicleNumber ? { vehicleNumber: input.vehicleNumber.trim().toUpperCase() } : undefined, serviceAreas: input.serviceAreas?.map((area) => area.trim()).filter(Boolean) ?? [], dailyCapacity: input.dailyCapacity ?? 10, deliveryFee: input.deliveryFee ?? 0, availability: input.availability ?? 'AVAILABLE' }, include: { user: { select: { id: true, displayName: true, email: true, phone: true } } } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'rider.created', entityType: 'rider', entityId: rider.id, newValues: { employeeCode: rider.employeeCode, userId: user.id } } });
      await transaction.notification.create({ data: { organizationId: actor.organizationId, recipientId: user.id, channel: 'IN_APP', template: 'RIDER_ACCOUNT_CREATED', status: 'UNREAD', payload: { title: 'Rider account ready', message: 'Your delivery workspace is ready.' } } });
      return rider;
    });
  }

  async update(id: string, input: UpdateRiderDto, actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    const rider = await this.prisma.rider.findFirst({ where: { id, organizationId: actor.organizationId }, select: { id: true, userId: true } });
    if (!rider) throw new NotFoundException('Rider not found');
    return this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: rider.userId }, data: { ...(input.displayName ? { displayName: input.displayName.trim() } : {}), ...(input.email ? { email: input.email.trim().toLowerCase() } : {}), ...(input.phone !== undefined ? { phone: input.phone || null } : {}) } });
      return transaction.rider.update({ where: { id }, data: { ...(input.employeeCode ? { employeeCode: input.employeeCode.trim().toUpperCase() } : {}), ...(input.vehicleNumber !== undefined ? { vehicleDetails: input.vehicleNumber ? { vehicleNumber: input.vehicleNumber.trim().toUpperCase() } : undefined } : {}), ...(input.serviceAreas ? { serviceAreas: input.serviceAreas.map((area) => area.trim()).filter(Boolean) } : {}), ...(input.dailyCapacity ? { dailyCapacity: input.dailyCapacity } : {}), ...(input.deliveryFee !== undefined ? { deliveryFee: input.deliveryFee } : {}), ...(input.availability ? { availability: input.availability } : {}) }, include: { user: { select: { id: true, displayName: true, email: true, phone: true } }, assignments: { where: { status: 'ACTIVE' }, select: { consignmentId: true } }, earnings: { select: { amount: true, status: true } } } });
    });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    this.requireAdmin(actor);
    const rider = await this.prisma.rider.findFirst({ where: { id, organizationId: actor.organizationId }, select: { id: true, userId: true, assignments: { where: { status: 'ACTIVE' }, select: { id: true } } } });
    if (!rider) throw new NotFoundException('Rider not found');
    if (rider.assignments.length) throw new BadRequestException('End or reassign active deliveries before removing this rider');
    await this.prisma.$transaction([this.prisma.rider.update({ where: { id }, data: { isActive: false } }), this.prisma.user.update({ where: { id: rider.userId }, data: { isActive: false } }), this.prisma.authSession.updateMany({ where: { userId: rider.userId, revokedAt: null }, data: { revokedAt: new Date() } })]);
    return { success: true };
  }

  private requireAdmin(actor: AuthenticatedUser) {
    if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator access required');
  }
}
