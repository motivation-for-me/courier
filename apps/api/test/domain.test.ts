import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ConsignmentStatus } from '@prisma/client';
import { allowedRiderStatuses } from '../src/common/rider-status';
import { createPublicTrackingToken, verifyPublicTrackingToken } from '../src/common/public-tracking-token';

test('rider lifecycle exposes only valid next actions', () => {
  assert.deepEqual(allowedRiderStatuses(ConsignmentStatus.ASSIGNED_TO_RIDER, false), []);
  assert.deepEqual(allowedRiderStatuses(ConsignmentStatus.DISPATCHED, false), ['OUT_FOR_DELIVERY']);
  assert.deepEqual(allowedRiderStatuses(ConsignmentStatus.OUT_FOR_DELIVERY, false), ['DELIVERED', 'DELIVERY_FAILED']);
  assert.deepEqual(allowedRiderStatuses(ConsignmentStatus.OUT_FOR_DELIVERY, true), ['DELIVERY_FAILED']);
  assert.deepEqual(allowedRiderStatuses(ConsignmentStatus.DELIVERED, false), []);
});

test('public tracking tokens are signed and consignment-specific', () => {
  process.env.JWT_SECRET = 'qa-test-secret-with-enough-entropy';
  const token = createPublicTrackingToken('shipment-a');
  assert.equal(verifyPublicTrackingToken('shipment-a', token), true);
  assert.equal(verifyPublicTrackingToken('shipment-b', token), false);
  assert.equal(verifyPublicTrackingToken('shipment-a', `${token}x`), false);
  assert.equal(verifyPublicTrackingToken('shipment-a'), false);
});
