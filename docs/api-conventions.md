# API Conventions

## Base Contract

Use versioned REST endpoints under `/api/v1`. JSON is the default representation. OpenAPI/Swagger is generated from the NestJS controllers and DTOs and is the contract for frontend clients and integration partners.

Resources are nouns; business mutations are explicit commands. Do not expose generic endpoints that accept arbitrary status or ownership changes.

Examples:

```text
POST /api/v1/auth/login
GET  /api/v1/consignments?status=IN_TRANSIT&branchId=...
GET  /api/v1/consignments/:id
POST /api/v1/consignments/:id/verify
POST /api/v1/consignments/:id/manifest
POST /api/v1/consignments/:id/dispatch
POST /api/v1/consignments/:id/receive
POST /api/v1/consignments/:id/assign-rider
POST /api/v1/consignments/:id/out-for-delivery
POST /api/v1/consignments/:id/deliver
GET  /api/v1/consignments/:id/tracking-events
POST /api/v1/manifests/:id/receive
POST /api/v1/payments/:id/proof
POST /api/v1/payments/:id/verify
POST /api/v1/returns
GET  /api/v1/reports/cod
```

A generic `PUT /consignments/:id { status: DELIVERED }` is prohibited.

## Request Rules

- Use DTO validation and explicit allow-listed fields.
- Use opaque internal IDs only where appropriate; public CN and manifest numbers are supported lookup identifiers.
- Require authenticated identity and derive actor, organization, branch, hub, and rider scope server-side.
- Require `Idempotency-Key` for delivery completion, payment recording, manifest receiving, scan ingestion, and OTP verification where clients may retry.
- Accept `If-Match`/version checks for user-editable resources where concurrent edits matter.
- Use cursor pagination for high-volume lists; cap page size and expose stable sort order.
- Use ISO-8601 UTC timestamps and explicit currency/amount representations.
- Do not return secrets, raw OTPs, password hashes, private storage keys, or unnecessary personal data.

## Responses

Successful responses use resource or command result envelopes consistently. List responses include items, cursor/page metadata, and applied scope-safe filters. Command results include the resulting resource projection, created event/operation identifier, and idempotency replay information where applicable.

Errors use a stable structure:

```json
{
  "error": {
    "code": "CONSignment_INVALID_STATE",
    "message": "The consignment cannot be delivered from its current state.",
    "details": [],
    "requestId": "..."
  }
}
```

Error messages must be safe for the caller. Validation, authorization, not-found, conflict, idempotency, and business-state errors remain distinguishable to trusted clients without leaking protected resource existence.

## Transactions and Events

The command service owns transactions involving status, tracking, assignments, attempts, payment, COD, and audit records. Publish notifications or jobs after commit using an outbox pattern or equivalent durable mechanism so consumers do not observe rolled-back changes.

Tracking event writes are append-oriented. External integrations should use signed webhooks or authenticated polling with replay protection and correlation IDs.

## Documents and Downloads

Document generation and access are authorization-checked. Small synchronous documents may return a download descriptor. Large reports return a job resource and later a short-lived authorized download URL. Every sensitive document access is auditable.

## Compatibility

Changes to status codes, permission identifiers, required fields, and response shapes require an API compatibility decision. Prefer additive fields, explicit deprecation, and a future version when semantics change.
