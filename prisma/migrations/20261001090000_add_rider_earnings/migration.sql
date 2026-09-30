CREATE TYPE "RiderEarningStatus" AS ENUM ('PENDING', 'PAID', 'VOIDED');

ALTER TABLE "Rider" ADD COLUMN "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "RiderEarning" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "consignmentId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "status" "RiderEarningStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiderEarning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RiderEarning_consignmentId_key" ON "RiderEarning"("consignmentId");
CREATE INDEX "RiderEarning_organizationId_status_createdAt_idx" ON "RiderEarning"("organizationId", "status", "createdAt");
CREATE INDEX "RiderEarning_riderId_status_createdAt_idx" ON "RiderEarning"("riderId", "status", "createdAt");
ALTER TABLE "RiderEarning" ADD CONSTRAINT "RiderEarning_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RiderEarning" ADD CONSTRAINT "RiderEarning_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "Rider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RiderEarning" ADD CONSTRAINT "RiderEarning_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
