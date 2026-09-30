# Tezgam Courier Business Model

## Purpose

Tezgam is a multi-organization courier operations platform. A shipment is created once, moved through controlled operational handoffs, delivered by an assigned rider, and retained with its tracking, payment, return, and audit history.

The browser is an operations workspace. It cannot grant access, change a shipment state, assign a rider, or verify payment by itself. Every business command is evaluated by the NestJS API using the signed user's organization, role permissions, location scope, and the shipment's current state.

## Organization model

```text
Platform
└── Organization (example: Tezgam)
    ├── Branches             booking and administrative facilities
    ├── Hubs                 sorting, handoff, and transit facilities
    ├── Users and roles      staff access scoped to this organization
    ├── Riders               delivery staff linked to user accounts
    ├── Customers            sending businesses or individual senders
    └── Consignments         shipments owned by this organization
```

An organization is the primary security boundary. A Tezgam user cannot read or operate data belonging to another organization. A branch or hub assignment narrows access further; it never broadens it.

## Roles and operational ownership

Roles are database records. A role alone is not sufficient: its assigned permissions and organization/branch/hub scope determine what a user may do.

| Role | Normal initiator story | Access direction |
| --- | --- | --- |
| `SUPER_ADMIN` | Platform owner/support administrator | Cross-organization access only where an explicit organization assignment exists. Not a default role for daily operations. |
| `ADMIN` | Organization administrator, for example Tezgam's initial owner | Manages organization users, roles, settings, operational oversight, and assigned permissions. |
| `OPERATIONS_MANAGER` | Starts or oversees daily network operations | Reviews shipment flow, exceptions, branch/hub performance, and permitted operational actions. |
| `BRANCH_MANAGER` | Owns a branch's booking and handoff work | Operates only the assigned branch and its shipments/staff. |
| `HUB_MANAGER` | Owns intake, sorting, dispatch, and receipt at a hub | Operates manifests and shipments at assigned hubs. |
| `BOOKING_OPERATOR` | Starts a shipment booking for a sender/customer | Creates and verifies shipments within allowed booking scope. |
| `DISPATCH_OPERATOR` | Builds and dispatches manifests | Adds eligible shipments, seals, dispatches, and records handoffs within assigned scope. |
| `RIDER` | Performs last-mile delivery | Sees only assigned shipments; can scan, create delivery attempts, verify OTP, collect permitted payment, and complete/fail delivery. |
| `ACCOUNTANT` | Verifies payment proof and settles COD | Has finance-only access; cannot treat proof upload as payment verification automatically. |
| `CUSTOMER_SERVICE` | Handles customer shipment questions | Reads only allowed customer/shipment records and performs only specifically granted service actions. |
| `REPORT_VIEWER` | Reads approved reports | Read/export access only; no operational commands. |
| `CUSTOMER` | Tracks own shipments | May see only their own customer-linked shipments/documents and public tracking data. |

### Initial Tezgam administrator

