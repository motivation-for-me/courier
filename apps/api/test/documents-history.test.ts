import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ConsignmentsService } from '../src/modules/consignments/consignments.service';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { AuthenticatedUser } from '../src/common/auth.types';

const actor: AuthenticatedUser = { id: 'admin', organizationId: 'company', displayName: 'Admin', roles: ['ADMIN'], permissions: ['shipment:view', 'documents:view'] };

test('active and history pagination apply status scope to both rows and totals', async () => {
  for (const scope of ['active', 'history']) {
    const queries: any[] = [];
    const prisma: any = {
      consignment: {
        count: (query: any) => { queries.push(query); return Promise.resolve(0); },
        findMany: (query: any) => { queries.push(query); return Promise.resolve([]); },
      },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const service = new ConsignmentsService(prisma);
    await service.page(actor, { scope, status: 'DELIVERED', page: '2', limit: '25' });
    assert.deepEqual(queries[0].where, queries[1].where);
    assert.equal(queries[1].skip, 25);
    assert.equal(queries[0].where.organizationId, actor.organizationId);
    assert.deepEqual(queries[0].where.AND, [
      { status: scope === 'active' ? { not: 'DELIVERED' } : 'DELIVERED' },
      { status: 'DELIVERED' },
    ]);
    await assert.rejects(service.page(actor, { scope: 'invalid' }), /Invalid shipment scope/);
  }
});

test('shipment PDF renders with the generated self-contained PDF runtime', async () => {
  process.env.JWT_SECRET = 'qa-test-secret-with-enough-entropy';
  process.env.WEB_ORIGIN = 'https://courier.example';
  const shipment = {
    id: 'shipment', cnNumber: 'CN-TEST-1', organizationId: actor.organizationId,
    organization: { name: 'Test Courier' }, createdAt: new Date(), status: 'DELIVERED', serviceType: 'STANDARD',
    parties: [{ kind: 'SENDER', name: 'Sender' }, { kind: 'RECEIVER', name: 'Receiver' }],
    addresses: [], items: [{ description: 'Parcel', quantity: 1, unit: 'piece' }], payments: [], assignments: [],
  };
  let audited = false;
  const prisma: any = {
    consignment: { findFirst: async () => shipment },
    auditLog: { create: async () => { audited = true; return {}; } },
  };
  const result = await new DocumentsService(prisma).consignmentPdf(shipment.id, actor);
  assert.equal(result.buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(result.buffer.length > 1000);
  assert.equal(result.filename, 'CN-TEST-1-dispatch.pdf');
  assert.equal(audited, true);
});
