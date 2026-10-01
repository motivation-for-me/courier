# SwiftLog Courier Management System — Feature Guide

This document is a client-facing inventory of the capabilities currently represented in the repository. It distinguishes the active product experience from backend-only or legacy modules so demonstrations do not promise unfinished screens.

## Product overview

SwiftLog is a responsive courier operations system for creating shipments, assigning riders, managing pickup and delivery work, tracking parcels, producing delivery documents, and maintaining shop and courier financial records. It runs as a Next.js web application with a NestJS API and PostgreSQL/Prisma data layer.

The application supports three primary user types:

- **ADMIN** — manages courier operations, shops, staff, riders, shipments, permissions, documents, corrections, and financial records.
- **SHOP** — a sender/shop account scoped to its own shipment activity and permitted operations.
- **RIDER** — handles assigned pickups and deliveries, scans parcel QR codes, and records delivery progress.

An administrator or staff member can also be enabled as a rider. Rider capability is additive; it does not turn a rider account into an administrator.

## Authentication and access control

- Email and password sign-in.
- Secure password hashing.
- JWT access tokens with refresh-session records.
- Logout and server-side session revocation.
- Automatic expired-session prompt followed by return to sign-in.
- Organization-scoped data access.
- Role and permission checks enforced by the API.
- Configurable staff permissions.
- Optional rider capability for an administrator or staff user.
- Login throttling and global API request throttling.
- Protected API routes; hiding a button is not treated as authorization.
- Audit records for sensitive administrative and operational changes.

## Admin dashboard

- Live shipment totals for today.
- Draft/confirmed shipment count.
- Active delivery count.
- Delivered shipment count.
- Recent shipment activity.
- Quick navigation to shipment creation and the complete shipment directory.
- Responsive desktop, tablet, and phone layouts.
- Compact bottom navigation on phones.
- Collapsible desktop sidebar.
- Light, blue, and dark/midnight appearance options.

## Shipment creation

- Create a shipment record before physical pickup occurs.
- Permanent consignment/CN generation by the backend.
- Select an existing sender shop or create a new shop.
- Automatically use the selected shop's saved pickup address.
- Sender/shop details.
- Receiver name and contact details.
- Pickup and delivery addresses.
- Parcel description and repeatable parcel/content rows.
- Quantity, weight, and dimensional information.
- Service type selection.
- Payment method and COD information.
- Optional rider selection where permitted.
- Server-side validation and organization checks.
- Transactional creation of related shipment records.
- Initial tracking and audit events.

## Shipment management

- Search shipments by CN, sender, or receiver.
- Filter shipments by status.
- View sender, receiver, parcel, assigned rider, and current state.
- Assign or change an eligible rider.
- Rider recommendations based on availability, service area, capacity, and active workload.
- Show each rider's active parcel count and remaining capacity before assignment.
- Administrator status correction with a mandatory reason.
- Permanent tracking and audit history for corrections.
- Administrator-controlled shipment deletion where policy permits.
- Responsive card presentation on mobile instead of an unusable wide table.

## Active shipment lifecycle

The simplified active workflow separates shipment creation from pickup:

1. **DRAFT** — shipment is being prepared.
2. **CONFIRMED** — shipment details are confirmed.
3. **ASSIGNED_TO_RIDER** — a rider has been allocated.
4. **DISPATCHED** — the parcel has been physically collected/entered delivery operations.
5. **OUT_FOR_DELIVERY** — the rider is taking it to the receiver.
6. **DELIVERED** — delivery is complete.

Controlled exception states include delivery attempt failed, delivery failed, returned, cancelled, held, damaged, and lost. State changes are validated on the backend and recorded as events rather than silently overwriting history.

## Pickup workflow

- Shipment creation does not automatically mean pickup.
- Create a pickup request for a shipment.
- Assign a pickup rider.
- Rider view of assigned pickups.
- Start pickup.
- Confirm physical pickup.
- Record pickup failure with a reason.
- Update shipment state only after the corresponding operational action.

## Rider workspace

- Rider-specific login destination.
- Phone-first assigned-delivery dashboard.
- Assigned parcel count.
- Pickup count.
- Out-for-delivery count.
- Route/order list with receiver and destination information.
- Open an assigned parcel without scanning when already signed in.
- QR camera scanner for quick parcel lookup.
- Manual CN entry as a fallback when camera scanning is unavailable.
- View the shipment PDF for assigned parcels.
- Start out-for-delivery status.
- Complete delivery.
- Record delivery failure with reason/remarks.
- Pickup start, confirmation, and failure actions.
- Backend verification that the rider is active and assigned to the shipment.
- Mobile bottom navigation and full-width touch controls.

## Shops and shop accounts

- Create, view, update, search, and remove shops where permitted.
- Store shop name and contact details.
- Store the shop pickup address.
- Create and update the shop's operational location/branch address.
- Create shop login accounts.
- Scope shop users to their associated shop/customer record.
- Use saved shop information during shipment creation.
- Dedicated shop financial area.

## Staff management

- Create, view, update, search, and remove staff accounts.
- Store name, email, and phone.
- Set a temporary password when creating a user.
- Assign granular operational permissions.
- Enable or disable rider capability for a staff member.
- Generate or set an employee code when rider capability is enabled.
- Audit staff access changes.

