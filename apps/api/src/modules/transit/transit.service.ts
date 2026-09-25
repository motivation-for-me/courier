import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';

@Injectable()
export class TransitService {
  constructor(private readonly prisma: PrismaService) {}

  async move(consignmentId: string, input: { hubId?: string; locationId?: string; remarks?: string }, actor: AuthenticatedUser, idempotencyKey?: string) {
    if (!actor.permissions.includes('transit:update')) throw new ForbiddenException('Transit permission missing');
    if (!input.hubId && !input.locationId) throw new BadRequestException('hubId or locationId is required');
    return this.prisma.$transaction(async (tx) => {
      const consignment = await tx.consignment.findFirst({ where: { id: consignmentId, organizationId: actor.organizationId } });
      if (!consignment) throw new NotFoundException('Consignment not found');
      if (consignment.status === ConsignmentStatus.DELIVERED || consignment.status === ConsignmentStatus.CANCELLED || consignment.status === ConsignmentStatus.RETURNED) throw new BadRequestException('Terminal consignments cannot move in transit');
      if (idempotencyKey) {
        const prior = await tx.trackingEvent.findFirst({ where: { consignmentId, idempotencyKey } });
        if (prior) return prior;
      }
      if (input.hubId) {
        const hub = await tx.hub.findFirst({ where: { id: input.hubId, organizationId: actor.organizationId } });
        if (!hub) throw new NotFoundException('Hub not found');
      }
      if (input.locationId) {
        const location = await tx.location.findFirst({ where: { id: input.locationId, organizationId: actor.organizationId } });
        if (!location) throw new NotFoundException('Location not found');
      }
      const updated = await tx.consignment.update({ where: { id: consignmentId }, data: { currentHubId: input.hubId ?? consignment.currentHubId, currentLocationId: input.locationId ?? consignment.currentLocationId, status: ConsignmentStatus.IN_TRANSIT, currentStatusAt: new Date() } });
      const event = await tx.trackingEvent.create({ data: { consignmentId, eventType: ConsignmentStatus.IN_TRANSIT, hubId: input.hubId, locationId: input.locationId, performedById: actor.id, remarks: input.remarks, idempotencyKey } });
      await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'transit.moved', entityType: 'consignment', entityId: consignmentId, oldValues: { status: consignment.status, hubId: consignment.currentHubId, locationId: consignment.currentLocationId }, newValues: { status: updated.status, hubId: updated.currentHubId, locationId: updated.currentLocationId, idempotencyKey } } });
      return event;
    });
  }
}
