-- The public application has exactly ADMIN, SHOP and RIDER roles.
-- Merge the former SHOP_MANAGER role into SHOP without losing assignments.
DO $$
DECLARE
  manager_role RECORD;
  shop_role_id TEXT;
BEGIN
  FOR manager_role IN
    SELECT "id", "organizationId" FROM "Role" WHERE "name" = 'SHOP_MANAGER'
  LOOP
    SELECT "id" INTO shop_role_id
    FROM "Role"
    WHERE "organizationId" = manager_role."organizationId" AND "name" = 'SHOP';

    IF shop_role_id IS NULL THEN
      UPDATE "Role"
      SET "name" = 'SHOP', "description" = 'Shop user restricted to the linked shop'
      WHERE "id" = manager_role."id";
    ELSE
      INSERT INTO "UserRole" ("userId", "roleId", "organizationId")
      SELECT "userId", shop_role_id, "organizationId"
      FROM "UserRole"
      WHERE "roleId" = manager_role."id"
      ON CONFLICT ("userId", "roleId") DO NOTHING;

      INSERT INTO "RolePermission" ("roleId", "permissionId")
      SELECT shop_role_id, "permissionId"
      FROM "RolePermission"
      WHERE "roleId" = manager_role."id"
      ON CONFLICT ("roleId", "permissionId") DO NOTHING;

      DELETE FROM "UserRole" WHERE "roleId" = manager_role."id";
      DELETE FROM "RolePermission" WHERE "roleId" = manager_role."id";
      DELETE FROM "Role" WHERE "id" = manager_role."id";
    END IF;
  END LOOP;
END $$;

-- OTP delivery verification is intentionally not part of this product.
DROP TABLE IF EXISTS "OtpChallenge";

-- Refresh tokens and COD transactions are single-use financial/auth records.
CREATE UNIQUE INDEX "AuthSession_refreshHash_key" ON "AuthSession"("refreshHash");
DROP INDEX IF EXISTS "CodSettlement_codTransactionId_settledAt_idx";
CREATE UNIQUE INDEX "CodSettlement_codTransactionId_key" ON "CodSettlement"("codTransactionId");
