process.loadEnvFile('.env');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const columns = await prisma.$queryRaw`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('RiderEarning', 'RecycleBinItem') ORDER BY table_name, ordinal_position`;
  console.log(JSON.stringify({ columns }));
  const [riders, earnings] = await Promise.all([
    prisma.rider.findMany({ select: { id: true, employeeCode: true, isActive: true, deliveryFee: true, user: { select: { displayName: true, email: true } } } }),
    prisma.riderEarning.groupBy({ by: ['riderId', 'status', 'currencyCode', 'kind'], _count: { _all: true }, _sum: { amount: true } }),
  ]);
  console.log(JSON.stringify({ directoryQueriesPassed: true, riderCount: riders.length, earningGroups: earnings.length }));
})().catch((error) => { console.error(error.code || error.name, error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; }).finally(() => prisma.$disconnect());
