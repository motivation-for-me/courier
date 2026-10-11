import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { notifyShipmentDelivery } from '../src/common/shipment-notifications';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { AuthenticatedUser } from '../src/common/auth.types';
import { DeliveryService } from '../src/modules/delivery/delivery.service';
import { createHash } from 'node:crypto';

const actor: AuthenticatedUser = { id: 'admin', organizationId: 'company', displayName: 'Admin', roles: ['ADMIN'], permissions: [] };

test('replaying delivery completion returns its stored result without creating new alerts', async () => {
  const result = { id: 'parcel', status: 'DELIVERED' };
  const prisma: any = {
    idempotencyRecord: { findUnique: async () => ({ requestHash: createHash('sha256').update(JSON.stringify({ consignmentId: 'parcel' })).digest('hex'), response: result }) },
    $transaction: () => { assert.fail('A replay must not create another transaction or notification'); },
  };
  assert.deepEqual(await new DeliveryService(prisma).complete('parcel', actor, undefined, undefined, 'retry-key'), result);
});

test('delivery alerts include shop, admins and completing rider without duplicate recipients', async () => {
  let recipientsQuery: any;
  let alerts: any[] = [];
  const transaction: any = {
    user: { findMany: async (query: any) => { recipientsQuery = query; return [{ id: 'admin' }, { id: 'shop' }, { id: 'rider' }, { id: 'admin' }]; } },
    notification: { createMany: async ({ data }: any) => { alerts = data; } },
  };
  await notifyShipmentDelivery(transaction, { id: 'parcel', organizationId: 'company', customerId: 'shop-customer', cnNumber: 'CN-1' }, 'rider', 'DELIVERED');
  assert.equal(recipientsQuery.where.organizationId, 'company');
  assert.equal(recipientsQuery.where.isActive, true);
  assert.deepEqual(recipientsQuery.where.OR, [
    { roles: { some: { role: { name: 'ADMIN' } } } },
    { customerId: 'shop-customer', roles: { some: { role: { name: 'SHOP' } } } },
    { id: 'rider' },
  ]);
  assert.equal(alerts.length, 3);
  assert.ok(alerts.every((alert) => alert.template === 'DELIVERY_COMPLETED' && alert.status === 'UNREAD' && alert.payload.cnNumber === 'CN-1'));
});

test('shipments without a shop never broaden the notification recipient scope', async () => {
  const transaction: any = {
    user: { findMany: async ({ where }: any) => { assert.equal(where.OR.length, 1); return []; } },
    notification: { createMany: async () => { assert.fail('No recipients to notify'); } },
  };
  await notifyShipmentDelivery(transaction, { id: 'parcel', organizationId: 'company', customerId: null, cnNumber: 'CN-1' }, 'rider', 'OUT_FOR_DELIVERY');
});

test('inbox counts all unread alerts independently of the latest 50 items', async () => {
  const prisma: any = { notification: {
    findMany: async ({ where, take }: any) => { assert.equal(where.recipientId, actor.id); assert.equal(where.organizationId, actor.organizationId); assert.equal(take, 50); return []; },
    count: async ({ where }: any) => { assert.equal(where.recipientId, actor.id); assert.equal(where.status, 'UNREAD'); return 75; },
  } };
  assert.deepEqual(await new NotificationsService(prisma).inbox(actor), { items: [], unread: 75 });
});

test('mark-all-read only updates the signed-in recipient within their company', async () => {
  const prisma: any = { notification: { updateMany: async ({ where }: any) => {
    assert.deepEqual(where, { organizationId: actor.organizationId, recipientId: actor.id, status: 'UNREAD' });
    return { count: 2 };
  } } };
  assert.deepEqual(await new NotificationsService(prisma).readAll(actor), { success: true, count: 2 });
});
