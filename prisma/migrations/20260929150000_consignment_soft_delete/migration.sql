ALTER TABLE "Consignment" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Consignment_organizationId_deletedAt_createdAt_idx" ON "Consignment"("organizationId", "deletedAt", "createdAt");
