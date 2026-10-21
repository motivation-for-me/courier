import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';

function loadRepositoryEnvironment() {
  if (process.env.DATABASE_URL) return;

  // npm workspaces execute this package from apps/api, while production
  // containers commonly execute it from the repository root. Support both
  // locations without copying secrets into the application directory.
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
  }
}

function requireRuntimeConfiguration() {
  for (const name of ['DATABASE_URL', 'JWT_SECRET'] as const) {
      const value = process.env[name]?.trim();
      if (!value) throw new Error(`${name} must be configured`);
      if (name === 'JWT_SECRET' && value.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  }
    const isProduction = process.env.NODE_ENV === 'production';
  const port = Number(process.env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid TCP port');
    const configuredOrigins = process.env.WEB_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
    if (isProduction && configuredOrigins.length === 0) throw new Error('WEB_ORIGIN must be configured in production');
    const webOrigins = (configuredOrigins.length ? configuredOrigins : ['http://localhost:3000']).map((origin) => {
      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error('WEB_ORIGIN contains an invalid origin');
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) {
        throw new Error('WEB_ORIGIN contains an invalid origin');
      }
      return parsed.origin;
    });
    return { port, webOrigins, isProduction };
}

async function createApplication() {
  loadRepositoryEnvironment();
  const configuration = requireRuntimeConfiguration();
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.use(helmet({ contentSecurityPolicy: false }));
  app.setGlobalPrefix('api/v1');
  if (!configuration.isProduction) {
    const swaggerConfig = new DocumentBuilder().setTitle('Courier Management API').setVersion('1.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }
  app.enableCors({
    origin: configuration.webOrigins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Idempotency-Key',
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  try {
    await app.init();
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
  return app;
}

let application: Promise<INestApplication> | undefined;
function getApplication() {
  // Export a callable handler immediately. Vercel must not have to wait for a
  // database connection or a background app.listen() before finding the server.
  if (!application) application = createApplication().catch((error: unknown) => {
    application = undefined;
    throw error;
  });
  return application;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    const app = await getApplication();
    app.getHttpAdapter().getInstance()(request, response);
  } catch (error) {
    // Keep connection strings and other configuration values out of responses
    // and startup logs. Allow a later invocation to retry initialization.
    console.error('Courier API initialization failed', error instanceof Error ? error.name : 'UnknownError');
    if (!response.headersSent) {
      response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': '5' });
      response.end(JSON.stringify({ statusCode: 503, message: 'Courier API could not start. Check the API service logs and configuration.' }));
    }
  }
}

if (require.main === module && process.env.VERCEL !== '1') {
  void getApplication().then((app) => app.listen(Number(process.env.PORT ?? process.env.API_PORT ?? 3001))).catch((error: unknown) => {
    console.error('Courier API startup failed', error instanceof Error ? error.name : 'UnknownError');
    process.exitCode = 1;
  });
}
