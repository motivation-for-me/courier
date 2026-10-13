ALTER TYPE "RiderEarningStatus" ADD VALUE IF NOT EXISTS 'SENT';
ALTER TYPE "RiderEarningStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';
ALTER TABLE "RiderEarning" ALTER COLUMN "consignmentId" DROP NOT NULL;
ALTER TABLE "RiderEarning"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DELIVERY',
  ADD COLUMN "note" TEXT,
  ADD COLUMN "sentById" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "confirmedById" TEXT,
  ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "RiderEarning" ADD CONSTRAINT "RiderEarning_amount_nonnegative" CHECK ("amount" >= 0);
