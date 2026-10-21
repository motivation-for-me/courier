import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, Query, Res } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type PDFKitDocument = require('pdfkit');
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';

export type ReportQuery = { from?: string; to?: string; group?: string; shopId?: string };
const dateKey = (date: Date) => new Date(date.getTime() + 5 * 3600000).toISOString().slice(0, 10);
function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new BadRequestException('Use a valid date in YYYY-MM-DD format');
  return new Date(`${value}T00:00:00+05:00`);
}
export function reportRange(query: ReportQuery) {
  const today = dateKey(new Date());
  const from = query.from || `${today.slice(0, 7)}-01`, to = query.to || today;
  const start = day(from), end = day(to);
  if (start > end) throw new BadRequestException('Start date must be on or before the end date');
  const group = query.group || 'day';
  if (!['day', 'week', 'month'].includes(group)) throw new BadRequestException('Invalid report grouping');
  return { from, to, group, start, end: new Date(end.getTime() + 86400000) };
}
function bucket(date: string, group: string) {
  if (group === 'month') return date.slice(0, 7);
  if (group !== 'week') return date;
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class ShopReportsService {
  constructor(private readonly prisma: PrismaService) {}
  private scope(actor: AuthenticatedUser, shopId?: string) {
    if (shopId !== undefined && (typeof shopId !== 'string' || shopId.length > 100)) throw new BadRequestException('Invalid shop filter');
    if (actor.roles.includes('ADMIN')) return { organizationId: actor.organizationId, ...(shopId ? { customerId: shopId } : {}) };
    if (!actor.roles.includes('SHOP') || !actor.customerId) throw new ForbiddenException('Shop or administrator access required');
    if (shopId && shopId !== actor.customerId) throw new ForbiddenException('You can only view your own shop reports');
    return { organizationId: actor.organizationId, customerId: actor.customerId };
  }
  async shops(actor: AuthenticatedUser) {
    const scope = this.scope(actor);
    return this.prisma.customer.findMany({ where: { organizationId: actor.organizationId, ...('customerId' in scope ? { id: scope.customerId } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
  async report(actor: AuthenticatedUser, query: ReportQuery) {
    const scope = this.scope(actor, query.shopId), range = reportRange(query);
    const settlements = await this.prisma.shopSettlement.findMany({
      where: { ...scope, status: 'PAID', paidAt: { gte: range.start, lt: range.end } },
      orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
      select: { id: true, customerId: true, amount: true, currencyCode: true, paidAt: true, customer: { select: { name: true } }, allocations: { select: { amount: true, consignmentId: true, consignment: { select: { cnNumber: true } } } } },
    });
    const totals = new Map<string, { amount: Prisma.Decimal; payments: number; shipments: Set<string> }>();
    const periods = new Map<string, { period: string; currencyCode: string; amount: Prisma.Decimal; payments: number }>();
    for (const row of settlements) {
      const total = totals.get(row.currencyCode) || { amount: new Prisma.Decimal(0), payments: 0, shipments: new Set<string>() };
      total.amount = total.amount.plus(row.amount); total.payments++;
      for (const allocation of row.allocations) total.shipments.add(allocation.consignmentId);
      totals.set(row.currencyCode, total);
      const period = bucket(dateKey(row.paidAt), range.group), key = `${period}:${row.currencyCode}`;
      const value = periods.get(key) || { period, currencyCode: row.currencyCode, amount: new Prisma.Decimal(0), payments: 0 };
      value.amount = value.amount.plus(row.amount); value.payments++; periods.set(key, value);
    }
    return {
      from: range.from, to: range.to, group: range.group, timezone: 'Asia/Karachi', basis: 'payment date',
      totals: Array.from(totals, ([currencyCode, value]) => ({ currencyCode, netReceived: value.amount.toFixed(2), payments: value.payments, shipments: value.shipments.size })),
      periods: Array.from(periods.values(), (value) => ({ period: value.period, currencyCode: value.currencyCode, netReceived: value.amount.toFixed(2), payments: value.payments })),
      payments: settlements.map((row) => ({ id: row.id, shop: { id: row.customerId, name: row.customer.name }, paidAt: row.paidAt.toISOString(), currencyCode: row.currencyCode, netReceived: row.amount.toFixed(2), shipments: row.allocations.map((allocation) => ({ cnNumber: allocation.consignment.cnNumber, netReceived: allocation.amount.toFixed(2) })) })),
    };
  }
  async pdf(actor: AuthenticatedUser, query: ReportQuery) {
    const report = await this.report(actor, query);
    const PDFDocument: typeof PDFKitDocument = require('../../generated/pdfkit-runtime.cjs');
    const document = new PDFDocument({ size: 'A4', margin: 42, info: { Title: 'Shop payments report', Author: 'SwiftLog' } });
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => { document.on('data', (chunk: Buffer) => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject); });
    document.font('Helvetica-Bold').fontSize(20).text('SwiftLog | Shop payments');
    document.font('Helvetica').fontSize(10).text(`${report.from} to ${report.to} | ${report.timezone}`);
    document.moveDown().text('Net payments recorded after delivery-fee deductions. Based on payment date.');
    for (const total of report.totals) document.moveDown().font('Helvetica-Bold').fontSize(13).text(`${total.currencyCode} ${total.netReceived} received | ${total.payments} payments | ${total.shipments} shipments`);
    function space() { if (document.y > document.page.height - 85) document.addPage(); }
    document.moveDown().fontSize(12).text('Period summary');
    for (const row of report.periods) { space(); document.font('Helvetica').fontSize(10).text(`${row.period}    ${row.currencyCode} ${row.netReceived}    ${row.payments} payments`); }
    document.moveDown().font('Helvetica-Bold').fontSize(12).text('Payments received');
    for (const row of report.payments) {
      space(); document.font('Helvetica-Bold').fontSize(10).text(`${dateKey(new Date(row.paidAt))} | ${row.shop.name}`, { width: 380 });
      document.font('Helvetica').text(`${row.currencyCode} ${row.netReceived} received | ${row.shipments.length} shipments`);
      for (const shipment of row.shipments) { space(); document.fontSize(9).text(`  ${shipment.cnNumber}    ${row.currencyCode} ${shipment.netReceived}`); }
      document.moveDown(.5);
    }
    if (!report.payments.length) document.font('Helvetica').fontSize(10).text('No payments recorded in this period.');
    document.end(); return complete;
  }
}
@Controller('reports')
class ShopReportsController {
  constructor(private readonly reports: ShopReportsService) {}
  @Get('shops') shops(@CurrentUser() actor: AuthenticatedUser) { return this.reports.shops(actor); }
  @Get('shop-payments') report(@CurrentUser() actor: AuthenticatedUser, @Query() query: ReportQuery) { return this.reports.report(actor, query); }
  @Get('shop-payments.pdf') async pdf(@CurrentUser() actor: AuthenticatedUser, @Query() query: ReportQuery, @Res() response: Response) {
    const pdf = await this.reports.pdf(actor, query);
    response.set({ 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="shop-payments-report.pdf"', 'cache-control': 'private, no-store' });
    response.send(pdf);
  }
}
@Module({ controllers: [ShopReportsController], providers: [ShopReportsService] })
export class ShopReportsModule {}
