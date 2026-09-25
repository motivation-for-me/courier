# Courier Domain Model

## Aggregate Overview

The `Consignment` is the central operational aggregate. It owns the public CN, parties, route, package summary, service selection, payment relationship, current operational state, and references to operational history. High-volume histories are separate append-oriented records.

Internal primary keys are opaque UUIDs. Public identifiers such as CN, manifest number, and return number are separately generated and unique within the required organization scope.

## Organizational Scope

- `Organization`: tenant and operating boundary.
- `Branch`: booking, delivery, or administrative facility belonging to an organization.
- `Hub`: sorting or transit facility belonging to an organization and optionally a branch/region.
- `Location`: normalized geographic or operational location used by addresses and events.
- `User`: authenticated human or service actor.
- `Rider`: operational profile linked to a user, with active status, home branch, vehicle details, and assignment eligibility.

Every operational record that requires isolation carries an organization relationship directly or through a constrained parent relationship. Branch and hub scope are represented explicitly rather than inferred from display labels.

## Party and Address Model

- `Customer`: shipper, account customer, recipient, or customer portal identity as applicable.
- `CustomerAddress`: reusable address owned by a customer.
- `ConsignmentParty`: immutable booking-time snapshot of sender and receiver identity/contact data, plus optional customer reference.
- `ConsignmentAddress`: immutable booking-time snapshot of origin and destination address, branch/hub, zone, landmarks, and delivery notes.

Snapshots preserve the historical booking truth when a customer later changes a profile or address.

## Consignment and Package Model

`Consignment` includes:

- public `cn_number`, organization, booking actor, service type, origin, destination, current status, current location, assigned active rider reference where applicable, and lifecycle timestamps;
- sender and receiver party/address references or snapshots;
- payment and COD summary references without duplicating the financial ledger;
- cancellation/hold/exception information through explicit records or controlled fields.

`ConsignmentPackage` represents each package/colli. It stores measured dimensions, physical weight, volumetric weight, chargeable weight, handling flags, declared value, and package reference. `ConsignmentItem` is optional line-level content metadata and must not be used as a substitute for packages.

## History and Operational Records

- `TrackingEvent`: append-only event type, event time, location, branch/hub, rider, actor, remarks, metadata, and idempotency reference.
- `DeliveryAttempt`: one record per attempt, including attempt number, rider, reason, outcome, timestamp, location, remarks, and actor.
- `RiderAssignment`: explicit assignment and reassignment history with assigned rider, scope, actor, start/end times, reason, and active flag.
- `Pickup` and `PickupItem`: pickup request, scheduling, assignment, collection result, and links to booked consignments.
- `Manifest` and `ManifestItem`: operational grouping with origin, destination, lifecycle state, expected/received counts, seal information, and item-level receive/reconcile state.
- `Transfer`: controlled movement between facilities or operational custody points, linked to a manifest where applicable.

A scan is an operation that identifies a record and then invokes a permission-checked domain command. A barcode scan alone never grants access or changes state.

## Manifest Model

A manifest has its own lifecycle and does not reuse consignment status:

`DRAFT -> SEALED -> DISPATCHED -> RECEIVED -> RECONCILED`

A manifest item tracks expected, scanned/received, missing, excess/unlisted, diverted, and discrepancy information. Receiving is transactional and auditable. Expected and received counts are derived from manifest items and may be cached only as controlled projections.

## Payment and COD Model

`Payment` is separate from the consignment and supports amount, currency, method, status, reference, collector/verifier, timestamps, and remarks. `PaymentProof` stores validated file metadata and review decisions; upload sets `PROOF_UPLOADED` only and never verifies payment.

`CodTransaction` records expected, collected, pending, adjusted, and settled amounts, custody actor, collection location, and related payment. `CodSettlement` records rider-to-branch and branch-to-accounts handoffs, reconciliation, variance, approval, and timestamps. Financial records are append-oriented; corrections are adjustments with reasons, not destructive edits.

## Return/RTO Model

`Return` references the original consignment and has its own public return number, reason, failed-attempt context, processing state, destination, and tracking history. `ReturnAttempt` records return movement or delivery attempts. Returning does not reset or overwrite the original consignment history.

## Documents and Other Records

- `Document`: backend-generated or uploaded document metadata, owner, type, version, checksum, storage key, and access policy.
- `Notification`: recipient, channel, template, delivery status, retries, and provider reference.
- `AuditLog`: actor, action, entity, old/new values, IP, user agent/device, timestamp, and organization scope.
- `Setting`: organization or location-scoped configuration with typed value, version, effective time, and audit trail.

## Persistence Constraints

Use foreign keys, unique constraints, check constraints for non-negative monetary/weight values, indexes on organization and scope fields, CN and manifest-number uniqueness, and indexes for current status, current location, rider, event time, manifest, COD settlement, and audit queries. Use soft deletion only for reference data where recovery is meaningful; never soft-delete operational history to hide events.
