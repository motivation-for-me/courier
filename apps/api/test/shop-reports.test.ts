import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { ShopReportsService, reportRange } from '../src/modules/reports/shop-reports.module';
import { RiderPayAllDto } from '../src/modules/riders/rider-payments.dto';
const admin: any = { id: 'admin', roles: ['ADMIN'], organizationId: 'company' };
const shop: any = { id: 'shop-user', roles: ['SHOP'], organizationId: 'company', customerId: 'shop' };
const payout = (id: string, amount: string, time: string, currencyCode = 'PKR') => ({ id, amount: new Prisma.Decimal(amount), currencyCode, paidAt: new Date(time), customerId: 'shop', customer: { name: 'Shop A' }, allocations: [{ amount: new Prisma.Decimal(amount), consignmentId: 'parcel', consignment: { cnNumber: 'CN-1' } }] });

test('shop receipts are scoped to company and own shop; riders and cross-shop requests are rejected', async () => {
  let query: any;
  const service = new ShopReportsService({ shopSettlement: { findMany: async (input: any) => { query = input; return []; } } } as any);
  await service.report(shop, { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(query.where.organizationId, 'company'); assert.equal(query.where.customerId, 'shop'); assert.equal(query.where.status, 'PAID');
  await assert.rejects(service.report(shop, { shopId: 'other' }), /only view your own/);
  await assert.rejects(service.report({ ...shop, roles: ['RIDER'] }, {}), /Shop or administrator/);
  await assert.rejects(service.report({ ...shop, customerId: undefined }, {}), /Shop or administrator/);
  await service.report(admin, { shopId: 'chosen-shop' }); assert.equal(query.where.customerId, 'chosen-shop');
  await service.report(admin, {}); assert.equal(query.where.customerId, undefined);
});
test('date range uses inclusive Pakistan calendar days and rejects invalid or reversed dates', () => {
  const range = reportRange({ from: '2026-10-01', to: '2026-10-31', group: 'week' });
  assert.equal(range.start.toISOString(), '2026-09-30T19:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-10-31T19:00:00.000Z');
  assert.throws(() => reportRange({ from: '2026-02-30' }), /valid date/);
  assert.throws(() => reportRange({ from: '2026-10-31', to: '2026-10-01' }), /Start date/);
  assert.throws(() => reportRange({ group: 'year' }), /Invalid report/);
});
test('net payouts are not deducted twice, exact totals stay per currency and partial payments count a shipment once', async () => {
  let query: any;
  const rows = [payout('p1', '900.10', '2026-10-18T19:30:00Z'), payout('p2', '0.20', '2026-10-20T12:00:00Z'), payout('p3', '50', '2026-10-20T12:00:00Z', 'AED')];
  const service = new ShopReportsService({ shopSettlement: { findMany: async (input: any) => { query = input; return rows; } } } as any);
  const report = await service.report(admin, { from: '2026-10-01', to: '2026-10-31', group: 'week' });
  assert.equal(query.where.paidAt.gte.toISOString(), '2026-09-30T19:00:00.000Z');
  assert.equal(query.where.bookedAt, undefined, 'A payout is reported by paidAt even if its shipment was booked earlier');
  assert.deepEqual(report.totals.find((total) => total.currencyCode === 'PKR'), { currencyCode: 'PKR', netReceived: '900.30', payments: 2, shipments: 1 });
  assert.equal(report.totals.find((total) => total.currencyCode === 'AED')?.netReceived, '50.00');
  assert.equal(report.periods[0].period, '2026-10-19', 'Sunday UTC evening is Monday in Pakistan');
  assert.equal(report.payments[0].netReceived, '900.10');
  assert.equal((await service.report(admin, { group: 'month' })).periods[0].period, '2026-10');
});
test('PDF uses the same protected report, includes empty periods, and renders a valid document', async () => {
  const service = new ShopReportsService({ shopSettlement: { findMany: async () => [] } } as any);
  const pdf = await service.pdf(shop, { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  await assert.rejects(service.pdf(shop, { shopId: 'another-shop' }), /only view your own/);
  const large = new ShopReportsService({ shopSettlement: { findMany: async () => Array.from({ length: 70 }, (_, index) => payout(`p-${index}`, '900', '2026-10-21T12:00:00Z')) } } as any);
  const fullPdf = await large.pdf(shop, { from: '2026-10-01', to: '2026-10-31' });
  assert.ok((fullPdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 1, 'Long monthly reports must produce multiple pages');
});
test('payment recording no longer requires a bank reference or cash note', async () => {
  assert.equal((await validate(new RiderPayAllDto())).length, 0);
});
