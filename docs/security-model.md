# Security Model

## Trust Boundary

The browser, mobile web client, scanner, barcode, QR code, and uploaded files are untrusted. The NestJS API is the authorization and business-rule boundary. The database is protected by application policies, constraints, least-privilege credentials, and controlled migrations.

Never trust client-provided user ID, role, organization, branch, hub, rider, payment status, or shipment status. Resolve actor identity from the authenticated session/token and resolve scope from server-side relationships.

## Authentication

Use password hashing with a modern adaptive password hash and a server-side credential policy. Use short-lived access tokens plus rotated refresh/session records, secure cookie or equivalent transport, revocation, device/session metadata, and logout invalidation. Apply login throttling and account lockout or progressive delay without leaking whether an account exists.

Service-to-service credentials and signing keys come from environment/secret management. Secrets, tokens, private keys, and production connection strings are never committed to source control.

## Authorization

Use configurable RBAC with granular permissions plus resource policies. Every protected endpoint performs:

1. Authentication.
2. Permission check for the domain command or read.
3. Organization and branch/hub/location scope check.
4. Resource state and relationship check.
5. Audit recording for sensitive operations.

A barcode lookup only resolves an identifier after authentication and scope checks. Rider delivery requires the rider to be active, assigned to the shipment, within allowed organization/branch scope, and operating on an eligible state.

## Input and File Safety

- Validate all DTOs at the API boundary with allow-listed fields and strict types.
- Normalize and bound strings, identifiers, dates, monetary values, dimensions, and pagination.
- Use parameterized ORM queries and avoid dynamic unchecked filters or raw SQL.
- Apply CORS allowlists, secure headers, TLS in deployment, request size limits, rate limits, and safe error responses.
- Validate uploads by declared type, detected content type, extension policy, size, image/PDF limits, malware scanning strategy, and storage isolation.
- Store objects outside executable/public paths and issue short-lived authorized downloads.
- Strip or protect sensitive metadata where appropriate.
- Treat remarks, addresses, filenames, and report filters as untrusted output; encode in the UI and generated documents.

## CSRF, Sessions, and Mobile Retry

If cookie-authenticated browser sessions are used, use SameSite protections and CSRF tokens for state-changing requests. If bearer tokens are used, protect storage and refresh flows against token theft. Idempotency keys protect retries; they do not replace authentication or authorization.

## Financial and Delivery Controls

Payment proof upload never verifies payment. Verification and rejection require explicit permission, actor identity, review metadata, and audit records. COD collection and settlement are separate custody events with immutable adjustments. Delivery completion requires the configured OTP and payment policy, with retry limits and fraud/rate controls.

## Audit and Privacy

Audit login, user/role/permission changes, shipment creation/change, transitions, rider assignments, manifest dispatch/receive, delivery completion, OTP verification, payment proof and payment decisions, RTO, document/PDF access, settings changes, and privileged exports. Capture actor, action, entity, before/after values where safe, IP, user agent/device, scope, correlation ID, and timestamp. Redact passwords, tokens, OTP values, and unnecessary personal data.

Define retention, access, export, and deletion policies before production. Operational history and financial records must not be deleted merely to satisfy a UI action.

## Security Testing Baseline

Later implementation work should include authorization matrix tests, transition abuse tests, IDOR/scope tests, rate-limit tests, upload validation tests, idempotency/replay tests, audit assertions, dependency scanning, secret scanning, and API contract tests.
