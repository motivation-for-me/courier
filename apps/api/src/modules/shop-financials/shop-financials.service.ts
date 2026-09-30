import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsignmentStatus, FinancialEntryCategory, Prisma, ShopSettlementStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth.types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { FinancialEntryDto, ShopPricingDto, ShopSettlementDto } from './dto/financial.dto';

@Injectable()
export class ShopFinancialsService {
  constructor(private readonly prisma: PrismaService) {}

  async pricing(shopId: string, actor: AuthenticatedUser) {
    this.admin(actor); await this.shop(shopId, actor);
    return this.prisma.shopPricingAgreement.findMany({ where: { customerId: shopId, organizationId: actor.organizationId }, orderBy: { effectiveFrom: 'desc' } });
  }

  async savePricing(shopId: string, input: ShopPricingDto, actor: AuthenticatedUser) {
    this.admin(actor); await this.shop(shopId, actor);
    const now = new Date(); const currencyCode = input.currencyCode.trim().toUpperCase();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.shopPricingAgreement.updateMany({ where: { customerId: shopId, organizationId: actor.organizationId, effectiveTo: null }, data: { effectiveTo: now } });
      const agreement = await transaction.shopPricingAgreement.create({ data: { organizationId: actor.organizationId, customerId: shopId, currencyCode, shipmentCharge: input.shipmentCharge, codFeeFixed: input.codFeeFixed, codFeePercent: input.codFeePercent, returnCharge: input.returnCharge, deductChargesFromCod: input.deductChargesFromCod, effectiveFrom: now, createdById: actor.id } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'shop.pricing.created', entityType: 'shop_pricing_agreement', entityId: agreement.id, newValues: { shopId, currencyCode, shipmentCharge: input.shipmentCharge, codFeeFixed: input.codFeeFixed, codFeePercent: input.codFeePercent, returnCharge: input.returnCharge, deductChargesFromCod: input.deductChargesFromCod } } });
      return agreement;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async addEntry(shopId: string, input: FinancialEntryDto, actor: AuthenticatedUser) {
    this.admin(actor); await this.shop(shopId, actor);
    if (input.amount === 0) throw new BadRequestException('Financial entry amount cannot be zero');
    const shipment = await this.prisma.consignment.findFirst({ where: { id: input.consignmentId, organizationId: actor.organizationId, customerId: shopId, deletedAt: null }, select: { id: true, organization: { select: { currencyCode: true } } } });
    if (!shipment) throw new NotFoundException('Shipment not found for this shop');
    return this.prisma.$transaction(async (transaction) => {
      const entry = await transaction.shipmentFinancialEntry.create({ data: { organizationId: actor.organizationId, customerId: shopId, consignmentId: input.consignmentId, category: input.category, type: input.type, amount: input.amount, currencyCode: shipment.organization.currencyCode, deductFromShop: input.category === FinancialEntryCategory.REVENUE && input.deductFromShop, reason: input.reason.trim(), reference: input.reference?.trim() || null, createdById: actor.id } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'shipment.financial_entry.created', entityType: 'shipment_financial_entry', entityId: entry.id, newValues: { shopId, consignmentId: input.consignmentId, category: input.category, type: input.type, amount: input.amount, reason: input.reason } } });
      return entry;
    });
  }

  async settle(shopId: string, input: ShopSettlementDto, actor: AuthenticatedUser) {
    this.admin(actor); await this.shop(shopId, actor);
    const allocationTotal = input.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (Math.abs(allocationTotal - input.amount) > 0.005) throw new BadRequestException('Settlement allocations must equal the settlement amount');
    if (new Set(input.allocations.map((item) => item.consignmentId)).size !== input.allocations.length) throw new BadRequestException('A shipment can be allocated only once per settlement');
    return this.prisma.$transaction(async (transaction) => {
      const shipments = await transaction.consignment.findMany({ where: { id: { in: input.allocations.map((item) => item.consignmentId) }, customerId: shopId, organizationId: actor.organizationId, deletedAt: null }, include: { payments: { where: { method: 'CASH', status: 'VERIFIED' } }, financialEntries: true, settlementAllocations: { where: { settlement: { status: ShopSettlementStatus.PAID } } } } });
      if (shipments.length !== input.allocations.length) throw new BadRequestException('One or more settlement shipments do not belong to this shop');
      for (const allocation of input.allocations) {
        const shipment = shipments.find((item) => item.id === allocation.consignmentId)!;
        const collected = shipment.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
        const deductions = shipment.financialEntries.filter((entry) => entry.category === FinancialEntryCategory.REVENUE && entry.deductFromShop).reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
        const adjustments = shipment.financialEntries.filter((entry) => entry.category === FinancialEntryCategory.SHOP_PAYABLE_ADJUSTMENT).reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
        const paid = shipment.settlementAllocations.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
        const outstanding = collected.minus(deductions).plus(adjustments).minus(paid);
        if (new Prisma.Decimal(allocation.amount).greaterThan(outstanding)) throw new BadRequestException(`Allocation exceeds outstanding amount for ${shipment.cnNumber}`);
      }
      const settlement = await transaction.shopSettlement.create({ data: { organizationId: actor.organizationId, customerId: shopId, amount: input.amount, currencyCode: input.currencyCode.trim().toUpperCase(), paidAt: new Date(input.paidAt), reference: input.reference?.trim() || null, remarks: input.remarks?.trim() || null, createdById: actor.id, allocations: { create: input.allocations } }, include: { allocations: true } });
      await transaction.auditLog.create({ data: { organizationId: actor.organizationId, actorId: actor.id, action: 'shop.settlement.created', entityType: 'shop_settlement', entityId: settlement.id, newValues: { shopId, amount: input.amount, allocationCount: input.allocations.length, reference: input.reference } } });
      return settlement;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async summary(shopId: string, actor: AuthenticatedUser, from?: string, to?: string) {
    this.admin(actor); const shop = await this.shop(shopId, actor); const range = this.range(from, to);
    const terminalStatuses: ConsignmentStatus[] = [ConsignmentStatus.DELIVERED, ConsignmentStatus.RETURNED, ConsignmentStatus.CANCELLED, ConsignmentStatus.DELIVERY_FAILED];
    const failedStatuses: ConsignmentStatus[] = [ConsignmentStatus.DELIVERY_FAILED, ConsignmentStatus.DELIVERY_ATTEMPT_FAILED, ConsignmentStatus.RETURNED];
    const shipments = await this.prisma.consignment.findMany({ where: { customerId: shopId, organizationId: actor.organizationId, deletedAt: null, bookedAt: range }, orderBy: { bookedAt: 'desc' }, include: { payments: { where: { method: 'CASH', status: 'VERIFIED' } }, financialEntries: { orderBy: { createdAt: 'asc' } }, settlementAllocations: { where: { settlement: { status: ShopSettlementStatus.PAID } }, include: { settlement: { select: { id: true, paidAt: true, reference: true } } } } } });
    const zero = () => new Prisma.Decimal(0);
    const rows = shipments.map((shipment) => {
      const revenue = shipment.financialEntries.filter((entry) => entry.category === FinancialEntryCategory.REVENUE).reduce((sum, entry) => sum.plus(entry.amount), zero());
      const cost = shipment.financialEntries.filter((entry) => entry.category === FinancialEntryCategory.COST).reduce((sum, entry) => sum.plus(entry.amount), zero());
      const codCollected = shipment.payments.reduce((sum, payment) => sum.plus(payment.amount), zero());
      const deductions = shipment.financialEntries.filter((entry) => entry.category === FinancialEntryCategory.REVENUE && entry.deductFromShop).reduce((sum, entry) => sum.plus(entry.amount), zero());
      const adjustments = shipment.financialEntries.filter((entry) => entry.category === FinancialEntryCategory.SHOP_PAYABLE_ADJUSTMENT).reduce((sum, entry) => sum.plus(entry.amount), zero());
      const paidToShop = shipment.settlementAllocations.reduce((sum, allocation) => sum.plus(allocation.amount), zero());
      const shopPayable = codCollected.minus(deductions).plus(adjustments);
      return { id: shipment.id, cnNumber: shipment.cnNumber, status: shipment.status, bookedAt: shipment.bookedAt, currencyCode: shipment.financialEntries[0]?.currencyCode ?? shipment.payments[0]?.currencyCode ?? 'PKR', revenue: revenue.toFixed(2), cost: cost.toFixed(2), profit: revenue.minus(cost).toFixed(2), codCollected: codCollected.toFixed(2), shopPayable: shopPayable.toFixed(2), paidToShop: paidToShop.toFixed(2), outstanding: shopPayable.minus(paidToShop).toFixed(2), entries: shipment.financialEntries, settlements: shipment.settlementAllocations };
    });
    const sum = (key: 'revenue' | 'cost' | 'profit' | 'codCollected' | 'shopPayable' | 'paidToShop' | 'outstanding') => rows.reduce((total, row) => total.plus(row[key]), zero()).toFixed(2);
    return { shop: { id: shop.id, name: shop.name }, range: { from: range.gte, to: range.lte, basis: 'shipment.bookedAt' }, counts: { total: rows.length, delivered: rows.filter((row) => row.status === ConsignmentStatus.DELIVERED).length, pending: rows.filter((row) => !terminalStatuses.includes(row.status)).length, failedOrReturned: rows.filter((row) => failedStatuses.includes(row.status)).length }, totals: { revenue: sum('revenue'), cost: sum('cost'), profit: sum('profit'), codCollected: sum('codCollected'), shopPayable: sum('shopPayable'), paidToShop: sum('paidToShop'), outstanding: sum('outstanding') }, shipments: rows };
  }

  async transactions(shopId: string, actor: AuthenticatedUser, from?: string, to?: string) {
    const report = await this.summary(shopId, actor, from, to);
    return report.shipments.flatMap((shipment) => shipment.entries.map((entry) => ({ ...entry, cnNumber: shipment.cnNumber }))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private range(from?: string, to?: string) {
    const gte = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const lte = to ? new Date(to) : new Date();
    if (Number.isNaN(gte.getTime()) || Number.isNaN(lte.getTime()) || gte > lte) throw new BadRequestException('Invalid financial date range');
    return { gte, lte };
  }
  private async shop(id: string, actor: AuthenticatedUser) { const shop = await this.prisma.customer.findFirst({ where: { id, organizationId: actor.organizationId, deletedAt: null }, select: { id: true, name: true } }); if (!shop) throw new NotFoundException('Shop not found'); return shop; }
  private admin(actor: AuthenticatedUser) { if (!actor.roles.includes('ADMIN')) throw new ForbiddenException('Administrator financial access required'); }
}
