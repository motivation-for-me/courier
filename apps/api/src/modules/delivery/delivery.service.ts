import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus, DeliveryOutcome, PaymentStatus } from '@prisma/client';
import { createHash, randomInt } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async scan(cnNumber: string, actor: AuthenticatedUser) {
    const consignment = await this.prisma.consignment.findFirst({ where: { organizationId: actor.organizationId, cnNumber }, select: { id: true, cnNumber: true, status: true, serviceType: true, currentHubId: true, assignments: { where: { status: 'ACTIVE' }, select: { riderId: true } } } });
    if (!consignment) throw new NotFoundException('Shipment not found');
    const assignedToActor = actor.riderId ? consignment.assignments.some((assignment) => assignment.riderId === actor.riderId) : false;
    if (actor.roles.includes('RIDER') && !assignedToActor) throw new ForbiddenException('Shipment is not assigned to you');
    return { id: consignment.id, cnNumber: consignment.cnNumber, status: consignment.status, serviceType: consignment.serviceType, assignedToActor };
  }

  async assign(consignmentId: string, riderId: string, actor: AuthenticatedUser, reason?: string) {
    this.require(actor, 'delivery:assign');
    return this.prisma.$transaction(async (transaction) => {
      const [consignment, rider] = await Promise.all([
        transaction.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId } }),
        transaction.rider.findFirst({ where: { id: riderId, organizationId: actor.organizationId, isActive: true } }),
      ]);
      if (!consignment || !rider) throw new NotFoundException('Shipment or active rider not found');
      if (consignment.status !== ConsignmentStatus.RECEIVED) throw new BadRequestException('Only received shipments can be assigned');
      await transaction.riderAssignment.updateMany({ where: { consignmentId, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
      const assignment = await transaction.riderAssignment.create({ data: { consignmentId, riderId, branchId: rider.branchId, assignedById: actor.id, reason } });
      await transaction.consignment.update({ where: { id: consignmentId }, data: { status: ConsignmentStatus.ASSIGNED_TO_RIDER, currentStatusAt: new Date() } });
      await transaction.trackingEvent.create({ data: { consignmentId, eventType: ConsignmentStatus.ASSIGNED_TO_RIDER, riderId, performedById: actor.id, remarks: reason } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'delivery.rider_assigned', entityType: 'consignment', entityId: consignmentId, newValues: { riderId } } });
      return assignment;
    });
  }

  async createOtp(consignmentId: string, actor: AuthenticatedUser, purpose: string) {
    await this.assertAssigned(consignmentId, actor);
    const code = randomInt(100000, 1000000).toString();
    const challenge = await this.prisma.otpChallenge.create({ data: { consignmentId, createdById: actor.id, purpose, codeHash: this.hash(code), expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
    return { challengeId: challenge.id, expiresAt: challenge.expiresAt, delivery: 'notification-provider-pending', developmentCode: process.env.NODE_ENV === 'test' ? code : undefined };
  }

  async verifyOtp(consignmentId: string, actor: AuthenticatedUser, code: string) {
    await this.assertAssigned(consignmentId, actor);
    const challenge = await this.prisma.otpChallenge.findFirst({ where: { consignmentId, purpose: 'DELIVERY', verifiedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!challenge) throw new BadRequestException('No active delivery OTP');
    if (challenge.expiresAt < new Date()) throw new BadRequestException('OTP expired');
    if (challenge.attempts >= challenge.maxAttempts) throw new HttpException('OTP attempt limit reached', HttpStatus.TOO_MANY_REQUESTS);
    if (challenge.codeHash !== this.hash(code)) {
      await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Invalid OTP');
    }
    await this.prisma.$transaction([
      this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date() } }),
      this.prisma.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'delivery.otp_verified', entityType: 'consignment', entityId: consignmentId } }),
    ]);
    return { verified: true };
  }

  async complete(consignmentId: string, actor: AuthenticatedUser, otp: string, collectedAmount?: number, remarks?: string, idempotencyKey?: string) {
    await this.assertAssigned(consignmentId, actor);
    return this.prisma.$transaction(async (transaction) => {
      const requestHash = createHash('sha256').update(JSON.stringify({ consignmentId, otp, collectedAmount, remarks })).digest('hex');
      if (idempotencyKey) {
        const prior = await transaction.idempotencyRecord.findUnique({ where: { organizationId_actorId_operation_resourceKey: { organizationId: actor.organizationId, actorId: actor.id, operation: 'delivery.complete', resourceKey: idempotencyKey } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new BadRequestException('Idempotency key was reused with a different request');
          return prior.response;
        }
      }
      const consignment = await transaction.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId }, include: { payments: true, codTransactions: true, assignments: { where: { status: 'ACTIVE' } } } });
      if (!consignment || consignment.status !== ConsignmentStatus.OUT_FOR_DELIVERY) throw new BadRequestException('Shipment is not out for delivery');
      const otpChallenge = await transaction.otpChallenge.findFirst({ where: { consignmentId, purpose: 'DELIVERY', verifiedAt: { not: null } }, orderBy: { verifiedAt: 'desc' } });
      if (!otpChallenge || otpChallenge.expiresAt < new Date()) throw new ForbiddenException('Delivery OTP verification required');
      const payment = consignment.payments[0];
      if (payment?.method === 'CASH') {
        if (collectedAmount === undefined || Number(collectedAmount) !== Number(payment.amount)) throw new BadRequestException('Exact COD amount must be collected');
        if (payment.status === PaymentStatus.VERIFIED) throw new BadRequestException('Payment already collected');
        await transaction.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.VERIFIED, collectedById: actor.id, collectedAt: new Date() } });
      }
      const attemptNumber = consignment.assignments.length ? await transaction.deliveryAttempt.count({ where: { consignmentId } }) + 1 : 1;
      await transaction.deliveryAttempt.create({ data: { consignmentId, riderId: actor.riderId, attemptNumber, outcome: DeliveryOutcome.DELIVERED, remarks, createdById: actor.id } });
      const updated = await transaction.consignment.update({ where: { id: consignmentId }, data: { status: ConsignmentStatus.DELIVERED, deliveredAt: new Date(), currentStatusAt: new Date() } });
      await transaction.trackingEvent.create({ data: { consignmentId, eventType: ConsignmentStatus.DELIVERED, riderId: actor.riderId, performedById: actor.id, remarks } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'delivery.completed', entityType: 'consignment', entityId: consignmentId, newValues: { status: ConsignmentStatus.DELIVERED } } });
      if (idempotencyKey) await transaction.idempotencyRecord.create({ data: { organizationId: actor.organizationId, actorId: actor.id, operation: 'delivery.complete', resourceKey: idempotencyKey, requestHash, response: updated } });
      return updated;
    });
  }

  async failed(consignmentId: string, actor: AuthenticatedUser, reason: string, remarks?: string) {
    await this.assertAssigned(consignmentId, actor);
    return this.prisma.$transaction(async (transaction) => {
      const consignment = await transaction.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId, status: ConsignmentStatus.OUT_FOR_DELIVERY } });
      if (!consignment) throw new BadRequestException('Shipment is not out for delivery');
      const attemptNumber = await transaction.deliveryAttempt.count({ where: { consignmentId } }) + 1;
      const attempt = await transaction.deliveryAttempt.create({ data: { consignmentId, riderId: actor.riderId, attemptNumber, reason, remarks, outcome: DeliveryOutcome.FAILED, createdById: actor.id } });
      await transaction.consignment.update({ where: { id: consignmentId }, data: { status: ConsignmentStatus.DELIVERY_ATTEMPT_FAILED, currentStatusAt: new Date() } });
      await transaction.trackingEvent.create({ data: { consignmentId, eventType: ConsignmentStatus.DELIVERY_ATTEMPT_FAILED, riderId: actor.riderId, performedById: actor.id, remarks: reason } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'delivery.attempt_failed', entityType: 'consignment', entityId: consignmentId, newValues: { reason } } });
      return attempt;
    });
  }

  private async assertAssigned(consignmentId: string, actor: AuthenticatedUser) {
    if (!actor.riderId) throw new ForbiddenException('Rider identity required');
    const assignment = await this.prisma.riderAssignment.findFirst({ where: { consignmentId, riderId: actor.riderId, status: 'ACTIVE' } });
    if (!assignment) throw new ForbiddenException('Shipment is not assigned to you');
  }

  private require(actor: AuthenticatedUser, permission: string) { if (!actor.permissions.includes(permission)) throw new ForbiddenException('Permission missing'); }
  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
