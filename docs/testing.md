# Testing and QA

## Available checks

- `npm run db:validate`: Prisma schema validation without a database connection.
- `npm run db:generate`: Prisma client generation.
- `npm run typecheck`: workspace TypeScript checks.
- `npm run build`: NestJS and Next.js production builds.
- `npm run db:status`: live migration status; requires reachable Supabase URLs.
- `npm run db:migrate`: deploys checked-in migrations; requires `DIRECT_URL` and a reachable Supabase database.

## Critical test matrix

Backend tests must cover booking validation and idempotency, invalid status transitions, organization/branch/hub scope, rider assignment isolation, OTP expiry/replay/attempt limits, exact COD collection, duplicate delivery, payment proof status, payment decisions, manifest receiving/reconciliation, RTO history preservation, protected document access, and malicious upload rejection.

Frontend QA must cover desktop, laptop, tablet, and mobile layouts; keyboard focus; loading/error/empty/forbidden states; scan flow messaging; booking submission; and responsive rider navigation.

## Current evidence

The workspace production build has passed during implementation. Live database migration and end-to-end tests remain environment-dependent because the Supabase endpoint was not reachable from the development machine. No test result should be interpreted as a live financial or delivery verification until those tests run against a controlled database.
