ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "googleSubject" TEXT,
  ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "shopPermissions" TEXT[] NOT NULL DEFAULT ARRAY['shipment:create','shipment:view','customer:view','documents:view','documents:create']::TEXT[];
CREATE UNIQUE INDEX "User_googleSubject_key" ON "User"("googleSubject");
CREATE TABLE "EmailAction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "emailAddress" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailAction_tokenHash_key" ON "EmailAction"("tokenHash");
CREATE INDEX "EmailAction_userId_purpose_expiresAt_idx" ON "EmailAction"("userId", "purpose", "expiresAt");
ALTER TABLE "EmailAction" ADD CONSTRAINT "EmailAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
