import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { databaseConnectionDiagnostics, startupDiagnostics } from '../src/common/startup-diagnostics';

test('startup diagnostics classify failures without logging arbitrary driver content', () => {
  const secret = 'postgresql://user:private-password@private-host/db';
  for (const [code, reason] of [['P1000', 'Database credentials rejected'], ['P1001', 'Database endpoint unreachable'], ['P1013', 'Invalid database connection string']]) {
    const result = startupDiagnostics({ name: 'PrismaClientInitializationError', errorCode: code, message: secret });
    assert.equal(result.reason, reason);
    assert.equal(result.code, code);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  assert.equal(startupDiagnostics({ message: `tenant/user not found ${secret}` }).reason, 'Database pooler project or user not found');
  assert.equal(startupDiagnostics({ name: secret, code: secret, message: secret }).reason, 'Unclassified startup failure');
  assert.ok(!JSON.stringify(startupDiagnostics({ name: secret, code: secret, message: secret })).includes(secret));
  assert.equal(startupDiagnostics(null).type, 'StartupError');
});

test('connection diagnostics report actual runtime target without passwords or query values', () => {
  const result = databaseConnectionDiagnostics({ DATABASE_URL: 'postgresql://postgres.projectone:hidden%40password@pooler.example.com:6543/postgres?secret=private', DIRECT_URL: 'postgresql://postgres.projecttwo:anotherpassword@other.example.com:5432/postgres' });
  assert.equal(result.runtime.username, 'postgres.projectone');
  assert.equal(result.runtime.host, 'pooler.example.com');
  assert.equal(result.runtime.port, '6543');
  assert.equal(result.migrations.username, 'postgres.projecttwo');
  const serialized = JSON.stringify(result);
  for (const secret of ['hidden', 'anotherpassword', 'private', 'postgresql://']) assert.ok(!serialized.includes(secret));
  assert.deepEqual(databaseConnectionDiagnostics({ DATABASE_URL: 'invalid-secret' }).runtime, { configured: true, validPostgresUrl: false });
  assert.deepEqual(databaseConnectionDiagnostics({}).runtime, { configured: false });
});
