# Courier Management System

Foundation implementation for the Courier & Logistics Management System.

## Boundaries

- `apps/api`: NestJS REST API and domain/application services.
- `apps/web`: Next.js operations and rider-friendly frontend boundary.
- `prisma`: Supabase PostgreSQL persistence contract and migrations.
- `ui`: Stitch visual references; preserved as source material.
- `docs`: architecture, domain, security, permissions, API, and assumptions.

## Local prerequisites

Node.js 22+ and npm 11+ are required. Supabase PostgreSQL is the only application database. Set `DATABASE_URL` to the Supabase pooled runtime URL and `DIRECT_URL` to the Supabase direct connection URL in environment secrets or a local ignored `.env` file. Run `npm run db:generate`, `npm run db:validate`, and `npm run db:migrate` after those values are available.

Docker Compose provides only non-database local dependencies such as Redis and MinIO. It does not create or run a local PostgreSQL database.

The API and web workflows are intentionally not implemented yet. This foundation establishes the boundaries and persistence contract before Part 2 feature work.
