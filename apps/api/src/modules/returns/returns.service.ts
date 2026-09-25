import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus, ReturnStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(consignmentId: string, reason: string, actor: AuthenticatedUser) {
    if (!actor.permissions.includes('return:create')) throw new ForbiddenException('Return permission missing');
    return this.prisma.$transaction(async (transaction) => {
      const shipment = await transaction.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId }, include: { attempts: true } });
      if (!shipment) throw new NotFoundException('Consignment not found');
      if (shipment.status !== ConsignmentStatus.DELIVERY_ATTEMPT_FAILED && shipment.status !== ConsignmentStatus.HELD) throw new BadRequestException('Shipment is not eligible for RTO');
      const returnNumber = `RTO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const record = await transaction.returnRecord.create({ data: { consignmentId, returnNumber, reason, status: ReturnStatus.REQUESTED, attempts: { create: shipment.attempts.map((attempt) => ({ reason: attempt.reason, outcome: attempt.outcome, createdById: actor.id })) }, events: { create: { eventType: ReturnStatus.REQUESTED, remarks: reason } } } });
      await transaction.consignment.update({ where: { id: consignmentId }, data: { status: ConsignmentStatus.RETURNED, currentStatusAt: new Date() } });
      await transaction.trackingEvent.create({ data: { consignmentId, eventType: ConsignmentStatus.RETURNED, performedById: actor.id, remarks: `RTO ${returnNumber}: ${reason}` } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'return.created', entityType: 'consignment', entityId: consignmentId, newValues: { returnNumber, reason } } });
      return record;
    });
  }
}
