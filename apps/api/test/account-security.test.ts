import { test } from 'node:test';
process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
process.env.GOOGLE_AUTH_ENABLED = 'true';
process.env.ACCOUNT_EMAIL_ENABLED = 'true';
process.env.RESEND_API_KEY = 'test-key';
process.env.EMAIL_FROM = 'test@example.com';
import * as assert from 'node:assert/strict';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthGuard } from '../src/modules/auth/auth.guard';
import { CustomersService } from '../src/modules/customers/customers.service';
import { OAuth2Client } from 'google-auth-library';
import { sendAccountEmail } from '../src/modules/auth/account-email';

test('correct password does not bypass email verification', async () => {
  const prisma: any = { user: { findMany: async () => [{ passwordHash: await bcrypt.hash('correct-password', 4), emailVerifiedAt: null }] } };
  await assert.rejects(new AuthService(prisma, {} as any).login({ email: 'shop@example.com', password: 'correct-password' }), /Verify your email/);
});

test('shop permissions are restricted to the per-account allowlist', () => {
  const user: any = { id: 'shop', organizationId: 'company', authVersion: 3, shopPermissions: ['shipment:view'], roles: [{ role: { name: 'SHOP', permissions: ['shipment:view', 'shipment:create', 'documents:view'].map((code) => ({ permission: { code } })) } }] };
  const profile = new AuthService({} as any, {} as any).toAuthenticatedUser(user);
  assert.deepEqual(profile.permissions, ['shipment:view']);
  assert.equal(profile.authVersion, 3);
});

test('password reset rejects expired, wrong-purpose and consumed links', async () => {
  for (const patch of [{ consumedAt: new Date() }, { expiresAt: new Date(0) }, { purpose: 'VERIFY_EMAIL' }]) {
    const action = { userId: 'user', purpose: 'RESET_PASSWORD', expiresAt: new Date(Date.now() + 60000), consumedAt: null, user: { isActive: true }, ...patch };
    const transaction: any = { emailAction: { findUnique: async () => action } };
    const prisma: any = { $transaction: (callback: any) => callback(transaction) };
    await assert.rejects(new AuthService(prisma, {} as any).consumeEmail('token', 'RESET_PASSWORD', 'a-new-password'), /invalid or expired/);
  }
});

test('verification claims a token atomically and rejects a concurrent second claim', async () => {
  const transaction: any = { emailAction: {
    findUnique: async () => ({ id: 'action', userId: 'user', purpose: 'VERIFY_EMAIL', expiresAt: new Date(Date.now() + 60000), consumedAt: null, user: { isActive: true } }),
    updateMany: async () => ({ count: 0 }),
  } };
  await assert.rejects(new AuthService({ $transaction: (callback: any) => callback(transaction) } as any, {} as any).consumeEmail('token', 'VERIFY_EMAIL'), /already been used/);
});

test('password reset verifies mailbox ownership and revokes old sessions and reset links', async () => {
  let data: any; let sessions = false; let invalidated = false;
  const transaction: any = {
    emailAction: {
      findUnique: async () => ({ id: 'action', userId: 'user', purpose: 'RESET_PASSWORD', expiresAt: new Date(Date.now() + 60000), consumedAt: null, user: { isActive: true, organizationId: 'company' } }),
      updateMany: async ({ where }: any) => { if (where.purpose === 'RESET_PASSWORD') invalidated = true; return { count: 1 }; },
    },
    user: { update: async (query: any) => { data = query.data; } },
    authSession: { updateMany: async () => { sessions = true; } }, auditLog: { create: async () => ({}) },
  };
  const prisma: any = { $transaction: (callback: any) => callback(transaction) };
  await new AuthService(prisma, {} as any).consumeEmail('token', 'RESET_PASSWORD', 'a-new-password');
  assert.equal(await bcrypt.compare('a-new-password', data.passwordHash), true);
  assert.ok(data.emailVerifiedAt instanceof Date);
  assert.deepEqual(data.authVersion, { increment: 1 });
  assert.equal(sessions && invalidated, true);
});

test('guard rejects an old access token after an admin access change', async () => {
  const request: any = { headers: { authorization: 'Bearer token' } };
  const context: any = { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => request }) };
  const guard = new AuthGuard({ verifyAsync: async () => ({ id: 'user', organizationId: 'company', authVersion: 0 }) } as any, { getAllAndOverride: () => false } as any, { currentUser: async () => ({ id: 'user', organizationId: 'company', authVersion: 1 }) } as any);
  await assert.rejects(guard.canActivate(context), /access changed/);
});