The first Tezgam administrator should be created with the `ADMIN` role. This is organization-scoped, not a platform-wide `SUPER_ADMIN`. The bootstrap command creates the role and its currently defined operational permissions; see [INFO.md](../INFO.md#initial-administrator).

## Permission rules

Every protected request needs all of the following:

```text
valid access token
  + active user account
  + required permission
  + matching organization
  + matching branch/hub/rider scope where applicable
  + permitted shipment/manifest state
  = command accepted
```

Examples:

| Command | Typical permission | Who starts it | Main scope check |
| --- | --- | --- | --- |
| Create booking | `shipment:create` | Booking operator / admin | Organization and allowed booking branch |
| Verify booking | `shipment:verify` | Booking operator / manager | Same organization and valid `BOOKED` state |
| Cancel booking | `shipment:cancel` | Authorized manager/admin | Same organization and cancellable state |
| Create/dispatch/receive manifest | `manifest:create`, `manifest:dispatch`, `manifest:receive` | Dispatch or hub operator | Assigned origin/destination branch/hub |
| Assign rider | `delivery:assign` | Dispatch/operations manager | Rider and shipment belong to the organization and delivery scope |
| Move out for delivery | `delivery:update` | Authorized dispatch operation | Shipment is assigned to a rider |
| Deliver | `delivery:complete` | Assigned rider | Rider assignment, OTP/payment rules, and current state |
| Upload payment proof | `payment:upload_proof` | Rider/authorized staff | Organization and payment relationship |
| Verify/reject proof | `payment:verify`, `payment:reject` | Accountant/admin | Finance scope; upload alone never verifies payment |
| Settle COD | finance permission | Accountant/authorized finance staff | Transaction must be unsettled and amount reconciled |
| View documents | `documents:view` / `documents:download` | Scoped staff/customer | Shipment/customer/organization authorization |

Permission names are stable capabilities. The user interface can hide unavailable buttons, but the API is always the authority.

## Shipment story and direction

The direction means the custody route a parcel follows—not merely a map route:

```text
Sender
  → booking branch
  → origin hub
  → manifest / line-haul transit
  → destination hub
  → assigned rider
  → receiver
```

For a return-to-origin (RTO), the physical direction reverses after a failed or returned delivery. The original shipment remains intact and keeps its complete history.

### Controlled lifecycle

| Step | Status | Initiated by | Meaning |
| --- | --- | --- | --- |
| 1 | `BOOKED` | Booking operator | Shipment, sender, receiver, addresses, packages, and optional COD are recorded. A CN is generated. |
| 2 | `VERIFIED` | Authorized booking/operations staff | Booking details are checked and accepted for network handling. |
| 3 | `MANIFESTED` | Dispatch operator | Shipment is added to a manifest for a handoff or route. |
| 4 | `DISPATCHED` | Dispatch/hub operator | Sealed manifest leaves the origin location. |
| 5 | `IN_TRANSIT` | Transit operation | Shipment is moving between facilities. |
| 6 | `RECEIVED` | Destination hub operator | Destination facility receives and reconciles the shipment. |
| 7 | `ASSIGNED_TO_RIDER` | Dispatch/operations manager | Shipment is allocated to one eligible rider. |
| 8 | `OUT_FOR_DELIVERY` | Authorized delivery operation | Rider route is active. |
| 9a | `DELIVERED` | Assigned rider | Receiver OTP/payment/business rules pass and delivery is confirmed. Terminal. |
| 9b | `DELIVERY_ATTEMPT_FAILED` | Assigned rider | Delivery could not complete; reason and attempt are recorded. |
| 9c | `RETURNED` | Authorized returns process | Shipment enters return/RTO handling; original history stays visible. |
| Exception | `HELD`, `DAMAGED`, `LOST`, `CANCELLED` | Specifically authorized staff | Exception state with an audit/tracking reason. |

A shipment cannot skip arbitrary states. For example, it cannot go directly from `BOOKED` to `DELIVERED`, and a delivered shipment cannot be delivered again.

## Daily operations story

1. A booking operator receives sender/receiver/package information and creates a booking. The API creates the CN, tracking event, and audit event.
2. Authorized staff verify the booking and hand it to the origin hub.
3. Dispatch builds a manifest, scans eligible shipments, seals it, and dispatches it to the next hub.
4. The destination hub receives/reconciles the manifest, recording expected, received, missing, or excess items without duplicate receiving records.
5. Dispatch assigns a valid rider. The rider sees only their own active assignments.
6. The rider scans the CN, performs delivery, requests/verifies one-time OTP where required, captures permitted proof, and completes or fails the attempt.
7. Finance independently verifies payment proof and reconciles/settles COD. These are not automatic rider actions.
8. If delivery fails permanently, returns staff begin RTO; the original shipment remains the source of truth and its events are never removed.

## Tracking, audit, and evidence

Every important operational command should produce:

- a **tracking event** visible in the shipment journey; and
- an **audit event** showing actor, action, entity, values, and time.

The expected audited milestones include booking, verification, manifest operations, dispatch, receipt, rider assignment, out-for-delivery, OTP, payment decisions, delivery, return/RTO, and permission changes.

Documents, payment proof, and PDFs require separate authorization. A file upload never grants access to the shipment and never changes payment status by itself.

## Current implementation boundaries

Implemented API modules include authentication, consignments, manifests, transit, delivery, payments, returns, documents, pickups, tracking, notifications, and health. The frontend has authenticated sign-in and the booking/consignment operations UI.

Some roles, reports, customer administration, branch/hub administration, route planning, and dashboard metrics are modeled as product direction but still need their own complete endpoints and user interfaces. They must not be treated as available merely because they appear in navigation.

For exact state-transition rules see [status-transitions.md](status-transitions.md). For full permission and scope rules see [permissions.md](permissions.md), and for security controls see [security-model.md](security-model.md).
