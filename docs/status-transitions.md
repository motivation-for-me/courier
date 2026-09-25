# Status Transitions and Operational Commands

## Consignment Lifecycle

The canonical forward lifecycle is:

```text
BOOKED
  -> VERIFIED
  -> MANIFESTED
  -> DISPATCHED
  -> IN_TRANSIT
  -> RECEIVED
  -> ASSIGNED_TO_RIDER
  -> OUT_FOR_DELIVERY
  -> DELIVERED
```

Exception states are controlled branches, not arbitrary values:

- `DELIVERY_ATTEMPT_FAILED`: an attempted delivery did not complete and a `DeliveryAttempt` is required.
- `HELD`: operational hold, quarantine, compliance, address, payment, or discrepancy review.
- `DAMAGED`: damage recorded and investigation/handling required.
- `LOST`: loss recorded and investigation required.
- `RETURNED` / `RTO`: return workflow completed or shipment returned under policy.
- `CANCELLED`: cancellation accepted before an irreversible operational point or by authorized override.

The exact transition policy is a backend domain policy, not a controller switch statement.

## Allowed Commands

| Command | Required current state | Result |
|---|---|---|
| Book | none | Creates CN and `BOOKED` event |
| Verify | `BOOKED` | Validates data, weight/package facts, and records `VERIFIED` |
| Add to manifest | `VERIFIED` | Adds a manifest item; consignment becomes `MANIFESTED` when the domain rule is satisfied |
| Dispatch manifest | manifest `SEALED` and item eligible | Consignments become `DISPATCHED`; records dispatch and custody events |
| Mark in transit | `DISPATCHED` | Records `IN_TRANSIT` at the moving facility/transfer |
| Receive | `IN_TRANSIT` | Records destination receipt and `RECEIVED` |
| Assign rider | `RECEIVED` and rider eligible | Creates active `RiderAssignment` and `ASSIGNED_TO_RIDER` |
| Start delivery | `ASSIGNED_TO_RIDER` and actor is assigned rider or authorized operator | Records `OUT_FOR_DELIVERY` |
| Record failed attempt | `OUT_FOR_DELIVERY` | Creates immutable attempt and moves to `DELIVERY_ATTEMPT_FAILED` or configured retry state |
| Complete delivery | `OUT_FOR_DELIVERY` or approved retry state | Verifies rider scope, OTP, payment/COD policy, creates attempt/event, and sets `DELIVERED` transactionally |
| Hold | eligible non-final state | Records reason and `HELD` |
| Release hold | `HELD` | Returns to the explicitly approved prior/next workflow state |
| Initiate RTO | eligible exception/retry state | Creates return record and controlled `RETURNED`/RTO flow |
| Cancel | policy-eligible non-final state | Records reason and `CANCELLED` |

The command service must reject missing prerequisites, invalid state, duplicate active assignment, unauthorized scope, and final-state mutation with controlled business errors.

## Delivery Completion Transaction

Delivery completion is one database transaction that, as applicable:

1. Locks and reloads the consignment and active assignment.
2. Verifies actor authentication, role/permission, organization/branch scope, rider assignment, state, OTP, and COD/payment requirements.
3. Creates the delivery attempt with a unique attempt/idempotency reference.
4. Records payment collection and COD custody movement when required.
5. Updates current consignment state to `DELIVERED`.
6. Appends the `DELIVERED` tracking event.
7. Creates audit records and queues notifications/documents after commit.

No partial delivery completion is acceptable.

## Idempotency

Commands exposed to unreliable clients accept an idempotency key scoped to actor, organization, command, and resource. A repeated request returns the original result if the request fingerprint matches. A reused key with a different payload is rejected. Unique constraints and transaction locks backstop the application logic.

Required candidates include delivery completion, payment recording, manifest receiving, scan ingestion, and OTP verification.

## History Rules

Tracking events and delivery attempts are append-oriented. Corrections use compensating events or authorized correction records. The current status is not a replacement for the event history and must never be edited directly by a generic update endpoint.

## Human-Readable UI Labels

The API may expose stable enum codes and localized display labels. The UI should present labels such as Booked, Verified, Manifested, In Transit, Out for Delivery, Delivered, Attempt Failed, Returned, Held, Damaged, Lost, and Cancelled. Labels must not create additional backend states.
