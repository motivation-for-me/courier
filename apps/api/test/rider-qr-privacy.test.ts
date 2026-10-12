import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { TrackingController } from '../src/modules/tracking/tracking.controller';
import { DeliveryService } from '../src/modules/delivery/delivery.service';
import { createPublicTrackingToken } from '../src/common/public-tracking-token';

test('public tracking never returns receiver phone even through a signed customer link', async () => {
  process.env.JWT_SECRET = 'test-private-tracking-signature-secret';
  const shipment = { id: 'shipment', cnNumber: 'CN-TEST', status: 'DISPATCHED', serviceType: 'STANDARD', currentStatusAt: new Date(), organization: { name: 'Courier' }, parties: [{ name: 'Receiver', phone: 'PRIVATE-PHONE' }], addresses: [], assignments: [], events: [] };
  let query: any;
  const controller = new TrackingController({ consignment: { findFirst: async (input: any) => { query = input; return shipment; } } } as any);
  for (const key of [undefined, createPublicTrackingToken(shipment.id)]) {
    const result = await controller.publicTracking(shipment.cnNumber, key);
    assert.ok(!JSON.stringify(result).includes('PRIVATE-PHONE'));
    assert.equal(query.select.parties.select.phone, undefined);
  }
});

test('rider QR details require the assigned rider and organization scope', async () => {
  const actor: any = { id: 'user', organizationId: 'company', riderId: 'assigned-rider' };
  const parcel = { id: 'parcel', cnNumber: 'CN-TEST', status: 'DISPATCHED', serviceType: 'STANDARD', currentStatusAt: new Date(), assignments: [{ riderId: actor.riderId }], parties: [{ name: 'Receiver', phone: 'PRIVATE-PHONE' }], addresses: [], items: [], events: [{ eventType: 'DISPATCHED', eventTime: new Date() }], payments: [] };
  let query: any; let audits = 0;
  const service = new DeliveryService({ consignment: { findFirst: async (input: any) => { query = input; return parcel; } }, auditLog: { create: async () => { audits++; } } } as any);
  const result = await service.scan(parcel.cnNumber, actor);
  assert.equal(result.parties[0].phone, 'PRIVATE-PHONE');
  assert.equal(result.events.length, 1);
  assert.equal(query.where.organizationId, actor.organizationId);
  assert.equal(query.where.deletedAt, null);
  await assert.rejects(service.scan(parcel.cnNumber, { ...actor, riderId: 'another-rider' }), /not assigned/);
  await assert.rejects(service.scan(parcel.cnNumber, { ...actor, riderId: undefined }), /not assigned/);
  assert.equal(audits, 1);
});
