import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { createPublicTrackingToken } from '../../common/public-tracking-token';
import { CreateConsignmentDto } from './dto/create-consignment.dto';

const transitions: Record<string, { from: ConsignmentStatus[]; to: ConsignmentStatus; permission: string }> = {
  confirm: { from: [ConsignmentStatus.DRAFT], to: ConsignmentStatus.CONFIRMED, permission: 'shipment:verify' },
  verify: { from: [ConsignmentStatus.BOOKED], to: ConsignmentStatus.VERIFIED, permission: 'shipment:verify' },
  cancel: { from: [ConsignmentStatus.DRAFT, ConsignmentStatus.CONFIRMED, ConsignmentStatus.BOOKED, ConsignmentStatus.VERIFIED], to: ConsignmentStatus.CANCELLED, permission: 'shipment:cancel' },
  outForDelivery: { from: [ConsignmentStatus.DISPATCHED, ConsignmentStatus.ASSIGNED_TO_RIDER], to: ConsignmentStatus.OUT_FOR_DELIVERY, permission: 'delivery:update' },
};

@Injectable()
export class ConsignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateConsignmentDto, actor: AuthenticatedUser, idempotencyKey?: string) {
    if (!actor.permissions.includes('shipment:create')) throw new ForbiddenException('Booking permission missing');
    if (actor.roles.includes('SHOP_MANAGER') && !actor.customerId) throw new ForbiddenException('Shop account is not linked to a shop');
    const parties = this.requireKinds(input.parties, ['SENDER', 'RECEIVER']);
    const addresses = this.requireKinds(input.addresses, ['ORIGIN', 'DESTINATION']);
    if (!input.items?.length) throw new BadRequestException('At least one parcel content item is required');

    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.prisma.$transaction(async (transaction) => {
      let resolvedCustomerId = actor.roles.includes('SHOP_MANAGER') ? actor.customerId : input.customerId;
      if (actor.roles.includes('SHOP_MANAGER') && input.customerId && input.customerId !== actor.customerId) throw new ForbiddenException('You can create shipments only for your own shop');
      if (input.customerId) {
        const customer = await transaction.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId }, select: { id: true } });
        if (!customer) throw new BadRequestException('Customer is not available in your company');
      }
      if (idempotencyKey) {
        const prior = await transaction.idempotencyRecord.findUnique({ where: { organizationId_actorId_operation_resourceKey: { organizationId: actor.organizationId, actorId: actor.id, operation: 'booking.create', resourceKey: idempotencyKey } } });
        if (prior) {
          if (prior.requestHash !== requestHash) throw new BadRequestException('Idempotency key was reused with a different request');
          return prior.response;
        }
      }
      const organization = await transaction.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { currencyCode: true } });
      const pricing = resolvedCustomerId ? await transaction.shopPricingAgreement.findFirst({ where: { customerId: resolvedCustomerId, organizationId: actor.organizationId, effectiveFrom: { lte: new Date() }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }, orderBy: { effectiveFrom: 'desc' } }) : null;
      const cnNumber = await this.generateCn(transaction, actor.organizationId);
      const consignment = await transaction.consignment.create({
        data: {
          organizationId: actor.organizationId,
          cnNumber,
          bookedById: actor.id,
          serviceType: input.serviceType,
          customerId: resolvedCustomerId,
          parties: { create: parties },
          addresses: { create: addresses },
          packages: input.packages?.length ? { create: input.packages } : undefined,
          items: input.items?.length ? { create: input.items } : undefined,
          payments: input.codAmount !== undefined ? { create: { amount: input.codAmount, currencyCode: pricing?.currencyCode ?? organization.currencyCode, method: 'CASH', status: 'PENDING' } } : undefined,
          codTransactions: input.codAmount !== undefined ? { create: { expectedAmount: input.codAmount } } : undefined,
        },
        include: { parties: true, addresses: true, packages: true, items: true, payments: true, codTransactions: true },
      });
      if (pricing && resolvedCustomerId) {
        const codFee = new Prisma.Decimal(pricing.codFeeFixed).plus(new Prisma.Decimal(input.codAmount ?? 0).mul(pricing.codFeePercent).div(100));
        const entries: Prisma.ShipmentFinancialEntryCreateManyInput[] = [];
        const shipmentCharge = input.deliveryFee === undefined ? pricing.shipmentCharge : input.deliveryFee;
        if (!new Prisma.Decimal(shipmentCharge).isZero()) entries.push({ organizationId: actor.organizationId, customerId: resolvedCustomerId, consignmentId: consignment.id, category: 'REVENUE', type: 'SHIPPING_CHARGE', amount: shipmentCharge, currencyCode: pricing.currencyCode, deductFromShop: pricing.deductChargesFromCod, pricingAgreementId: pricing.id, reason: input.deliveryFee === undefined ? 'Shop pricing agreement snapshot' : 'Shipment delivery fee override', createdById: actor.id });
        if (!codFee.isZero()) entries.push({ organizationId: actor.organizationId, customerId: resolvedCustomerId, consignmentId: consignment.id, category: 'REVENUE', type: 'COD_FEE', amount: codFee, currencyCode: pricing.currencyCode, deductFromShop: pricing.deductChargesFromCod, pricingAgreementId: pricing.id, reason: 'Shop pricing agreement snapshot', createdById: actor.id });
        if (entries.length) await transaction.shipmentFinancialEntry.createMany({ data: entries });
      }
      await transaction.trackingEvent.create({ data: { consignmentId: consignment.id, eventType: ConsignmentStatus.DRAFT, performedById: actor.id, remarks: 'Dispatch created' } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'dispatch.created', entityType: 'consignment', entityId: consignment.id, newValues: { cnNumber, status: ConsignmentStatus.DRAFT } } });
      if (idempotencyKey) await transaction.idempotencyRecord.create({ data: { organizationId: actor.organizationId, actorId: actor.id, operation: 'booking.create', resourceKey: idempotencyKey, requestHash, response: consignment } });
      return consignment;
    });
  }

  async list(actor: AuthenticatedUser, filters: { search?: string; status?: string; from?: string; to?: string; customerId?: string; riderId?: string } = {}) {
    if (!actor.permissions.includes('shipment:view')) throw new ForbiddenException('Shipment view permission missing');
    const status = filters.status && filters.status !== 'ALL' ? filters.status as ConsignmentStatus : undefined;
    if (status && !Object.values(ConsignmentStatus).includes(status)) throw new BadRequestException('Invalid shipment status filter');
    const from = filters.from ? new Date(filters.from) : undefined;
    const to = filters.to ? new Date(filters.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) throw new BadRequestException('Invalid shipment history date range');
    const consignments = await this.prisma.consignment.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null, ...(actor.roles.includes('SHOP_MANAGER') ? { customerId: actor.customerId } : filters.customerId ? { customerId: filters.customerId } : {}), ...(status ? { status } : {}), ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}), ...(filters.riderId ? { assignments: { some: { riderId: filters.riderId } } } : {}), ...(filters.search ? { OR: [{ cnNumber: { contains: filters.search, mode: 'insensitive' } }, { customer: { name: { contains: filters.search, mode: 'insensitive' } } }, { parties: { some: { OR: [{ name: { contains: filters.search, mode: 'insensitive' } }, { phone: { contains: filters.search } }] } } }] } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, cnNumber: true, status: true, serviceType: true, currentStatusAt: true, createdAt: true, customer: { select: { id: true, name: true } }, parties: { select: { kind: true, name: true, phone: true } }, items: { select: { id: true, description: true, quantity: true, unit: true } }, assignments: { where: { status: 'ACTIVE' }, select: { riderId: true, rider: { select: { employeeCode: true, user: { select: { displayName: true, phone: true } } } } } } },
    });
    return consignments.map((consignment) => ({ ...consignment, publicTrackingKey: createPublicTrackingToken(consignment.id) }));
  }

  async get(id: string, actor: AuthenticatedUser) {
    const consignment = await this.prisma.consignment.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null, ...(actor.roles.includes('SHOP_MANAGER') ? { customerId: actor.customerId } : {}) }, include: { customer: true, project: true, parties: true, addresses: true, items: true, packages: true, payments: true, events: { orderBy: { eventTime: 'asc' } }, attempts: { orderBy: { attemptNumber: 'asc' } }, assignments: { where: { status: 'ACTIVE' }, include: { rider: { include: { user: { select: { displayName: true, phone: true } } } } } }, documents: true } });
    if (!consignment) throw new NotFoundException('Consignment not found');
    if (!actor.permissions.includes('shipment:view') && consignment.bookedById !== actor.id) throw new ForbiddenException('Shipment access denied');
    return consignment;
  }

  async transition(id: string, operation: keyof typeof transitions, actor: AuthenticatedUser, remarks?: string) {
    const rule = transitions[operation];
    if (!rule || !actor.permissions.includes(rule.permission)) throw new ForbiddenException('Operation permission missing');
    return this.prisma.$transaction(async (transaction) => {
      const consignment = await transaction.consignment.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null } });
      if (!consignment) throw new NotFoundException('Consignment not found');
      if (!rule.from.includes(consignment.status)) throw new BadRequestException(`Cannot ${operation} from ${consignment.status}`);
      const changed = await transaction.consignment.updateMany({ where: { id, status: consignment.status, deletedAt: null }, data: { status: rule.to, currentStatusAt: new Date() } });
      if (changed.count !== 1) throw new ConflictException('Shipment changed while this action was running. Reload and try again.');
      const updated = await transaction.consignment.findUniqueOrThrow({ where: { id } });
      await transaction.trackingEvent.create({ data: { consignmentId: id, eventType: rule.to, performedById: actor.id, remarks } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: `consignment.${operation}`, entityType: 'consignment', entityId: id, oldValues: { status: consignment.status }, newValues: { status: rule.to }, } });
      return updated;
    });
  }

  private async generateCn(transaction: Prisma.TransactionClient, organizationId: string) {
    const year = new Date().getUTCFullYear();
    const [organization, sequence] = await Promise.all([
      transaction.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { code: true } }),
      transaction.dispatchSequence.upsert({
        where: { organizationId_year: { organizationId, year } },
        create: { organizationId, year, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
        select: { nextNumber: true },
      }),
    ]);
    const allocatedNumber = sequence.nextNumber - 1;
    return `CN-${organization.code}-${year}-${allocatedNumber.toString().padStart(6, '0')}`;
  }

  async adminStatus(id: string, requested: 'CONFIRMED' | 'DISPATCHED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED', actor: AuthenticatedUser, remarks?: string) {
    if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator access required');
    const nextByCurrent: Partial<Record<ConsignmentStatus, ConsignmentStatus[]>> = {
      [ConsignmentStatus.DRAFT]: [ConsignmentStatus.CONFIRMED],
      [ConsignmentStatus.DISPATCHED]: [ConsignmentStatus.OUT_FOR_DELIVERY],
      [ConsignmentStatus.OUT_FOR_DELIVERY]: [ConsignmentStatus.DELIVERED, ConsignmentStatus.DELIVERY_FAILED],
      [ConsignmentStatus.DELIVERY_FAILED]: [ConsignmentStatus.OUT_FOR_DELIVERY],
      [ConsignmentStatus.DELIVERY_ATTEMPT_FAILED]: [ConsignmentStatus.OUT_FOR_DELIVERY],
    };
    return this.prisma.$transaction(async (transaction) => {
      const consignment = await transaction.consignment.findFirst({ where: { id, organizationId: actor.organizationId }, include: { payments: true } });
      if (!consignment) throw new NotFoundException('Dispatch not found');
      if (!(nextByCurrent[consignment.status] ?? []).includes(requested)) throw new BadRequestException(`Cannot change ${consignment.status} to ${requested}`);
      if (requested === ConsignmentStatus.DISPATCHED) {
        const assignment = await transaction.riderAssignment.findFirst({ where: { consignmentId: id, status: 'ACTIVE' }, select: { id: true } });
        if (!assignment) throw new BadRequestException('Assign a rider before selecting DISPATCHED');
      }
      if (requested === ConsignmentStatus.DELIVERED && consignment.payments.some((payment) => payment.method === 'CASH' && payment.status !== 'VERIFIED')) throw new BadRequestException('Record COD payment before marking delivered');
      const now = new Date();
      const changed = await transaction.consignment.updateMany({ where: { id, status: consignment.status }, data: { status: requested, currentStatusAt: now, deliveredAt: requested === ConsignmentStatus.DELIVERED ? now : undefined } });
      if (changed.count !== 1) throw new ConflictException('Shipment changed while this action was running. Reload and try again.');
      const updated = await transaction.consignment.findUniqueOrThrow({ where: { id } });
      await transaction.trackingEvent.create({ data: { consignmentId: id, eventType: requested, performedById: actor.id, remarks: remarks ?? 'Status updated by administrator' } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'dispatch.admin_status_updated', entityType: 'consignment', entityId: id, oldValues: { status: consignment.status }, newValues: { status: requested } } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async correctStatus(id: string, requested: ConsignmentStatus, reason: string, actor: AuthenticatedUser) {
    if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator access required');
    return this.prisma.$transaction(async (transaction) => {
      const consignment = await transaction.consignment.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null }, select: { id: true, status: true, payments: { select: { method: true, status: true } } } });
      if (!consignment) throw new NotFoundException('Shipment not found');
      if (requested === ConsignmentStatus.DELIVERED && consignment.payments.some((payment) => payment.method === 'CASH' && payment.status !== 'VERIFIED')) throw new BadRequestException('COD must be collected and verified before correcting this shipment to delivered');
      const changed = await transaction.consignment.updateMany({ where: { id, status: consignment.status, deletedAt: null }, data: { status: requested, currentStatusAt: new Date(), deliveredAt: requested === ConsignmentStatus.DELIVERED ? new Date() : null } });
      if (changed.count !== 1) throw new ConflictException('Shipment changed while you were editing it. Reload and try again.');
      const updated = await transaction.consignment.findUniqueOrThrow({ where: { id } });
      if (requested === ConsignmentStatus.DELIVERED || requested === ConsignmentStatus.RETURNED || requested === ConsignmentStatus.CANCELLED) {
        await transaction.riderAssignment.updateMany({ where: { consignmentId: id, status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
      }
      await transaction.trackingEvent.create({ data: { consignmentId: id, eventType: requested, performedById: actor.id, remarks: `Administrative correction: ${reason}` } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'dispatch.status_corrected', entityType: 'consignment', entityId: id, oldValues: { status: consignment.status }, newValues: { status: requested, reason } } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Only an administrator can delete shipments');
    const shipment = await this.prisma.consignment.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null }, select: { id: true, status: true } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    await this.prisma.$transaction([this.prisma.consignment.update({ where: { id }, data: { deletedAt: new Date() } }), this.prisma.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'dispatch.deleted', entityType: 'consignment', entityId: id, oldValues: { status: shipment.status } } })]);
    return { success: true };
  }

  private requireKinds<T extends { kind: string }>(records: T[], required: string[]) {
    for (const kind of required) if (!records.some((record) => record.kind === kind)) throw new BadRequestException(`${kind} record is required`);
    return records.map((record) => ({ ...record }));
  }
}
