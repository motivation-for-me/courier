# SwiftLog production-readiness audit — 2026-10-07

## A. Issues found

- Critical write paths depended mainly on transactional checks and lacked database constraints for one active rider assignment per shipment and one current price agreement per shop.
- Concurrent pickup, assignment, payment review, refresh-token rotation, shipment deletion, and status updates could produce stale-write outcomes without consistent compare-and-set handling.
- Soft-deleted shipments could retain active rider assignments and pickup work.
- The active authentication layer still admitted legacy role names and the repository still exposed the removed staff module.
- Shipment history loaded and filtered up to 500 records in the browser; dashboard counts also depended on a large shipment list.
- Database connectivity errors could surface as raw Prisma failures and API startup had no transient retry.
- Document generation loaded the complete rider user record, including fields the renderer never needed.
- Rider password constraints differed between the UI and API.
- Failed-attempt status was absent from the shipment-history filter.
- The deployed application currently returns `503` for database-backed login although its frontend, PWA files, health route, and unauthenticated authorization boundary respond.
- No active SHOP account exists in the connected production data, so a real credential-based SHOP flow cannot be completed without creating an intentional account.
- The database migration table contains two historical migrations that are not present in the local repository: `20260928153000_dispatch_domain_foundation` and `20260928153100_dispatch_entities`.

## B. Issues fixed

- Added compare-and-set writes and conflict responses to critical concurrent workflows.
- Added serializable transactions to financial settlement, COD settlement, payment proof, delivery, assignment, deletion, pricing, and refresh rotation paths where appropriate.
- Added database uniqueness guarantees for active assignment, current shop pricing, refresh hashes, and COD settlement.
- Closed active work attached to deleted shipments and made future deletion end/cancel associated work atomically.
- Restricted emitted roles to ADMIN, SHOP, and RIDER; migrated SHOP_MANAGER assignments to SHOP; removed staff implementation and OTP schema dependency.
- Added database readiness health check, connection retry, and sanitized Prisma error handling.
- Added aggregate dashboard summary and server-side paginated history.
- Corrected rider password UI constraints and exposed delivery-attempt failure in history filtering.
- Limited the PDF query to the rider display/contact fields it actually uses.
- Preserved historical shipments when archiving a shop.
- Updated product documentation so it no longer advertises staff, parcel-label, or bike-as-data-loader behavior.

## C. Files/components changed

- API: authentication service, Prisma service/filter, app bootstrap/module, health controller, consignments controller/service, pickup service, delivery/payment/financial services and DTOs, documents service, customer/rider role paths.
- Web: API client, dashboard/history views, operations shell, settings, rider management, global responsive styles.
- Database: `schema.prisma` and migrations `20261007120000_production_role_and_integrity_cleanup`, `20261007133000_close_deleted_shipment_work`, and `20261007143000_active_work_invariants`.
- Documentation: `INFO.md`, `docs/environment.md`, `features.md`, and this audit.

## D. Performance improvements

- Dashboard now requests one aggregate summary and eight recent rows instead of a 500-row operational list.
- Shipment history now uses bounded 25-row server pages, database search/status/date filters, a maximum page size of 100, and 300 ms search debounce.
- Stable `createdAt/id` ordering prevents page jitter.
- Normal latency uses skeletons rather than the heavyweight rider animation.
- Production smoke timings from the local built API and remote Supabase were: health 95 ms, readiness 433 ms, summary 1,734 ms, and one-row history page 1,082 ms. Database/network latency remains the dominant cost.

## E. Security issues found/fixed

- API permissions remain globally enforced by `PermissionGuard`; a regression test now verifies denial when permission is missing.
- SHOP shipment/customer/document queries are scoped by linked customer and organization; rider actions require active assignment and organization scope.
- Authentication emits only active product roles. Refresh tokens rotate once using a transactional compare-and-set.
- PDF responses are authenticated, private/no-store, and no longer fetch unnecessary password/user fields.
- The Next proxy marks responses private/no-store and the service worker never caches `/api/` requests.
- Database and Prisma errors are converted to user-safe responses.
- No secrets were written to source, manifest, service worker, logs, or this report.

## F. UI/UX issues found/fixed

