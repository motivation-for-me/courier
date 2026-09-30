# Permissions and Location Scoping

## Permission Model

Roles are configurable records, not hard-coded authorization truth. A permission is a stable capability such as `shipment:create`, `shipment:view`, `shipment:update`, `shipment:cancel`, `manifest:create`, `manifest:dispatch`, `manifest:receive`, `delivery:assign`, `delivery:update`, `delivery:complete`, `payment:view`, `payment:upload_proof`, `payment:verify`, `payment:reject`, `report:view`, `report:export`, `report:pdf`, `documents:view`, and `documents:download`.

The data model includes `Role`, `Permission`, `UserRole`, and `RolePermission`. Role assignments may carry organization, branch, hub, or region scope and effective dates. Deny-by-default applies when a permission or scope is absent.

## Baseline Role Intent

| Role | Typical scope and capabilities |
|---|---|
| SUPER_ADMIN | All organizations only where explicitly assigned; platform administration |
| ADMIN | Organization administration and configured operational access |
| OPERATIONS_MANAGER | Operational workflows across permitted branches/hubs |
| BRANCH_MANAGER | Branch operations, staff, shipments, and handoffs in scope |
| HUB_MANAGER | Hub intake, sorting, manifest, dispatch, and receiving in scope |
| BOOKING_OPERATOR | Create and verify bookings within assigned booking scope |
| DISPATCH_OPERATOR | Manifest, scan, dispatch, and operational handoff actions |
| RIDER | Assigned shipments, delivery attempts, OTP delivery, and permitted collection actions |
| ACCOUNTANT | Payment, COD, settlement, and financial reports in scope |
| CUSTOMER_SERVICE | Read and permitted service actions for scoped customers/shipments |
| REPORT_VIEWER | Read approved reports only |
| CUSTOMER | Own customer account, shipments, documents, and tracking only |

These are starting role profiles. Deployments may add, remove, or rename roles without changing domain invariants.

## Scope Enforcement

A request is authorized only when both capability and resource scope pass. Examples:

- Super administrators can access all organization data only when their assignment grants that organization.
- A branch manager can query shipments whose organization and permitted branch relationship match the actor scope.
- A hub manager can receive only manifests arriving at permitted hubs.
- A rider can read and mutate only assigned shipments and delivery operations allowed for that rider; rider ID is derived from the session.
- A customer can access only their own customer-linked shipments and documents.
- A report export uses the same scope query as the underlying report, not a broader reporting shortcut.

Scope predicates belong in backend repositories/query services and policy services. A frontend filter is only a user-experience filter and never an authorization control.

## Sensitive Actions

Require explicit permissions and state checks for cancellation, override/re-dispatch, rider reassignment, status correction, manifest reconciliation, payment verification/rejection, COD adjustment/settlement, RTO initiation, role/permission changes, exports, and document downloads. Privileged overrides require a reason and audit event.

## Authorization Evaluation

```text
authenticated actor
  + active role assignment
  + required permission
  + organization scope
  + branch/hub/location scope
  + resource relationship
  + valid domain state
  = permitted command
```

Failure should return a controlled authorization or business-state error without exposing hidden resource existence when policy requires indistinguishable responses.
