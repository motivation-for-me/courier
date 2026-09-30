import * as bcrypt from 'bcrypt';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { permissionCodes } from './permission-codes';

function loadRepositoryEnvironment() {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  loadRepositoryEnvironment();
  const email = required('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const password = required('BOOTSTRAP_ADMIN_PASSWORD');
  const organizationName = required('BOOTSTRAP_ORGANIZATION_NAME');
  const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || email.split('@')[0];
  const organizationCode = (process.env.BOOTSTRAP_ORGANIZATION_CODE?.trim() || organizationName)
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
  if (!organizationCode) throw new Error('BOOTSTRAP_ORGANIZATION_CODE is invalid');

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.upsert({
        where: { code: organizationCode },
        create: { code: organizationCode, name: organizationName, timezone: 'Asia/Karachi' },
        update: {},
      });
      const existingUser = await tx.user.findUnique({ where: { organizationId_email: { organizationId: organization.id, email } } });

      const permissions = await Promise.all(permissionCodes.map((code) => tx.permission.upsert({
        where: { organizationId_code: { organizationId: organization.id, code } },
        create: { organizationId: organization.id, code, description: `Bootstrap administrator capability: ${code}` },
        update: {},
      })));
      const adminRole = await tx.role.upsert({
        where: { organizationId_name: { organizationId: organization.id, name: 'ADMIN' } },
        create: { organizationId: organization.id, name: 'ADMIN', description: 'Organization administrator' },
        update: {},
      });
      await tx.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })), skipDuplicates: true });

      const user = existingUser ?? await tx.user.create({ data: { organizationId: organization.id, email, displayName, passwordHash: await bcrypt.hash(password, 12) } });
      await tx.userRole.createMany({ data: [{ userId: user.id, roleId: adminRole.id, organizationId: organization.id }], skipDuplicates: true });
      await tx.auditLog.create({ data: { organizationId: organization.id, actorId: user.id, action: existingUser ? 'admin.bootstrap_synchronized' : 'admin.bootstrap_created', entityType: 'user', entityId: user.id, newValues: { email, role: 'ADMIN' } } });
    }, { timeout: 15000 });
    console.log(`Administrator account and permissions synchronized for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Administrator bootstrap failed');
  process.exitCode = 1;
});
