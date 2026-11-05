# Courier Operations Platform — Portfolio Case Study

> **Use this document as the source of truth for a portfolio page, resume entry, case-study presentation, or project README.**

## 1. Portfolio headline

### Recommended title

**Brisk Courier System Courier Operations Platform**

The public product name is **Brisk Courier System (BCS)**.

### One-line description

**A production-oriented courier operations platform that manages shipments from booking through rider delivery, customer tracking, delivery documents, payments, and operational reporting.**

### Short portfolio card

Built a responsive courier management system for real delivery operations. The platform gives administrators, shops, and riders separate workflows for shipment booking, rider assignment, pickup and delivery, public tracking, COD/payment records, documents, notifications, and financial reporting. It uses a Next.js web app, a NestJS REST API, Prisma, and PostgreSQL, with server-enforced permissions, controlled shipment state transitions, audit history, and a Vercel multi-service deployment.

## 2. Product overview

### What the product does

The platform is an operations workspace for a courier company. A shipment is created once, assigned a permanent consignment number, moved through controlled operational states, delivered by an eligible rider, and retained with its tracking, payment, document, return, and audit history.

The system supports three primary user experiences:

- **Admin:** manages courier operations, shops, riders, shipments, permissions, documents, corrections, and financial records.
- **Shop:** creates and follows its own shipment activity within its organization and customer scope.
- **Rider:** sees assigned pickup and delivery work, scans parcels, updates delivery progress, and completes or fails delivery.

### The problem

Courier teams need more than a shipment list. They need a reliable operational system that answers:

- What is the current state of every parcel?
- Who is responsible for the next handoff?
- Can a rider safely deliver this shipment?
- What happened when delivery failed or a parcel was returned?
- Which payments, COD amounts, fees, and settlements are still outstanding?
- Can staff, shops, and customers see only the information they are allowed to see?

### The solution

The platform centralizes the shipment lifecycle while keeping business rules on the API. It combines:

1. A responsive operations dashboard.
2. Shipment booking and history.
3. Pickup and rider workflows.
4. QR/CN-based delivery operations.
5. Public customer tracking.
6. Delivery PDFs and shipment documents.
7. Shop finance and COD records.
8. Role-based and organization-scoped access.
9. Append-oriented tracking and audit history.
10. Production deployment and health monitoring controls.

## 3. Core user journeys

### Admin journey

1. Sign in securely.
2. Review live shipment totals and recent activity.
3. Create or select a shop and use its saved pickup address.
4. Create a shipment with sender, receiver, package, service, and payment details.
5. Review the generated consignment number.
6. Preview or download the shipment/dispatch PDF.
7. Assign an eligible rider using area, availability, capacity, and current workload.
8. Monitor shipment history, delivery progress, exceptions, notifications, and finance.

### Rider journey

1. Sign in to a phone-first rider workspace.
2. View assigned pickups and deliveries.
3. Open a parcel from the assignment list or scan its QR code.
4. Use manual CN entry if camera scanning is unavailable.
5. Start pickup or out-for-delivery work.
6. Complete delivery when the configured delivery and payment rules pass.
7. Record a failed delivery attempt with a reason and remarks when delivery cannot be completed.

### Shop journey

1. Sign in within the organization/customer scope.
2. Create and manage permitted shipment activity.
3. Reuse saved pickup details during booking.
4. View shipment progress and public tracking information.
5. Review shop-level charges, COD, settlements, and financial reports.

### Customer journey

1. Open a public tracking link or search using the shipment CN.
2. See the current delivery state.
3. Follow the chronological shipment history.
4. View appropriate receiver/delivery details while sensitive information remains protected.

## 4. Feature highlights

### Operations

- Dashboard with today’s shipment totals, active deliveries, delivered shipments, and recent activity.
- Shipment search by CN, sender, or receiver.
- Status, date, and paginated history filters.
- Responsive desktop tables and mobile cards.
- Shipment assignment and rider workload visibility.
- Pickup request, rider assignment, pickup start, confirmation, and failure handling.
- Controlled shipment lifecycle with valid transitions and recorded reasons.

### Delivery

- Rider-specific workspace.
- QR camera scanning and manual CN fallback.
- Assignment checks before rider actions.
- Out-for-delivery updates.
- Delivery completion and failed-attempt recording.
- Public tracking with shipment-specific tracking keys.
- Shipment PDFs and QR identification.

### Finance

- COD and payment records.
- Payment-proof submission separated from payment verification.
- Payment approval/rejection workflow.
- Shop pricing agreements.
- Shipment charges, COD fees, return charges, revenue, cost, and payable adjustments.
- Shop settlement creation and allocation.
- Rider delivery-cost and earning records.

