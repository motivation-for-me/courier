import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus, PickupStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';

@Injectable()
export class PickupsService {
  constructor(private readonly prisma: PrismaService) {}

  async request(consignmentId: string, actor: AuthenticatedUser) {
    this.require(actor, 'pickup:create');
    return this.prisma.$transaction(async (tx) => {
      const consignment = await tx.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId } });
      if (!consignment) throw new NotFoundException('Consignment not found');
      if (consignment.status !== ConsignmentStatus.BOOKED && consignment.status !== ConsignmentStatus.VERIFIED) throw new BadRequestException('Consignment is not eligible for pickup');
      const existing = await tx.pickup.findUnique({ where: { consignmentId } });
      if (existing) return existing;
      const pickup = await tx.pickup.create({ data: { organizationId: actor.organizationId, consignmentId, requestedById: actor.id } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'pickup.requested', entityType: 'pickup', entityId: pickup.id, newValues: { consignmentId, status: PickupStatus.REQUESTED } } });
      return pickup;
    });
  }

  async assign(pickupId: string, assigneeId: string, actor: AuthenticatedUser, remarks?: string) {
    this.require(actor, 'pickup:assign');
    return this.prisma.$transaction(async (tx) => {
      const [pickup, assignee] = await Promise.all([
        tx.pickup.findFirst({ where: { id: pickupId, organizationId: actor.organizationId } }),
        tx.user.findFirst({ where: { id: assigneeId, organizationId: actor.organizationId, isActive: true } }),
      ]);
      if (!pickup || !assignee) throw new NotFoundException('Pickup or active assignee not found');
      if (pickup.status !== PickupStatus.REQUESTED && pickup.status !== PickupStatus.ASSIGNED) throw new BadRequestException('Pickup is not assignable');
      const updated = await tx.pickup.update({ where: { id: pickupId }, data: { assignedToId: assigneeId, assignedAt: new Date(), status: PickupStatus.ASSIGNED } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'pickup.assigned', entityType: 'pickup', entityId: pickupId, oldValues: { status: pickup.status }, newValues: { status: updated.status, assigneeId, remarks } } });
      return updated;
    });
  }

  async start(pickupId: string, actor: AuthenticatedUser) {
    const pickup = await this.getAssigned(pickupId, actor);
    if (pickup.status !== PickupStatus.ASSIGNED) throw new BadRequestException('Pickup must be assigned before starting');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pickup.update({ where: { id: pickupId }, data: { status: PickupStatus.IN_PROGRESS, startedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'pickup.started', entityType: 'pickup', entityId: pickupId, newValues: { status: updated.status } } });
      return updated;
    });
  }

  async complete(pickupId: string, actor: AuthenticatedUser, remarks?: string) {
    const pickup = await this.getAssigned(pickupId, actor);
    if (pickup.status !== PickupStatus.ASSIGNED && pickup.status !== PickupStatus.IN_PROGRESS) throw new BadRequestException('Pickup is not ready for completion');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pickup.update({ where: { id: pickupId }, data: { status: PickupStatus.COMPLETED, completedAt: new Date() } });
      await tx.consignment.update({ where: { id: pickup.consignmentId }, data: { status: ConsignmentStatus.VERIFIED, currentStatusAt: new Date() } });
      await tx.trackingEvent.create({ data: { consignmentId: pickup.consignmentId, eventType: ConsignmentStatus.VERIFIED, performedById: actor.id, remarks: remarks ?? 'Pickup completed' } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'pickup.completed', entityType: 'pickup', entityId: pickupId, newValues: { status: updated.status, remarks } } });
      return updated;
    });
  }

  async fail(pickupId: string, actor: AuthenticatedUser, reason: string) {
    const pickup = await this.getAssigned(pickupId, actor);
    if (pickup.status !== PickupStatus.ASSIGNED && pickup.status !== PickupStatus.IN_PROGRESS) throw new BadRequestException('Pickup is not active');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pickup.update({ where: { id: pickupId }, data: { status: PickupStatus.FAILED, failureReason: reason } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'pickup.failed', entityType: 'pickup', entityId: pickupId, newValues: { status: updated.status, reason } } });
      return updated;
    });
  }

  private async getAssigned(pickupId: string, actor: AuthenticatedUser) {
    if (!actor.permissions.includes('pickup:update')) throw new ForbiddenException('Pickup permission missing');
    const pickup = await this.prisma.pickup.findFirst({ where: { id: pickupId, organizationId: actor.organizationId } });
    if (!pickup) throw new NotFoundException('Pickup not found');
    if (actor.roles.includes('RIDER') && pickup.assignedToId !== actor.id) throw new ForbiddenException('Pickup is not assigned to you');
    return pickup;
  }

  private require(actor: AuthenticatedUser, permission: string) { if (!actor.permissions.includes(permission)) throw new ForbiddenException('Pickup permission missing'); }
}
