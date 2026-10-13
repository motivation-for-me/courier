import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';
import { RiderMoneyDto, RiderPayDto, RiderReceiptDto } from './rider-payments.dto';

const options = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 };
@Injectable()
export class RiderPaymentsService {
  constructor(private readonly prisma: PrismaService) {}
  private admin(actor: AuthenticatedUser) { if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator required'); }
  private async rider(actor: AuthenticatedUser, id: string) {
    if (!actor.roles.includes('ADMIN') && (!actor.roles.includes('RIDER') || actor.riderId !== id)) throw new ForbiddenException('Own payments only');
    const rider = await this.prisma.rider.findFirst({ where: { id, organizationId: actor.organizationId }, select: { id: true, userId: true, employeeCode: true, deliveryFee: true, isActive: true, user: { select: { displayName: true, email: true } }, organization: { select: { currencyCode: true } } } });
    if (!rider) throw new NotFoundException('Rider not found');
    return rider;
  }
  async directory(actor: AuthenticatedUser) {
    this.admin(actor);
    const [riders, totals] = await Promise.all([
      this.prisma.rider.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, employeeCode: true, isActive: true, deliveryFee: true, user: { select: { displayName: true, email: true } } }, orderBy: { employeeCode: 'asc' } }),
      this.prisma.riderEarning.groupBy({ by: ['riderId', 'status', 'currencyCode', 'kind'], where: { organizationId: actor.organizationId }, _count: { _all: true }, _sum: { amount: true } }),
    ]);
    return riders.map((rider) => ({ ...rider, totals: totals.filter((total) => total.riderId === rider.id) }));
  }
  async detail(actor: AuthenticatedUser, id: string, pageInput = '1', status?: string) {
    const rider = await this.rider(actor, id);
    const page = Number(pageInput);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new BadRequestException('Invalid page');
    if (status && !['PENDING', 'SENT', 'DISPUTED', 'PAID', 'VOIDED'].includes(status)) throw new BadRequestException('Invalid payment status');
    const scope = { organizationId: actor.organizationId, riderId: id };
    const where: Prisma.RiderEarningWhereInput = { ...scope, ...(status ? { status: status as any } : {}) };
    const [total, entries, totals, missing, missingCount, log] = await Promise.all([
      this.prisma.riderEarning.count({ where }),
      this.prisma.riderEarning.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 50, take: 50, include: { consignment: { select: { id: true, cnNumber: true, deliveredAt: true, serviceType: true, parties: { select: { kind: true, name: true } }, addresses: { select: { kind: true, addressLine: true, city: true } } } } } }),
      this.prisma.riderEarning.groupBy({ by: ['status', 'currencyCode', 'kind'], where: scope, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.consignment.findMany({ where: { organizationId: actor.organizationId, status: 'DELIVERED', riderEarning: null, events: { some: { eventType: 'DELIVERED', riderId: id } } }, select: { id: true, cnNumber: true, deliveredAt: true }, orderBy: { deliveredAt: 'desc' }, take: 50 }),
      this.prisma.consignment.count({ where: { organizationId: actor.organizationId, status: 'DELIVERED', riderEarning: null, events: { some: { eventType: 'DELIVERED', riderId: id } } } }),
      this.prisma.auditLog.findMany({ where: { organizationId: actor.organizationId, entityType: 'rider-payment', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, actorId: true, createdAt: true, newValues: true } }),
    ]);
    return { rider, entries, totals, missing, missingCount, log, total, page, pages: Math.max(1, Math.ceil(total / 50)) };
  }
  async record(actor: AuthenticatedUser, id: string, input: RiderMoneyDto) {
    this.admin(actor); const rider = await this.rider(actor, id);
    return this.prisma.$transaction(async (tx) => {
      if (input.consignmentId) {
        const shipment = await tx.consignment.findFirst({ where: { id: input.consignmentId, organizationId: actor.organizationId, status: 'DELIVERED' }, select: { events: { where: { eventType: 'DELIVERED' }, orderBy: [{ eventTime: 'desc' }, { id: 'desc' }], take: 1, select: { riderId: true } } } });
        if (!shipment || shipment.events[0]?.riderId !== id) throw new BadRequestException('Delivery was not completed by this rider');
        if (await tx.riderEarning.findUnique({ where: { consignmentId: input.consignmentId } })) throw new ConflictException('Delivery fee already recorded');
      } else if (new Prisma.Decimal(input.amount).lte(0)) throw new BadRequestException('Bonus must be greater than zero');
      const entry = await tx.riderEarning.create({ data: { organizationId: actor.organizationId, riderId: id, consignmentId: input.consignmentId, kind: input.consignmentId ? 'DELIVERY' : 'BONUS', amount: new Prisma.Decimal(input.amount), currencyCode: rider.organization.currencyCode, note: input.reason } });
      await this.audit(tx, actor, id, 'rider-payment.recorded', { entryId: entry.id, amount: input.amount, reason: input.reason });
      return entry;
    }, options);
  }
  async amend(actor: AuthenticatedUser, id: string, entryId: string, input: RiderMoneyDto) {
    this.admin(actor); await this.rider(actor, id);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.riderEarning.findFirst({ where: { id: entryId, riderId: id, organizationId: actor.organizationId, status: 'PENDING' } });
      if (!current) throw new ConflictException('Only unpaid entries can be edited');
      const changed = await tx.riderEarning.updateMany({ where: { id: entryId, status: 'PENDING' }, data: { amount: new Prisma.Decimal(input.amount), note: input.reason } });
      if (changed.count !== 1) throw new ConflictException('Entry changed; refresh');
      await this.audit(tx, actor, id, 'rider-payment.fee_changed', { entryId, previousAmount: current.amount.toString(), amount: input.amount, reason: input.reason });
      return { success: true };
    }, options);
  }
  async pay(actor: AuthenticatedUser, id: string, input: RiderPayDto) {
    this.admin(actor); const rider = await this.rider(actor, id);
    // Admin+rider accounts cannot clear both sides of their own payment.
    if (rider.userId === actor.id) throw new ForbiddenException('Another administrator must record your payment');
    return this.prisma.$transaction(async (tx) => {
      const entries = await tx.riderEarning.findMany({ where: { id: { in: input.ids }, riderId: id, organizationId: actor.organizationId, status: { in: ['PENDING', 'DISPUTED'] } } });
      if (entries.length !== input.ids.length) throw new ConflictException('Selection contains already sent, paid or unavailable entries');
      if (new Set(entries.map((entry) => entry.currencyCode)).size !== 1) throw new BadRequestException('Pay one currency at a time');
      const amount = entries.reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
      const changed = await tx.riderEarning.updateMany({ where: { id: { in: input.ids }, riderId: id, organizationId: actor.organizationId, status: { in: ['PENDING', 'DISPUTED'] } }, data: { status: 'SENT', sentAt: new Date(), sentById: actor.id, reference: input.reference, paidAt: null, confirmedAt: null, confirmedById: null } });
      if (changed.count !== input.ids.length) throw new ConflictException('Payment changed; refresh');
      await this.audit(tx, actor, id, 'rider-payment.sent', { ids: input.ids, reference: input.reference, amount: amount.toFixed(2), currencyCode: entries[0].currencyCode });
      await tx.notification.create({ data: { organizationId: actor.organizationId, recipientId: rider.userId, channel: 'IN_APP', status: 'UNREAD', template: 'RIDER_PAYMENT_SENT', payload: { title: 'Payment sent — confirm receipt', message: `${entries[0].currencyCode} ${amount.toFixed(2)}. Reference: ${input.reference}. Open Payments to confirm only after receiving it.`, section: 'payments' } } });
      return { success: true };
    }, options);
  }
  async receipt(actor: AuthenticatedUser, entryId: string, input: RiderReceiptDto) {
    if (!actor.riderId || !actor.roles.includes('RIDER')) throw new ForbiddenException('Rider identity required');
    const riderId = actor.riderId;
    if (input.decision === 'dispute' && !input.reason?.trim()) throw new BadRequestException('Explain why payment was not received');
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.riderEarning.findFirst({ where: { id: entryId, riderId: actor.riderId, organizationId: actor.organizationId, status: 'SENT' } });
      if (!entry) throw new ConflictException('Payment is not awaiting your confirmation');
      if (!entry.sentById || entry.sentById === actor.id) throw new ForbiddenException('Separate administrator and rider confirmation required');
      const now = new Date(); const confirmed = input.decision === 'confirm';
      const changed = await tx.riderEarning.updateMany({ where: { id: entryId, status: 'SENT', riderId: actor.riderId }, data: confirmed ? { status: 'PAID', paidAt: now, confirmedAt: now, confirmedById: actor.id } : { status: 'DISPUTED' } });
      if (changed.count !== 1) throw new ConflictException('Receipt already processed');
      await this.audit(tx, actor, riderId, confirmed ? 'rider-payment.confirmed' : 'rider-payment.disputed', { entryId, amount: entry.amount.toString(), reference: entry.reference, reason: input.reason || '' });
      const admins = await tx.user.findMany({ where: { organizationId: actor.organizationId, isActive: true, roles: { some: { role: { name: 'ADMIN' } } } }, select: { id: true } });
      if (admins.length) await tx.notification.createMany({ data: admins.map((admin) => ({ organizationId: actor.organizationId, recipientId: admin.id, channel: 'IN_APP', status: 'UNREAD', template: confirmed ? 'RIDER_PAYMENT_CONFIRMED' : 'RIDER_PAYMENT_DISPUTED', payload: { title: confirmed ? 'Rider confirmed receipt' : 'Rider reports payment not received', message: `${entry.currencyCode} ${entry.amount.toString()} · ${entry.reference}${input.reason ? ` · ${input.reason}` : ''}`, section: 'payments', riderId: actor.riderId } })) });
      return { success: true };
    }, options);
  }
  private audit(tx: Prisma.TransactionClient, actor: AuthenticatedUser, riderId: string, action: string, values: Prisma.InputJsonObject) {
    return tx.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, entityType: 'rider-payment', entityId: riderId, action, newValues: values } });
  }
}
