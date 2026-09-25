import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { CreateConsignmentDto } from './dto/create-consignment.dto';

const transitions: Record<string, { from: ConsignmentStatus[]; to: ConsignmentStatus; permission: string }> = {
  verify: { from: [ConsignmentStatus.BOOKED], to: ConsignmentStatus.VERIFIED, permission: 'shipment:verify' },
  cancel: { from: [ConsignmentStatus.BOOKED, ConsignmentStatus.VERIFIED], to: ConsignmentStatus.CANCELLED, permission: 'shipment:cancel' },
  outForDelivery: { from: [ConsignmentStatus.ASSIGNED_TO_RIDER], to: ConsignmentStatus.OUT_FOR_DELIVERY, permission: 'delivery:update' },
};

@Injectable()
export class ConsignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateConsignmentDto, actor: AuthenticatedUser, idempotencyKey?: string) {
    if (!actor.permissions.includes('shipment:create')) throw new ForbiddenException('Booking permission missing');
    const parties = this.requireKinds(input.parties, ['SENDER', 'RECEIVER']);
    const addresses = this.requireKinds(input.addresses, ['ORIGIN', 'DESTINATION']);
    if (!input.packages.length) throw new BadRequestException('At least one package is required');

    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.prisma.$transaction(async (transaction) => {
      if (idempotencyKey) {
        const prior = await transaction.idempotencyRecord.findUnique({ where: { organizationId_actorId_operation_resourceKey: { organizationId: actor.organizationId, actorId: actor.id, operation: 'booking.create', resourceKey: idempotencyKey } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new BadRequestException('Idempotency key was reused with a different request');
          return prior.response;
        }
      }
      const cnNumber = await this.generateCn(actor.organizationId);
      const consignment = await transaction.consignment.create({
        data: {
          organizationId: actor.organizationId,
          cnNumber,
          bookedById: actor.id,
          serviceType: input.serviceType,
          parties: { create: parties },
          addresses: { create: addresses },
          packages: { create: input.packages },
          payments: input.codAmount !== undefined ? { create: { amount: input.codAmount, currencyCode: 'AED', method: 'CASH', status: 'PENDING' } } : undefined,
          codTransactions: input.codAmount !== undefined ? { create: { expectedAmount: input.codAmount } } : undefined,
        },
        include: { parties: true, addresses: true, packages: true, payments: true, codTransactions: true },
      });
      await transaction.trackingEvent.create({ data: { consignmentId: consignment.id, eventType: ConsignmentStatus.BOOKED, performedById: actor.id, remarks: 'Consignment booked' } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'consignment.booked', entityType: 'consignment', entityId: consignment.id, newValues: { cnNumber, status: ConsignmentStatus.BOOKED } } });
      if (idempotencyKey) await transaction.idempotencyRecord.create({ data: { organizationId: actor.organizationId, actorId: actor.id, operation: 'booking.create', resourceKey: idempotencyKey, requestHash, response: consignment } });
      return consignment;
    });
  }

  async list(actor: AuthenticatedUser, search?: string) {
    if (!actor.permissions.includes('shipment:view')) throw new ForbiddenException('Shipment view permission missing');
    return this.prisma.consignment.findMany({
      where: { organizationId: actor.organizationId, ...(search ? { OR: [{ cnNumber: { contains: search, mode: 'insensitive' } }, { parties: { some: { name: { contains: search, mode: 'insensitive' } } } }] } : {}), ...(actor.branchId ? { OR: [{ originBranchId: actor.branchId }, { originBranchId: null }] } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, cnNumber: true, status: true, serviceType: true, currentStatusAt: true, createdAt: true, parties: true, addresses: true, packages: true, payments: true },
    });
  }

  async get(id: string, actor: AuthenticatedUser) {
    const consignment = await this.prisma.consignment.findFirst({ where: { id, organizationId: actor.organizationId }, include: { parties: true, addresses: true, packages: true, payments: true, events: { orderBy: { eventTime: 'asc' } }, attempts: { orderBy: { attemptNumber: 'asc' } }, assignments: { where: { status: 'ACTIVE' }, include: { rider: true } }, documents: true } });
    if (!consignment) throw new NotFoundException('Consignment not found');
    if (!actor.permissions.includes('shipment:view') && consignment.bookedById !== actor.id) throw new ForbiddenException('Shipment access denied');
    return consignment;
  }

  async transition(id: string, operation: keyof typeof transitions, actor: AuthenticatedUser, remarks?: string) {
    const rule = transitions[operation];
    if (!rule || !actor.permissions.includes(rule.permission)) throw new ForbiddenException('Operation permission missing');
    return this.prisma.$transaction(async (transaction) => {
      const consignment = await transaction.consignment.findFirst({ where: { id, organizationId: actor.organizationId } });
      if (!consignment) throw new NotFoundException('Consignment not found');
      if (!rule.from.includes(consignment.status)) throw new BadRequestException(`Cannot ${operation} from ${consignment.status}`);
      const updated = await transaction.consignment.update({ where: { id }, data: { status: rule.to, currentStatusAt: new Date(), ...(rule.to === ConsignmentStatus.CANCELLED ? {} : {}) } });
      await transaction.trackingEvent.create({ data: { consignmentId: id, eventType: rule.to, performedById: actor.id, remarks } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: `consignment.${operation}`, entityType: 'consignment', entityId: id, oldValues: { status: consignment.status }, newValues: { status: rule.to }, } });
      return updated;
    });
  }

  private async generateCn(organizationId: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `CN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
      const exists = await this.prisma.consignment.findFirst({ where: { organizationId, cnNumber: candidate }, select: { id: true } });
      if (!exists) return candidate;
    }
    throw new BadRequestException('Could not allocate a unique consignment number');
  }

  private requireKinds<T extends { kind: string }>(records: T[], required: string[]) {
    for (const kind of required) if (!records.some((record) => record.kind === kind)) throw new BadRequestException(`${kind} record is required`);
    return records.map((record) => ({ ...record }));
  }
}