### Security and governance

- Password hashing and JWT access tokens.
- Refresh-session records, rotation, logout, and server-side revocation.
- API-enforced permissions; hiding a UI control is not treated as authorization.
- Organization, branch, hub, customer, and rider scope checks.
- Login and request throttling.
- DTO allow-list validation and strict input transformation.
- Private document access with authorization checks.
- Audit events for sensitive operational and financial actions.

### Reliability and data integrity

- Transactional multi-record business operations.
- Idempotency records for retry-sensitive commands.
- Database uniqueness guarantees for critical active relationships.
- Compare-and-set/concurrency protection on critical writes.
- Append-oriented tracking history instead of silent status overwrites.
- Database-aware readiness endpoint.
- Safe database and Prisma error responses.
- Server-side pagination and aggregate dashboard queries.

### Progressive Web App experience

- Installable web app manifest.
- Standalone mobile display mode.
- Branded icons and theme colors.
- Offline connection warning.
- Safe static-asset caching.
- Network-only treatment for authenticated API requests and critical mutations.
- New-version update prompt.
- Mobile safe-area support.

## 5. Technical architecture

```text
Next.js web application
        |
        | same-origin /api proxy
        v
NestJS REST API (/api/v1)
        |
        v
Application and domain services
        |
        v
Prisma ORM
        |
        v
PostgreSQL / Supabase

Optional supporting services:
Redis/BullMQ for asynchronous jobs
S3-compatible object storage for private documents and media
```

### Technology stack

| Area | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | NestJS 11, TypeScript, REST |
| Data access | Prisma 6 |
| Database | PostgreSQL, Supabase-compatible |
| Authentication | Password hashing, JWT access tokens, refresh sessions |
| Documents | PDF generation and private authorized downloads |
| API contract | OpenAPI/Swagger |
| Testing | Node test runner, TypeScript checks, Playwright-based web checks |
| Deployment | Vercel multi-service configuration |
| Runtime | Node.js 22 or newer |

### Repository structure

- `apps/web` — Next.js operations frontend and public tracking experience.
- `apps/api` — NestJS API, domain modules, authorization, and Prisma integration.
- `prisma` — centralized schema and committed database migrations.
- `docs` — architecture, security, deployment, QA, financial, and operational documentation.
- `ui` — visual references, not runtime application code.

## 6. Engineering decisions worth highlighting

### The API is the business-rule boundary

The browser never decides whether a user may assign a rider, change a shipment state, verify a payment, or access a document. The API resolves the authenticated actor, permissions, organization scope, resource relationships, and current state before accepting a command.

### Shipment status is a controlled state machine

Shipment history is preserved as tracking events. Commands cannot arbitrarily jump between states, and delivery is not allowed to be repeated after a terminal state.

### Financial proof is not financial verification

Uploading payment proof does not automatically mark a payment as verified. Verification and rejection are explicit, permission-protected actions with actor and audit metadata.

### Critical operations are designed for retries and concurrency

Assignment, delivery, settlement, payment review, deletion, pricing, and session refresh paths use transactions, idempotency, compare-and-set behavior, and database constraints where appropriate.

### Performance work is user-facing

The dashboard uses aggregate summaries, while shipment history uses bounded server-side pages, database filters, stable ordering, and debounced search instead of loading a large dataset into the browser.

## 7. Production and validation evidence

The repository documents the following evidence. Use the exact date and environment when publishing it:

- Production build passed during implementation.
- Database migrations were deployed to the configured Supabase database.
- Health, readiness, summary, pagination, protected-route, public-tracking, and PDF smoke checks were performed.
- PDF validation confirmed a successful `application/pdf` response with a valid PDF signature.
- The production-readiness audit recorded fixes for concurrency, active-work cleanup, role cleanup, server-side pagination, database readiness, sanitized errors, document query minimization, and responsive UI behavior.
- The PWA manifest and service worker were verified to return successfully.

Do **not** publish a specific user count, shipment volume, uptime percentage, revenue figure, or performance SLA unless you have an externally verifiable source for it. The documented latency figures are environment-dependent measurements, not universal product guarantees.

## 8. Suggested portfolio case-study copy

### Case-study version

**Brisk Courier System is a courier operations platform designed for real-world shipment handling.** I built the system around the full operational lifecycle: booking, pickup, dispatch, rider assignment, out-for-delivery work, delivery confirmation, failed attempts, customer tracking, documents, COD, settlements, and audit history.