## Rider management

- Create, view, update, search, and remove riders.
- Rider login credentials.
- Employee code.
- Phone and vehicle number.
- Availability state.
- Service/delivery areas.
- Daily parcel capacity.
- Per-delivery rider fee.
- Active workload and remaining-capacity calculation.
- Rider earnings records with pending, paid, and voided states in the data model.

## Tracking and customer experience

- Public customer tracking URL protected by the shipment's public tracking key.
- Search by permanent CN.
- Current shipment state.
- Animated delivery-stage progress.
- Complete chronological tracking history.
- Receiver/delivery information presented with privacy controls.
- Rider contact details shown when operationally appropriate.
- Out-for-delivery presentation for the active last-mile stage.
- Responsive customer tracking page for phone and desktop.

## Documents and labels

- Generate a dispatch/shipment PDF.
- Generate a parcel label PDF.
- Preview documents in the browser.
- Download documents.
- CN and QR identification.
- Sender/shop details.
- Receiver name and contact number.
- Pickup and delivery addresses.
- Parcel and service information.
- COD/payment information.
- Assigned rider information where applicable.
- Customer tracking link encoded in the QR workflow.

## Notifications

- Notification inbox for authenticated users.
- Unread notification counter.
- Mark one notification as read.
- Mark all notifications as read.
- Loading and empty states.
- Backend notification records and provider abstraction.

## Shop finance and courier accounting

- Shop-specific financial summary.
- Date-range filtering.
- Shop pricing agreements.
- Shipment charge.
- Fixed and percentage COD fees.
- Return charge.
- Option to deduct courier charges from collected COD.
- Shipment financial ledger entries.
- Revenue, cost, and shop-payable adjustments.
- Manual financial transactions with references and notes.
- Shop settlement creation.
- Settlement allocation against eligible entries.
- Paid and voided settlement states.
- Rider delivery-cost and earning records in the data model.
- Decimal monetary values and transactional database updates.
- Finance permissions separate from ordinary operational access.

## Payment and COD backend capabilities

- Payment proof submission.
- Payment report endpoint.
- COD report endpoint.
- Independent payment verification or rejection.
- COD settlement endpoint.
- Payment proof does not automatically mark a payment as verified.
- Payment, COD transaction, COD settlement, and proof records are retained separately.

## Reliability and data integrity

- Prisma transactions for multi-record business operations.
- Serializable/controlled transaction handling in critical paths.
- Idempotency records for retry-sensitive commands.
- Unique constraints to prevent duplicate active relationships and duplicate command effects.
- Append-oriented tracking history.
- Audit log with actor, entity, action, and before/after information where applicable.
- DTO allow-list validation and strict API input transformation.
- Controlled status transitions.
- Organization and resource-scope checks.
- Health endpoint for deployment monitoring.

## Progressive Web App

- Installable web app manifest.
- Android, supported iOS, Windows, and desktop-browser installation.
- Standalone display mode.
- Branded application icons and theme colors.
- Service-worker registration in production.
- Safe static-asset caching.
- Authenticated API responses are not stored as a public offline cache.
- Offline connection warning.
- Critical shipment, rider, delivery, and financial actions require a network connection.
- New-version notification with an update/reload action.
- Mobile safe-area support for notches and home indicators.

## User-interface behavior

- Responsive layouts for phone, tablet, laptop, and wide desktop screens.
- Text wrapping and overflow protection for long names, addresses, emails, CNs, and statuses.
- Compact information-dense cards rather than oversized dashboard tiles.
- Touch-friendly buttons and forms.
- Keyboard focus indicators and skip-to-content link.
- Skeleton states for loading content.
- Branded delivery-bike loading animation.
- Three-second branded pre-login introduction.
- Reduced-motion support.
- Empty, success, error, offline, and expired-session states.

## Deployment architecture

- Next.js frontend and NestJS API in one repository.
- Vercel multi-service configuration.
- Public web service with an internal API service binding.
- Same-origin `/api` proxy from the browser to the internal API.
- Prisma Client generation before API build.
- PostgreSQL/Supabase-compatible database configuration.
- Environment-based secrets and service URLs.

## Backend modules present but outside the simplified primary UI

The repository still contains backend support for the following areas. They should not be presented as completed primary UI workflows unless they are separately tested and approved:

- Manifests: create, add items, seal, dispatch, receive, and reconcile.
- Hub and transit movement.
- Return/RTO records and events.
- Legacy project/site records.
- Legacy OTP challenge records.
- Additional historical shipment statuses.

These remain dependency-audit candidates. Their tables, relations, columns, and statuses should only be removed through a reviewed migration after confirming that active APIs, reports, documents, tracking, authentication, and required historical data do not depend on them.

## Recommended client demonstration order

1. Sign in as Admin.
2. Show the dashboard and live shipment counts.
3. Create or select a shop and its pickup address.
4. Create a shipment and show the generated CN.
5. Preview the parcel label and dispatch PDF.
6. Assign a recommended rider using workload and area information.
7. Sign in as the Rider and show assigned work.
8. Scan/open the parcel and update it to out for delivery.
9. Complete or fail delivery and show the tracking history.
10. Open the customer tracking link.
11. Show notifications, staff permissions, rider management, and shop financials.
12. Install the PWA and demonstrate responsive phone behavior.
