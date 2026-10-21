import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { ShopFinancialsService } from '../src/modules/shop-financials/shop-financials.service';
const admin: any = { id: 'admin', roles: ['ADMIN'], organizationId: 'company' };
const decimal = (value: string) => new Prisma.Decimal(value);
function fixture() {
  let created: any; let notified: any; let query: any;
  const rows = [
    { id: 'parcel', cnNumber: 'CN-1', payments: [{ amount: decimal('1000'), currencyCode: 'PKR' }], financialEntries: [{ category: 'REVENUE', deductFromShop: true, amount: decimal('100'), currencyCode: 'PKR' }], settlementAllocations: [{ amount: decimal('200') }] },
    { id: 'uncollected', cnNumber: 'CN-2', payments: [], financialEntries: [{ category: 'REVENUE', deductFromShop: true, amount: decimal('100'), currencyCode: 'PKR' }], settlementAllocations: [] },
  ];
  const tx: any = { organization: { findUniqueOrThrow: async () => ({ currencyCode: 'PKR' }) }, consignment: { findMany: async (input: any) => { query = input; return rows; } }, shopSettlement: { create: async (input: any) => { created = input; return { id: 'payout', amount: input.data.amount }; } }, auditLog: { create: async () => ({}) }, user: { findMany: async () => [{ id: 'shop-user' }] }, notification: { createMany: async (input: any) => { notified = input; } } };
  const service = new ShopFinancialsService({ customer: { findFirst: async () => ({ id: 'shop', name: 'Shop' }) }, $transaction: (callback: any) => callback(tx) } as any);
  return { service, tx, rows, values: () => ({ created, notified, query }) };
}
test('shop payout automatically excludes fees and previous payments without notes; uncollected deliveries are not paid', async () => {
  const { service, values } = fixture();
  const balance = await service.payable('shop', admin);
  assert.equal(balance.netPayable, '700.00'); assert.equal(balance.shipments.length, 1);
  await service.payAll('shop', admin, '700.00', 'PKR');
  assert.equal(values().created.data.amount.toFixed(2), '700.00');
  assert.equal(values().created.data.reference, undefined);
  assert.equal(values().created.data.allocations.create.length, 1);
  assert.equal(values().created.data.allocations.create[0].consignmentId, 'parcel');
  assert.equal(values().query.where.organizationId, 'company'); assert.equal(values().query.where.customerId, 'shop');
  assert.equal(values().notified.data[0].payload.section, 'reports');
});
test('changed, mixed-currency, negative or already-cleared balances cannot be falsely recorded as paid', async () => {
  const { service, rows, values } = fixture();
  await assert.rejects(service.payAll('shop', admin, '800.00', 'PKR'), /balance changed/);
  assert.equal(values().created, undefined);
  rows[0].payments[0].currencyCode = 'AED';
  await assert.rejects(service.payAll('shop', admin, '700.00', 'PKR'), /mixed-currency/);
  rows[0].payments[0].currencyCode = 'PKR'; rows[0].settlementAllocations[0].amount = decimal('1000');
  await assert.rejects(service.payAll('shop', admin, '0.00', 'PKR'), /negative shop balances/);
  rows[0].settlementAllocations[0].amount = decimal('900');
  await assert.rejects(service.payAll('shop', admin, '0.00', 'PKR'), /No unpaid shop balance/);
  await assert.rejects(service.payable('shop', { ...admin, roles: ['SHOP'] }), /Administrator/);
});