The key challenge was preserving operational correctness while supporting different users and devices. Administrators need dense desktop controls, riders need fast mobile actions, shops need scoped shipment and finance views, and customers need a simple tracking experience. I addressed this with a responsive Next.js frontend and a NestJS API that owns authorization, state transitions, financial rules, and data integrity.

The system uses organization-scoped permissions, controlled shipment transitions, idempotent retry-sensitive commands, transactional financial operations, private document access, and server-side pagination. It is deployed as a Vercel multi-service application backed by PostgreSQL/Supabase, with health checks and production migration controls.

### Resume bullet options

- Built a production-oriented courier operations platform with Next.js, NestJS, TypeScript, Prisma, and PostgreSQL, covering shipment booking, rider delivery, public tracking, COD, documents, notifications, and financial reporting.
- Designed API-enforced RBAC and organization-scoped authorization for admin, shop, rider, and customer workflows.
- Implemented controlled shipment state transitions, append-only tracking events, audit history, idempotency, transactional settlement flows, and database integrity constraints.
- Improved operational performance with aggregate dashboard summaries, bounded server-side history pagination, database filtering, stable ordering, and debounced search.
- Deployed a Next.js/NestJS multi-service application on Vercel with Supabase PostgreSQL, environment-managed secrets, database-aware readiness checks, and production migration procedures.

### Social/portfolio teaser

**Courier operations, from booking to delivery.** A live-ready logistics platform with role-based workflows for admins, shops, riders, and customers—plus tracking, COD, documents, settlements, auditability, and a mobile-first rider experience.

## 9. Recommended portfolio demo sequence

Use a seeded/demo organization and test accounts. Never expose real customer names, phone numbers, addresses, tokens, payment records, or private documents in screenshots or recordings.

1. Open the sign-in screen and show the branded introduction.
2. Sign in as an admin.
3. Show the dashboard summary and recent shipment activity.
4. Create/select a shop and show the saved pickup address.
5. Create a shipment and highlight the generated CN.
6. Open the shipment PDF and QR identifier.
7. Assign a rider using capacity and workload information.
8. Switch to the rider workspace on a narrow viewport.
9. Open or scan the shipment and move it out for delivery.
10. Complete or fail the delivery and show the resulting history.
11. Open the public tracking page.
12. Show notifications, shop finance, rider payments, permissions, and the PWA install behavior.

## 10. Screenshot and media checklist

Capture these screens for the strongest portfolio presentation:

- Admin dashboard with shipment summary.
- Shipment creation form.
- Shipment detail/history with CN and status timeline.
- Rider assignment dialog with workload/capacity.
- Mobile rider workspace.
- QR scan or manual CN fallback.
- Public tracking page.
- PDF/dispatch document preview.
- Shop financial summary or settlement view.
- Permission/settings view.
- Responsive desktop/tablet/mobile comparison.

For every screenshot:

- Use anonymized seed data.
- Remove email addresses, phone numbers, addresses, tokens, and real financial amounts.
- Keep the product name consistent.
- Add a short caption explaining the user problem solved, not only the screen’s visual appearance.

## 11. Metrics to add before publishing

Replace these placeholders only with measured, defensible values:

- Active organizations: `[verified count]`
- Monthly shipments processed: `[verified count]`
- Delivery completion rate: `[verified percentage]`
- Average shipment search time: `[measured value]`
- Number of production users: `[verified count]`
- Deployment uptime: `[provider-backed percentage]`
- Typical dashboard load time: `[measured environment and value]`
- Number of test cases or automated checks: `[verified count]`

If these values are unavailable, write **“live operational project; metrics withheld”** rather than estimating them.

## 12. Claims to avoid

- Do not claim a mobile-native application; the current product is a responsive/PWA web experience.
- Do not claim every backend module has a finished primary UI. Manifests, hub/transit, returns/RTO, and legacy records are documented as backend or dependency-audit areas.
- Do not claim payment proof upload alone verifies payment.
- Do not claim offline shipment mutations are queued; critical actions require a network connection.
- Do not claim multi-tenant isolation without describing organization and resource-scope enforcement.
- Do not claim user, shipment, revenue, uptime, or performance numbers without evidence.
- Do not expose production credentials, real customer data, payment information, private documents, or internal service URLs.

## 13. Final portfolio positioning

Position this project as **a real operational logistics product**, not merely a CRUD dashboard. The strongest story is:

> I designed and built a courier operations platform where shipment state, access control, delivery evidence, payments, and audit history remain trustworthy across admin, shop, rider, and customer workflows.

That positioning emphasizes the product’s business value and the engineering decisions that make it suitable for real use.
