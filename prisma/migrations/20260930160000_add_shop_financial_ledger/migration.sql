CREATE TYPE "FinancialEntryCategory" AS ENUM ('REVENUE', 'COST', 'SHOP_PAYABLE_ADJUSTMENT');
CREATE TYPE "FinancialEntryType" AS ENUM ('SHIPPING_CHARGE', 'COD_FEE', 'RETURN_CHARGE', 'OTHER_CHARGE', 'DELIVERY_COST', 'OTHER_COST', 'ADJUSTMENT');
CREATE TYPE "ShopSettlementStatus" AS ENUM ('PAID', 'VOIDED');

CREATE TABLE "ShopPricingAgreement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "shipmentCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "codFeeFixed" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "codFeePercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "returnCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "deductChargesFromCod" BOOLEAN NOT NULL DEFAULT true,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopPricingAgreement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShipmentFinancialEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "consignmentId" TEXT NOT NULL,
  "category" "FinancialEntryCategory" NOT NULL,
  "type" "FinancialEntryType" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "deductFromShop" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "reference" TEXT,
  "pricingAgreementId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentFinancialEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopSettlement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "status" "ShopSettlementStatus" NOT NULL DEFAULT 'PAID',
  "paidAt" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "remarks" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopSettlementAllocation" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "consignmentId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopSettlementAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShopPricingAgreement_customerId_effectiveFrom_effectiveTo_idx" ON "ShopPricingAgreement"("customerId", "effectiveFrom", "effectiveTo");
CREATE INDEX "ShopPricingAgreement_organizationId_effectiveFrom_idx" ON "ShopPricingAgreement"("organizationId", "effectiveFrom");
CREATE INDEX "ShipmentFinancialEntry_customerId_createdAt_idx" ON "ShipmentFinancialEntry"("customerId", "createdAt");
CREATE INDEX "ShipmentFinancialEntry_consignmentId_category_idx" ON "ShipmentFinancialEntry"("consignmentId", "category");
CREATE INDEX "ShipmentFinancialEntry_organizationId_createdAt_idx" ON "ShipmentFinancialEntry"("organizationId", "createdAt");
CREATE INDEX "ShopSettlement_customerId_paidAt_status_idx" ON "ShopSettlement"("customerId", "paidAt", "status");
CREATE INDEX "ShopSettlement_organizationId_paidAt_idx" ON "ShopSettlement"("organizationId", "paidAt");
CREATE UNIQUE INDEX "ShopSettlementAllocation_settlementId_consignmentId_key" ON "ShopSettlementAllocation"("settlementId", "consignmentId");
CREATE INDEX "ShopSettlementAllocation_consignmentId_idx" ON "ShopSettlementAllocation"("consignmentId");

ALTER TABLE "ShopPricingAgreement" ADD CONSTRAINT "ShopPricingAgreement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopPricingAgreement" ADD CONSTRAINT "ShopPricingAgreement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopPricingAgreement" ADD CONSTRAINT "ShopPricingAgreement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentFinancialEntry" ADD CONSTRAINT "ShipmentFinancialEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentFinancialEntry" ADD CONSTRAINT "ShipmentFinancialEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentFinancialEntry" ADD CONSTRAINT "ShipmentFinancialEntry_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentFinancialEntry" ADD CONSTRAINT "ShipmentFinancialEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentFinancialEntry" ADD CONSTRAINT "ShipmentFinancialEntry_pricingAgreementId_fkey" FOREIGN KEY ("pricingAgreementId") REFERENCES "ShopPricingAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopSettlement" ADD CONSTRAINT "ShopSettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopSettlement" ADD CONSTRAINT "ShopSettlement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopSettlement" ADD CONSTRAINT "ShopSettlement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopSettlementAllocation" ADD CONSTRAINT "ShopSettlementAllocation_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ShopSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopSettlementAllocation" ADD CONSTRAINT "ShopSettlementAllocation_consignmentId_fkey" FOREIGN KEY ("consignmentId") REFERENCES "Consignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
