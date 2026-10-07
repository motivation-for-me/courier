-- A shipment can have at most one live rider assignment. Historical ended
-- assignments remain unrestricted.
CREATE UNIQUE INDEX "RiderAssignment_one_active_per_consignment"
ON "RiderAssignment" ("consignmentId")
WHERE "status" = 'ACTIVE';

-- Pricing is versioned. A shop may retain any number of historical agreements,
-- but only one agreement can be current at a time.
CREATE UNIQUE INDEX "ShopPricingAgreement_one_current_per_customer"
ON "ShopPricingAgreement" ("customerId")
WHERE "effectiveTo" IS NULL;