test('non-admin cannot change a shop account', async () => {
  const actor: any = { id: 'shop', organizationId: 'company', roles: ['SHOP'] };
  await assert.rejects(new CustomersService({} as any).updateShopUser('customer', 'user', { isActive: false }, actor), /Administrator access required/);
});

test('Google login rejects unverified or non-authoritative unlinked identities', async () => {
  const savedClientId = process.env.GOOGLE_CLIENT_ID;
  const originalVerify = OAuth2Client.prototype.verifyIdToken;
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  try {
    for (const email_verified of [false, true]) {
      OAuth2Client.prototype.verifyIdToken = (async () => ({ getPayload: () => ({ sub: 'google-user', email: 'person@example.com', email_verified }) })) as any;
      const prisma: any = { user: { findUnique: async () => null } };
      await assert.rejects(new AuthService(prisma, {} as any).googleLogin('credential'), email_verified ? /Use email and password/ : /verified Google email/);
    }
  } finally { OAuth2Client.prototype.verifyIdToken = originalVerify; if (savedClientId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = savedClientId; }
});

test('verification cannot be used after the account email address changes', async () => {
  const transaction: any = { emailAction: { findUnique: async () => ({ purpose: 'VERIFY_EMAIL', emailAddress: 'old@example.com', expiresAt: new Date(Date.now() + 60000), consumedAt: null, user: { isActive: true, email: 'new@example.com' } }) } };
  const prisma: any = { $transaction: (callback: any) => callback(transaction) };
  await assert.rejects(new AuthService(prisma, {} as any).consumeEmail('token', 'VERIFY_EMAIL'), /invalid or expired/);
});

test('Resend email uses the configured website and keeps the token in a fragment', async () => {
  const previous = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, origin: process.env.APP_PUBLIC_URL };
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key'; process.env.EMAIL_FROM = 'accounts@example.com'; process.env.APP_PUBLIC_URL = 'https://courier.example';
  try {
    globalThis.fetch = (async (url: any, options: any) => {
      assert.equal(url, 'https://api.resend.com/emails');
      const body = JSON.parse(options.body);
      assert.deepEqual(body.to, ['shop@example.com']);
      assert.ok(body.text.includes('https://courier.example/account/verify#token=secret-token'));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    await sendAccountEmail('shop@example.com', 'VERIFY_EMAIL', 'secret-token');
    globalThis.fetch = (async () => new Response('{}', { status: 403 })) as typeof fetch;
    await assert.rejects(sendAccountEmail('shop@example.com', 'RESET_PASSWORD', 'secret-token'), /could not be sent/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({ RESEND_API_KEY: previous.key, EMAIL_FROM: previous.from, APP_PUBLIC_URL: previous.origin })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

 test('legacy accounts can sign in without mailbox verification when temporarily disabled', async () => {
  process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
  try {
    const user: any = { id: 'admin', organizationId: 'company', emailVerifiedAt: null, authVersion: 0, passwordHash: await bcrypt.hash('correct-password', 4), roles: [{ role: { name: 'ADMIN', permissions: [] } }] };
    const prisma: any = { user: { findMany: async () => [user] }, authSession: { create: async () => ({}) } };
    const session = await new AuthService(prisma, { signAsync: async () => 'token' } as any).login({ email: 'legacy-admin', password: 'correct-password' });
    assert.equal(session.accessToken, 'token');
    assert.equal((await new AuthService({ user: { findFirst: async () => user } } as any, {} as any).currentUser('admin')).id, 'admin');
  } finally { process.env.REQUIRE_EMAIL_VERIFICATION = 'true'; }
});
 test('disabled Google authentication rejects requests even when credentials exist', async () => {
  process.env.GOOGLE_AUTH_ENABLED = 'false';
  try { await assert.rejects(new AuthService({} as any, {} as any).googleLogin('credential'), /temporarily disabled/); }
  finally { process.env.GOOGLE_AUTH_ENABLED = 'true'; }
});

test('linked Google identity cannot sign in after its email differs from the administrator-approved account', async () => {
  const previous = process.env.GOOGLE_CLIENT_ID;
  const originalVerify = OAuth2Client.prototype.verifyIdToken;
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  try {
    OAuth2Client.prototype.verifyIdToken = (async () => ({ getPayload: () => ({ sub: 'linked-google-user', email: 'old@gmail.com', email_verified: true }) })) as any;
    const prisma: any = { user: { findUnique: async () => ({ isActive: true, email: 'approved@gmail.com' }) } };
    await assert.rejects(new AuthService(prisma, {} as any).googleLogin('credential'), /match the account email/);
  } finally {
    OAuth2Client.prototype.verifyIdToken = originalVerify;
    if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = previous;
  }
});
