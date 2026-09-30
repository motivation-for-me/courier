import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { permissionCodes } from './permission-codes';

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
    for (const organization of organizations) {
      await prisma.$transaction(async (transaction) => {
        const adminRole = await transaction.role.findUnique({ where: { organizationId_name: { organizationId: organization.id, name: 'ADMIN' } } });
        if (!adminRole) return;
        const permissions = await Promise.all(permissionCodes.map((code) => transaction.permission.upsert({
          where: { organizationId_code: { organizationId: organization.id, code } },
          create: { organizationId: organization.id, code, description: `Administrator capability: ${code}` },
          update: {},
        })));
        await transaction.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })), skipDuplicates: true });
        await transaction.auditLog.create({ data: { organizationId: organization.id, action: 'admin.permissions_synchronized', entityType: 'role', entityId: adminRole.id, newValues: { permissionCount: permissions.length } } });
      }, { timeout: 30_000 });
      console.log(`Synchronized ADMIN permissions for ${organization.name}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Permission synchronization failed');
  process.exitCode = 1;
});
