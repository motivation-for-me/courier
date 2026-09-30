ALTER TABLE "Customer" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Customer_organizationId_deletedAt_name_idx" ON "Customer"("organizationId", "deletedAt", "name");
