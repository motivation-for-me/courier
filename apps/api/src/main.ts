import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
    if (!process.env[name]?.trim()) throw new Error(`${name} must be configured`);
  }
  const port = Number(process.env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('API_PORT must be a valid TCP port');
  const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((origin) => origin.trim()).filter(Boolean);
  return { port, webOrigins };
}

async function bootstrap() {
  loadRepositoryEnvironment();
  const configuration = requireRuntimeConfiguration();
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  const swaggerConfig = new DocumentBuilder().setTitle('Courier Management API').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  app.enableCors({
    origin: configuration.webOrigins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Idempotency-Key',
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(configuration.port);
}

void bootstrap();
