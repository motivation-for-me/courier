import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { AccountsService, deleteAccount } from '../src/modules/accounts/accounts.module';
import { ConsignmentsService } from '../src/modules/consignments/consignments.service';
const actor: any = { id: 'admin', organizationId: 'company', roles: ['ADMIN'] };
function accountTx(user: any) {
  const writes: any[] = [];
  const record = (name: string) => async (input: any) => { writes.push({ name, ...input }); return { count: 1 }; };
  const tx: any = { user: { findFirst: async () => user, count: async () => 2, update: record('user'), updateMany: record('user') }, rider: { update: record('rider'), updateMany: record('rider') }, riderAssignment: { count: async () => 0 }, pickup: { count: async () => 0 }, recycleBinItem: { create: record('bin'), update: record('bin-restored') }, authSession: { updateMany: record('sessions') }, emailAction: { updateMany: record('email-actions') }, auditLog: { create: record('audit') } };
  return { tx, writes };
}
test('account deletion retains linked rider and history, revokes access, and records original disabled state', async () => {
  const { tx, writes } = accountTx({ id: 'member', displayName: 'Member', isActive: false, roles: [], rider: { id: 'rider', isActive: false } });
  await deleteAccount(tx, 'member', actor);
  const bin = writes.find((write) => write.name === 'bin').data;
  assert.equal(bin.organizationId, 'company'); assert.equal(bin.snapshot.userActive, false); assert.equal(bin.snapshot.riderId, 'rider');
  assert.equal(writes.find((write) => write.name === 'user').data.isActive, false);
  assert.deepEqual(writes.find((write) => write.name === 'user').data.authVersion, { increment: 1 });
  assert.ok(writes.find((write) => write.name === 'sessions').data.revokedAt);
  assert.ok(writes.find((write) => write.name === 'email-actions').data.consumedAt);
});
test('deletion blocks non-admin, self, last admin, active deliveries and active pickups before writes', async () => {
  const { tx, writes } = accountTx({ id: 'member', displayName: 'Member', isActive: true, roles: [{ role: { name: 'ADMIN' } }], rider: { id: 'rider' } });
  await assert.rejects(deleteAccount(tx, 'member', { ...actor, roles: ['RIDER'] }), /Administrator/);
  await assert.rejects(deleteAccount(tx, actor.id, actor), /own account/);
  tx.user.count = async () => 1;
  await assert.rejects(deleteAccount(tx, 'member', actor), /at least one/);
  tx.user.count = async () => 2; tx.riderAssignment.count = async () => 1;
  await assert.rejects(deleteAccount(tx, 'member', actor), /deliveries/);
  tx.riderAssignment.count = async () => 0; tx.pickup.count = async () => 1;
  await assert.rejects(deleteAccount(tx, 'member', actor), /pickups/);
  assert.equal(writes.length, 0);
});
test('restore preserves disabled access and scopes user, rider and bin to organization', async () => {
  const { tx, writes } = accountTx({ customerId: null }); let lookup: any;
  tx.recycleBinItem.findFirst = async (input: any) => { lookup = input.where; return { entityType: 'RIDER', entityId: 'rider', snapshot: { userId: 'member', userActive: false, riderId: 'rider', riderActive: false } }; };
  let options: any;
  const service = new AccountsService({ $transaction: async (callback: any, input: any) => { options = input; return callback(tx); } } as any);
  await service.restore('bin-id', actor);
  assert.equal(lookup.organizationId, 'company'); assert.equal(lookup.restoredAt, null);
  for (const name of ['user', 'rider']) { const write = writes.find((write) => write.name === name); assert.equal(write.where.organizationId, 'company'); assert.equal(write.data.isActive, false); assert.equal(write.data.deletedAt, null); }
  assert.equal(options.timeout, 30000); assert.equal(options.isolationLevel, 'Serializable');
  tx.recycleBinItem.findFirst = async () => null;
  await assert.rejects(service.restore('other-org-item', actor), /Deleted record not found/);
});
test('shipment deletion enters bin atomically; restore does not resurrect ended assignments', async () => {
  const writes: any[] = []; const write = (name: string) => async (input: any) => { writes.push({ name, ...input }); return { count: 1 }; };
  const tx: any = { consignment: { findFirst: async () => ({ id: 'parcel', status: 'OUT_FOR_DELIVERY', cnNumber: 'CN-123' }), updateMany: write('shipment') }, recycleBinItem: { create: write('bin'), update: write('restore'), findFirst: async () => ({ entityType: 'SHIPMENT', entityId: 'parcel', snapshot: {} }) }, riderAssignment: { updateMany: write('assignments') }, pickup: { updateMany: write('pickup') }, auditLog: { create: write('audit') } };
  const prisma: any = { $transaction: (callback: any) => callback(tx) };
  await new ConsignmentsService(prisma).remove('parcel', actor);
  assert.equal(writes.find((item) => item.name === 'bin').data.label, 'CN-123');
  assert.equal(writes.find((item) => item.name === 'assignments').data.status, 'ENDED');
  writes.length = 0; await new AccountsService(prisma).restore('bin-id', actor);
  assert.equal(writes.find((item) => item.name === 'shipment').data.deletedAt, null);
  assert.equal(writes.some((item) => item.name === 'assignments' || item.name === 'pickup'), false);
});
test('Recycle Bin rejects invalid filters and hides snapshots and passwords', async () => {
  let query: any; const service = new AccountsService({ recycleBinItem: { count: async () => 1, findMany: async (input: any) => { query = input; return []; } } } as any);
  await service.bin(actor, { type: 'RIDER', search: 'Ali', page: '2' });
  assert.equal(query.where.organizationId, 'company'); assert.equal(query.where.restoredAt, null); assert.equal(query.skip, 50); assert.equal(query.select.snapshot, undefined);
  await assert.rejects(service.bin(actor, { type: 'INVALID' }), /Invalid/);
  await assert.rejects(service.bin({ ...actor, roles: ['SHOP'] }, {}), /Administrator/);
});
test('account edit rejects cross-organization accounts and clears Google/email verification on address change', async () => {
  const { tx, writes } = accountTx(null);
  const service = new AccountsService({ $transaction: (callback: any) => callback(tx) } as any);
  tx.user.findFirst = async (input: any) => input.where.id === 'member' ? { id: 'member', displayName: 'Member', email: 'old-id', isActive: true, roles: [] } : null;
  await assert.rejects(service.save('missing', { displayName: 'Member', email: 'legacy-id' }, actor), /Account not found/);
  await service.save('member', { displayName: 'New name', email: 'new-id', phone: '123' }, actor);
  const update = writes.find((write) => write.name === 'user').data;
  assert.equal(update.googleSubject, null); assert.equal(update.emailVerifiedAt, null); assert.equal(update.email, 'new-id');
  assert.ok(writes.some((write) => write.name === 'sessions'));
  assert.equal(JSON.stringify(writes.find((write) => write.name === 'audit')).includes('passwordHash'), false);
});
test('creating rider and shop accounts validates profile ownership and stores only a password hash', async () => {
  let created: any; let rolePermissions: any;
  const tx: any = {
    user: { findFirst: async () => null, create: async (input: any) => { created = input; return { id: 'new-user' }; } },
    role: { findUnique: async () => ({ id: 'role' }) },
    permission: { findMany: async (input: any) => input.where.code.in.map((code: string) => ({ id: code })) },
    rolePermission: { createMany: async (input: any) => { rolePermissions = input; } },
    rider: { findFirst: async () => null }, customer: { findFirst: async () => null }, auditLog: { create: async () => ({}) },
  };
  const service = new AccountsService({ $transaction: (callback: any) => callback(tx) } as any);
  const input = { displayName: 'New rider', email: 'rider@example.com', password: 'A secure passphrase 123!', role: 'RIDER', employeeCode: 'r123' };
  await service.save(null, input, actor);
  assert.equal(created.data.organizationId, 'company'); assert.equal(created.data.rider.create.employeeCode, 'R123');
  assert.notEqual(created.data.passwordHash, input.password); assert.match(created.data.passwordHash, /^\$2/);
  assert.equal(created.select.passwordHash, undefined); assert.equal(rolePermissions.data.length, 7);
  await assert.rejects(service.save(null, { ...input, role: 'SHOP', customerId: 'other-org-shop' }, actor), /Select a shop/);
  await assert.rejects(service.save(null, { ...input, password: '😀'.repeat(19) }, actor), /72 UTF-8 bytes/);
});
