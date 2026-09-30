# Shop financial model audit

Date: 2026-09-30

## Existing functionality

- `Customer` is the shop/merchant and `Consignment.customerId` links shipments to it.
- `Payment` records the amount collected from a receiver, method, verification state, collector, proof, and timestamps.
- `CodTransaction` records expected/collected COD and collection metadata.
- `CodSettlement` records COD remittance from a rider toward a branch. It is not a merchant payout.
- Payment proof, payment decisions, COD settlement actions, and audit logs already exist.
- Admin payment and settlement permissions already exist.

## Missing functionality

- No shop-specific or versioned pricing agreement.
- No immutable shipment charge/cost/adjustment ledger.
- No merchant/shop payout record or allocation to shipments.
- No authoritative revenue, cost, payable, outstanding, or profit calculation.
- No date-filtered shop financial API or traceable shipment drill-down.
- Shipment creation currently hard-codes `AED`, while the active business examples and phone rules indicate Pakistan/PKR.

## Reuse decisions

- Reuse `Customer`, `Consignment`, `Payment`, `CodTransaction`, payment proof, users, and audit logs.
- Keep `CodSettlement` for operational COD custody/remittance; do not reinterpret it as payment to a shop.
- Derive receiver COD collected from verified cash `Payment` records. Do not count pending or rejected payments as collected cash.

## New normalized records

- `ShopPricingAgreement`: versioned effective-dated shop pricing. Initial fields cover shipment charge, fixed COD fee, percentage COD fee, return charge, and currency. A new version is created instead of overwriting historical pricing.
- `ShipmentFinancialEntry`: immutable shipment ledger entries categorized as courier revenue, courier cost, or shop-payable adjustment. Corrections are additional adjustment entries with actor, timestamp, and reason.
- `ShopSettlement`: a payment made to a shop.
- `ShopSettlementAllocation`: the part of a settlement allocated to a specific shipment, enabling exact drill-down and preventing magic totals.

## Calculation contract

For shipments in the selected date range:

- Courier revenue = sum of revenue ledger entries.
- Courier cost = sum of cost ledger entries.
- Profit = courier revenue minus courier cost.
- COD collected = sum of verified cash receiver payments.
- Shop payable = COD collected minus revenue entries marked `deductFromShop`, plus shop-payable adjustments.
- Paid to shop = settlement allocations for those shipments.
- Outstanding = shop payable minus paid to shop.

Every summary response includes shipment-level rows and underlying ledger/settlement records. Financial calculations are performed in NestJS. No calculated totals are stored on `Customer`.

## Recognition and history

- The pricing agreement effective when a shipment is created is snapshotted into shipment ledger entries.
- Updating shop pricing creates a new agreement version and closes the previous version; old shipments do not change.
- Corrections append adjustment entries rather than modifying historical amounts.
- All configuration, entry, and settlement mutations create audit records.

## Access

- Admin can configure pricing, add costs/adjustments, record shop settlements, and see all financial detail.
- Shop managers can be given a separate read-only financial permission later. This first implementation keeps authoritative financial endpoints Admin-only to avoid exposing courier cost/profit accidentally.
