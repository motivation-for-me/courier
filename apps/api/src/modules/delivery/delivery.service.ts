import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus, DeliveryOutcome, PaymentStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { allowedRiderStatuses } from '../../common/rider-status';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async scan(cnNumber: string, actor: AuthenticatedUser) {
    const consignment = await this.prisma.consignment.findFirst({ where: { organizationId: actor.organizationId, cnNumber }, select: { id: true, cnNumber: true, status: true, serviceType: true, payments: { select: { method: true, status: true } }, assignments: { where: { status: 'ACTIVE' }, select: { riderId: true } } } });
    if (!consignment) throw new NotFoundException('Shipment not found');
    const assignedToActor = actor.riderId ? consignment.assignments.some((assignment) => assignment.riderId === actor.riderId) : false;
    if (!actor.riderId || !assignedToActor) throw new ForbiddenException('Shipment is not assigned to you');
    await this.prisma.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'dispatch.cn_scanned', entityType: 'consignment', entityId: consignment.id, newValues: { cnNumber: consignment.cnNumber } } });
    return { id: consignment.id, cnNumber: consignment.cnNumber, status: consignment.status, serviceType: consignment.serviceType, assignedToActor, allowedStatuses: allowedRiderStatuses(consignment.status, consignment.payments.some((payment) => payment.method === 'CASH' && payment.status !== 'VERIFIED')) };
  }

  async updateRiderStatus(consignmentId: string, requested: 'OUT_FOR_DELIVERY', actor: AuthenticatedUser, remarks?: string) {
    await this.assertAssigned(consignmentId, actor);
    return this.prisma.$transaction(async (transaction) => {
      const consignment = await transaction.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId }, include: { payments: true } });
      if (!consignment) throw new NotFoundException('Dispatch not found');
      const pendingCod = consignment.payments.some((payment) => payment.method === 'CASH' && payment.status !== PaymentStatus.VERIFIED);
      const allowed = allowedRiderStatuses(consignment.status, pendingCod);
      if (!allowed.includes(requested)) throw new BadRequestException(`Cannot change ${consignment.status} to ${requested}`);
      const now = new Date();
      const changed = await transaction.consignment.updateMany({ where: { id: consignment.id, status: consignment.status }, data: { status: requested, currentStatusAt: now } });
      if (changed.count !== 1) throw new ConflictException('Shipment status changed. Refresh and try again.');
      const updated = await transaction.consignment.findUniqueOrThrow({ where: { id: consignment.id } });
      await transaction.trackingEvent.create({ data: { consignmentId, eventType: requested, riderId: actor.riderId, performedById: actor.id, remarks: remarks ?? 'Updated from rider scan page' } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'delivery.rider_status_updated', entityType: 'consignment', entityId: consignmentId, oldValues: { status: consignment.status }, newValues: { status: requested } } });
      return { id: updated.id, cnNumber: updated.cnNumber, status: updated.status, allowedStatuses: allowedRiderStatuses(updated.status, pendingCod) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async assign(consignmentId: string, riderId: string, actor: AuthenticatedUser, reason?: string) {
    this.require(actor, 'delivery:assign');
    return this.prisma.$transaction(async (transaction) => {
      const [consignment, rider] = await Promise.all([
        transaction.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId } }),
        transaction.rider.findFirst({ where: { id: riderId, organizationId: actor.organizationId, isActive: true }, include: { _count: { select: { assignments: { where: { status: 'ACTIVE', consignment: { deletedAt: null, status: { notIn: [ConsignmentStatus.DELIVERED, ConsignmentStatus.RETURNED, ConsignmentStatus.CANCELLED] } } } } } } } }),
      ]);
      if (!consignment || !rider) throw new NotFoundException('Shipment or active rider not found');
      const assignableStatuses: ConsignmentStatus[] = [ConsignmentStatus.CONFIRMED, ConsignmentStatus.ASSIGNED_TO_RIDER, ConsignmentStatus.DISPATCHED, ConsignmentStatus.OUT_FOR_DELIVERY, ConsignmentStatus.DELIVERY_FAILED, ConsignmentStatus.DELIVERY_ATTEMPT_FAILED];
      if (!assignableStatuses.includes(consignment.status)) throw new BadRequestException('This shipment is not active and cannot be assigned to a rider');
      if (rider.availability === 'OFF_DUTY') throw new BadRequestException('This rider is off duty');
      if (rider._count.assignments >= rider.dailyCapacity) throw new BadRequestException('This rider has reached the daily parcel capacity');
      await transaction.riderAssignment.updateMany({ where: { consignmentId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
      const assignment = await transaction.riderAssignment.create({ data: { consignmentId, riderId, assignedById: actor.id, reason } });
      const nextStatus = consignment.status === ConsignmentStatus.CONFIRMED ? ConsignmentStatus.ASSIGNED_TO_RIDER : consignment.status;
      const changed = await transaction.consignment.updateMany({ where: { id: consignmentId, status: consignment.status }, data: { status: nextStatus, currentStatusAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException('Shipment changed while the rider was being assigned. Reload and try again.');
      await transaction.trackingEvent.create({ data: { consignmentId, eventType: ConsignmentStatus.ASSIGNED_TO_RIDER, riderId, performedById: actor.id, remarks: reason ?? 'Rider assigned for pickup' } });
      if (consignment.status === ConsignmentStatus.CONFIRMED || consignment.status === ConsignmentStatus.ASSIGNED_TO_RIDER) {
        await transaction.pickup.upsert({ where: { consignmentId }, create: { organizationId: actor.organizationId, consignmentId, requestedById: actor.id, assignedToId: rider.userId, assignedAt: new Date(), status: 'ASSIGNED' }, update: { assignedToId: rider.userId, assignedAt: new Date(), status: 'ASSIGNED', failureReason: null } });
      } else {
        await transaction.pickup.updateMany({ where: { consignmentId }, data: { assignedToId: rider.userId, assignedAt: new Date() } });
      }
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'delivery.rider_assigned', entityType: 'consignment', entityId: consignmentId, oldValues: { status: consignment.status }, newValues: { riderId, status: nextStatus } } });
      await transaction.notification.create({ data: { organizationId: actor.organizationId, recipientId: rider.userId, channel: 'IN_APP', template: 'RIDER_ASSIGNED', status: 'UNREAD', payload: { title: 'New parcel assigned', message: `A parcel is ready in your delivery list.`, consignmentId } } });
      return assignment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }

  async complete(consignmentId: string, actor: AuthenticatedUser, collectedAmount?: number, remarks?: string, idempotencyKey?: string) {
    const requestHash = createHash('sha256').update(JSON.stringify({ consignmentId, collectedAmount, remarks })).digest('hex');
    if (idempotencyKey) {
      const prior = await this.prisma.idempotencyRecord.findUnique({ where: { organizationId_actorId_operation_resourceKey: { organizationId: actor.organizationId, actorId: actor.id, operation: 'delivery.complete', resourceKey: idempotencyKey } } });
      if (prior) {
        if (prior.requestHash !== requestHash) throw new BadRequestException('Idempotency key was reused with a different request');
        return prior.response;
      }
    }
    await this.assertAssigned(consignmentId, actor);
    return this.prisma.$transaction(async (transaction) => {
      if (idempotencyKey) {
        const prior = await transaction.idempotencyRecord.findUnique({ where: { organizationId_actorId_operation_resourceKey: { organizationId: actor.organizationId, actorId: actor.id, operation: 'delivery.complete', resourceKey: idempotencyKey } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new BadRequestException('Idempotency key was reused with a different request');
          return prior.response;
        }
      }
      const consignment = await transaction.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId }, include: { payments: true, codTransactions: true, assignments: { where: { status: 'ACTIVE' } } } });
      if (!consignment || consignment.status !== ConsignmentStatus.OUT_FOR_DELIVERY) throw new BadRequestException('Shipment is not out for delivery');
      const payment = consignment.payments[0];
      if (payment?.method === 'CASH') {
        if (collectedAmount === undefined || Number(collectedAmount) !== Number(payment.amount)) throw new BadRequestException('Exact COD amount must be collected');
        if (payment.status === PaymentStatus.VERIFIED) throw new BadRequestException('Payment already collected');
        await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.VERIFIED, collectedById: actor.id, collectedAt: new Date() } });
      }
      const attemptNumber = consignment.assignments.length ? await transaction.deliveryAttempt.count({ where: { consignmentId } }) + 1 : 1;
      await transaction.deliveryAttempt.create({ data: { consignmentId, riderId: actor.riderId, attemptNumber, outcome: DeliveryOutcome.DELIVERED, remarks, createdById: actor.id } });
      const changed = await transaction.consignment.updateMany({ where: { id: consignmentId, status: ConsignmentStatus.OUT_FOR_DELIVERY }, data: { status: ConsignmentStatus.DELIVERED, deliveredAt: new Date(), currentStatusAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException('Shipment was already updated by another request.');
      const updated = await transaction.consignment.findUniqueOrThrow({ where: { id: consignmentId } });
      await transaction.riderAssignment.updateMany({ where: { consignmentId, riderId: actor.riderId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
      await transaction.trackingEvent.create({ data: { consignmentId, eventType: ConsignmentStatus.DELIVERED, riderId: actor.riderId, performedById: actor.id, remarks } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'delivery.completed', entityType: 'consignment', entityId: consignmentId, newValues: { status: ConsignmentStatus.DELIVERED } } });
      if (actor.riderId && !actor.roles.includes('ADMIN')) {
        const [rider, organization] = await Promise.all([
          transaction.rider.findUniqueOrThrow({ where: { id: actor.riderId }, select: { deliveryFee: true } }),
          transaction.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { currencyCode: true } }),
        ]);
        await transaction.riderEarning.upsert({ where: { consignmentId }, create: { organizationId: actor.organizationId, riderId: actor.riderId, consignmentId, amount: rider.deliveryFee, currencyCode: organization.currencyCode }, update: {} });
      }
      await transaction.notification.create({ data: { organizationId: actor.organizationId, recipientId: actor.id, channel: 'IN_APP', template: 'DELIVERY_COMPLETED', status: 'UNREAD', payload: { title: 'Delivery completed', message: `${updated.cnNumber} was marked delivered.`, consignmentId } } });
      if (idempotencyKey) await transaction.idempotencyRecord.create({ data: { organizationId: actor.organizationId, actorId: actor.id, operation: 'delivery.complete', resourceKey: idempotencyKey, requestHash, response: updated } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async failed(consignmentId: string, actor: AuthenticatedUser, reason: string, remarks?: string) {
    await this.assertAssigned(consignmentId, actor);
    return this.prisma.$transaction(async (transaction) => {
      const consignment = await transaction.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId, status: ConsignmentStatus.OUT_FOR_DELIVERY } });
      if (!consignment) throw new BadRequestException('Shipment is not out for delivery');
      const attemptNumber = await transaction.deliveryAttempt.count({ where: { consignmentId } }) + 1;
      const attempt = await transaction.deliveryAttempt.create({ data: { consignmentId, riderId: actor.riderId, attemptNumber, reason, remarks, outcome: DeliveryOutcome.FAILED, createdById: actor.id } });
      const changed = await transaction.consignment.updateMany({ where: { id: consignmentId, status: ConsignmentStatus.OUT_FOR_DELIVERY }, data: { status: ConsignmentStatus.DELIVERY_ATTEMPT_FAILED, currentStatusAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException('Shipment was already updated by another request.');
      await transaction.trackingEvent.create({ data: { consignmentId, eventType: ConsignmentStatus.DELIVERY_ATTEMPT_FAILED, riderId: actor.riderId, performedById: actor.id, remarks: reason } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'delivery.attempt_failed', entityType: 'consignment', entityId: consignmentId, newValues: { reason } } });
      return attempt;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async assertAssigned(consignmentId: string, actor: AuthenticatedUser) {
    if (!actor.riderId) throw new ForbiddenException('Rider identity required');
    const assignment = await this.prisma.riderAssignment.findFirst({ where: { consignmentId, riderId: actor.riderId, status: 'ACTIVE', consignment: { organizationId: actor.organizationId } } });
    if (!assignment) throw new ForbiddenException('Shipment is not assigned to you');
  }

  private require(actor: AuthenticatedUser, permission: string) { if (!actor.permissions.includes(permission)) throw new ForbiddenException('Permission missing'); }
}