- Kept the bike only in the three-second pre-login screen and retained skeletons for ordinary data loading.
- Added shipment-history page controls, result totals, debounced search, failed-attempt filter, and responsive control layout.
- Kept mobile ADMIN Management navigation visible and retained the compact sidebar/mobile navigation behavior.
- Corrected password minimums and removed obsolete staff/settings UI.

## G. Responsive issues found/fixed

- Existing 1180, 760/720, 420, and 360 px breakpoints cover desktop, tablet, and narrow-phone layouts.
- History controls collapse to two columns on phones; pagination becomes a full-width row.
- Assignment dialogs use viewport-bounded scrolling and become bottom sheets on phones.
- Tables retain a scroll container while primary operational rows use the existing mobile card strategy.

## H. Backend/API issues found/fixed

- Added `GET /api/v1/dispatches/summary` and `GET /api/v1/dispatches/page`.
- Invalid page/limit/status/date input returns `400`; stale concurrent writes return `409`; unavailable database returns `503`.
- Added `GET /api/v1/health/ready` for database-aware readiness.
- Production-mode smoke tests verified health, readiness, summary, pagination, invalid pagination, protected-route rejection, public tracking, and PDF output.

## I. Database issues found/fixed

- Deployed all new migrations successfully to the configured Supabase database.
- Preflight checks found no conflicting active assignments or price agreements.
- The cleanup migration repaired two active assignments attached to deleted shipments; post-check found zero.
- Production-data audit found no duplicate active assignments, no over-capacity rider, and no incomplete active shipment relation.

## J. PWA issues found/fixed

- Verified manifest, 192/512/maskable icons, standalone mode, service-worker registration, update prompt, offline indicator, safe-area support, and production-only registration.
- Service worker caches static assets and selected navigation shells only; authenticated API responses and mutations remain network-only.
- Critical offline actions are not queued or shown as successful.
- Deployed manifest and service worker both return `200`.

## K. Bike image issue and fix

- The previous iframe depended on `/rider-speed` routing and had produced a 404/blank area.
- The login introduction now uses the intended repository asset at `apps/web/public/assets/logo.jpg` through Next Image with eager priority loading and responsive sizing.
- The asset was visually inspected and is the intended red courier rider. It remains only on the three-second pre-login screen, not normal data loading.

## L. Tests performed

- Unit/regression tests: rider lifecycle next actions, signed shipment-specific public tracking keys, and global permission denial.
- Database preflight and post-migration integrity queries.
- Production-mode API startup against Supabase.
- Read-only authenticated API smoke tests using a two-minute, non-persisted token.
- PDF response check: `200`, `application/pdf`, valid `%PDF` signature, non-empty output.
- Public tracking check: `200`, matching shipment found.
- Deployed checks: home, manifest, worker and health `200`; protected shipments route `401`; invalid login currently `503`.

## M. Build/typecheck/lint results

- `npm run typecheck`: pass for API and web.
- `npm test`: 3/3 pass.
- `npm run db:validate`: pass.
- Prisma client generation: pass.
- `npm run build`: API and Next production builds pass; all five web routes generated.
- No standalone ESLint script/configuration exists; Next's integrated lint/type validation passed during build.

## N. Remaining items requiring owner/deployment action

1. Configure/verify Vercel `DATABASE_URL` for Production and Preview using the Supabase transaction-pooler URL on port 6543 (including the project-qualified username and `pgbouncer=true`). Do not place this secret in `vercel.json`. Redeploy afterward; the current deployed login returns `503`.
2. Deploy this repository revision. The deployed app is older: `/api/v1/health/ready` currently returns `404` even though the local production build exposes it.
3. Create an intentional SHOP account through Admin Management and provide test credentials if a true password-based SHOP end-to-end acceptance run is required. The connected database currently has no shop-linked user; QA did not fabricate one in production.
4. Recover the two missing historical migration folders from the original source/backup, or formally baseline migration history. Current forward migrations deploy, but local and remote histories are not fully reproducible until this is resolved.

Until items 1–2 are completed and deployed login is retested, the hosted environment should not be declared production-ready even though the current code builds and local production-mode API checks pass.
