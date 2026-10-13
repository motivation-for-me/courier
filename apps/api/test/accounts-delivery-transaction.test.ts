import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { AuthService } from '../src/modules/auth/auth.service';
import { DeliveryService } from '../src/modules/delivery/delivery.service';

const actor: any = { id: 'admin', organizationId: 'company', riderId: 'rider', roles: ['ADMIN'] };

test('account directory is admin-only, company-scoped, paginated and excludes authentication secrets', async () => {
  const queries: any[] = [];
  const prisma: any = { user: { count: async (query: any) => { queries.push(query); return 51; }, findMany: async (query: any) => { queries.push(query); return [{ id: 'rider-user', roles: [{ role: { name: 'RIDER' } }] }]; } } };
  const service = new AuthService(prisma, {} as any);
  await assert.rejects(service.listAccounts({ ...actor, roles: ['RIDER'] }, {}), /Administrator/);
  const result = await service.listAccounts(actor, { role: 'RIDER', page: '2', search: 'rider@example.com' });
  assert.equal(result.pages, 2);
  assert.deepEqual(result.accounts[0].roles, ['RIDER']);
  assert.deepEqual(queries[0].where, queries[1].where);
  assert.equal(queries[1].where.organizationId, 'company');
  assert.equal(queries[1].where.roles.some.role.name, 'RIDER');
  assert.equal(queries[1].skip, 50);
  for (const secret of ['passwordHash', 'googleSubject', 'sessions', 'emailActions']) assert.equal(queries[1].select[secret], undefined);
  await assert.rejects(service.listAccounts(actor, { page: '-1' }), /Invalid account page/);
});

test('delivery completion retains an atomic transaction beyond the five-second default and records its replay result', async () => {
  let elapsed = 0; let options: any; let replay: any; let notified = false;
  const parcel: any = { id: 'parcel', cnNumber: 'CN-TEST', organizationId: 'company', customerId: null, status: 'OUT_FOR_DELIVERY', payments: [], assignments: [{ riderId: 'rider' }] };
  const query = (value: any) => async () => { elapsed += 750; if (elapsed > (options.timeout || 5000)) throw new Error('Transaction not found'); return value; };
  const tx: any = {
    idempotencyRecord: { findUnique: query(null), create: async (input: any) => { replay = input.data; return input.data; } },
    consignment: { findFirst: query(parcel), updateMany: query({ count: 1 }), findUniqueOrThrow: query({ ...parcel, status: 'DELIVERED' }) },
    deliveryAttempt: { count: query(0), create: query({}) }, riderAssignment: { updateMany: query({ count: 1 }) },
    trackingEvent: { create: query({}) }, auditLog: { create: query({}) },
    user: { findMany: query([{ id: 'admin' }]) }, notification: { createMany: async () => { notified = true; } },
    rider: { findUniqueOrThrow: query({ deliveryFee: '100' }) }, organization: { findUniqueOrThrow: query({ currencyCode: 'PKR' }) }, riderEarning: { upsert: query({}) },
  };
  const prisma: any = { idempotencyRecord: { findUnique: async () => null }, riderAssignment: { findFirst: async () => ({}) }, $transaction: async (callback: any, input: any) => { options = input; return callback(tx); } };
  const result: any = await new DeliveryService(prisma).complete('parcel', actor, undefined, undefined, 'completion-key');
  assert.ok(elapsed > 5000);
  assert.equal(options.timeout, 30000);
  assert.equal(options.maxWait, 10000);
  assert.equal(options.isolationLevel, 'Serializable');
  assert.equal(result.status, 'DELIVERED');
  assert.equal(replay.resourceKey, 'completion-key');
  assert.equal(notified, true);
});
