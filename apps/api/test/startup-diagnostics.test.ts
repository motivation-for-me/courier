import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { startupDiagnostics } from '../src/common/startup-diagnostics';

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
