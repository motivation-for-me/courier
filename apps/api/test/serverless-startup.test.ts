import { test, mock } from 'node:test';
import * as assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import handler from '../src/main';

test('Vercel entrypoint exports immediately, retries failed startup and shares the initialized app across requests', async () => {
  assert.equal(typeof handler, 'function');
  const names = ['DATABASE_URL', 'JWT_SECRET', 'WEB_ORIGIN', 'NODE_ENV', 'GOOGLE_AUTH_ENABLED', 'ACCOUNT_EMAIL_ENABLED', 'REQUIRE_EMAIL_VERIFICATION'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, { DATABASE_URL: 'postgresql://test:test@localhost:5432/test', JWT_SECRET: 'test-startup-secret-at-least-thirty-two-characters', WEB_ORIGIN: 'https://courier-six-henna.vercel.app', NODE_ENV: 'production', GOOGLE_AUTH_ENABLED: 'false', ACCOUNT_EMAIL_ENABLED: 'false', REQUIRE_EMAIL_VERIFICATION: 'false' });
  const init = mock.method(PrismaService.prototype, 'onModuleInit', async () => {});
  const destroy = mock.method(PrismaService.prototype, 'onModuleDestroy', async () => {});
  const errors = mock.method(console, 'error', () => {});
  const originalCreate = NestFactory.create.bind(NestFactory);
  let attempts = 0; let app: any;
  const factory = mock.method(NestFactory, 'create', async (...args: any[]) => {
    if (++attempts === 1) throw new Error('Simulated transient startup error with sensitive detail');
    app = await originalCreate(args[0], { ...args[1], logger: false });
    return app;
  });
  const server = createServer(handler);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/api/v1`;
    const failure = await fetch(`${base}/auth/config`);
    assert.equal(failure.status, 503);
    assert.equal(failure.headers.get('retry-after'), '5');
    assert.equal((await failure.text()).includes('sensitive detail'), false);
    assert.equal(JSON.stringify(errors.mock.calls).includes('sensitive detail'), false);

    const responses = await Promise.all(Array.from({ length: 3 }, () => fetch(`${base}/auth/config`)));
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { googleClientId: null, emailEnabled: false, requireEmailVerification: false });
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    }
    assert.equal(attempts, 2, 'Concurrent requests must reuse the same initialization promise');
    assert.equal(init.mock.callCount(), 1);
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const unauthorized = await fetch(`${base}/auth/accounts`);
    assert.equal(unauthorized.status, 401, 'Protected endpoints must still require authentication');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (app) await app.close();
    init.mock.restore(); destroy.mock.restore(); factory.mock.restore(); errors.mock.restore();
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
});
