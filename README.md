# Courier Management System

Courier operations platform implemented as an npm-workspace monorepo. The NestJS API owns business rules and PostgreSQL access; the Next.js client communicates only with that API.

## Quick start

From the repository root:

```powershell
copy .env.example .env
# Set DATABASE_URL, DIRECT_URL, and JWT_SECRET in .env.
npm install
npm run db:generate
npm run db:migrate
npm run dev --workspace @courier/api
# In a second terminal:
npm run dev --workspace @courier/web
```

Open `http://localhost:3000`; the API health endpoint is `http://localhost:3001/api/v1/health`.

Do not run Prisma commands from `apps/api` or `apps/web`; they must run from the repository root because the schema and migrations are in `prisma/`.

## Project layout

- `apps/api` — NestJS REST API, controllers, domain services, and Prisma integration.
- `apps/web` — Next.js operations frontend.
- `prisma` — database schema and migration history.
- `docs` — architecture, security, deployment, and operational documentation.
- `ui` — Stitch visual references only; it is not runtime application code.

See [INFO.md](INFO.md) for the full folder map, command reference, environment rules, database workflow, and production deployment checklist.

For the courier business roles, shipment route, lifecycle, permissions, and operational story, see [Business Model](docs/business-model.md).
