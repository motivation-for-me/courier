ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Rider" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "User_organizationId_deletedAt_displayName_idx" ON "User"("organizationId", "deletedAt", "displayName");
CREATE INDEX "Rider_organizationId_deletedAt_idx" ON "Rider"("organizationId", "deletedAt");
CREATE TABLE "RecycleBinItem" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL,
 "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL, "label" TEXT NOT NULL,
 "snapshot" JSONB NOT NULL, "deletedById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "restoredAt" TIMESTAMP(3), "restoredById" TEXT
);
CREATE INDEX "RecycleBinItem_organizationId_restoredAt_createdAt_idx" ON "RecycleBinItem"("organizationId", "restoredAt", "createdAt");
CREATE UNIQUE INDEX "RecycleBinItem_active_entity" ON "RecycleBinItem"("organizationId", "entityType", "entityId") WHERE "restoredAt" IS NULL;
INSERT INTO "RecycleBinItem" ("id", "organizationId", "entityType", "entityId", "label", "snapshot", "deletedById", "createdAt")
SELECT 'legacy-shipment-' || "id", "organizationId", 'SHIPMENT', "id", "cnNumber", jsonb_build_object('status', "status"), "bookedById", "deletedAt"
FROM "Consignment" WHERE "deletedAt" IS NOT NULL;
