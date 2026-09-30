ALTER TABLE "User" ADD COLUMN "customerId" TEXT;

CREATE INDEX "User_organizationId_customerId_isActive_idx" ON "User"("organizationId", "customerId", "isActive");

ALTER TABLE "User"
ADD CONSTRAINT "User_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
