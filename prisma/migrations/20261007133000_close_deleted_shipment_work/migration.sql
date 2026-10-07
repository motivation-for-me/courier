-- Soft-deleted shipments must never remain in a rider's active workload.
UPDATE "RiderAssignment" AS assignment
SET "status" = 'ENDED', "endedAt" = COALESCE(assignment."endedAt", CURRENT_TIMESTAMP)
FROM "Consignment" AS consignment
WHERE assignment."consignmentId" = consignment."id"
  AND assignment."status" = 'ACTIVE'
  AND consignment."deletedAt" IS NOT NULL;

UPDATE "Pickup" AS pickup
SET "status" = 'CANCELLED',
    "failureReason" = COALESCE(pickup."failureReason", 'Shipment removed by administrator')
FROM "Consignment" AS consignment
WHERE pickup."consignmentId" = consignment."id"
  AND pickup."status" IN ('REQUESTED', 'ASSIGNED', 'IN_PROGRESS')
  AND consignment."deletedAt" IS NOT NULL;
