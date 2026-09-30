# Project Information and Command Guide

## Standard structure

```text
courier/
├── apps/
│   ├── api/                 NestJS API (port 3001)
│   │   └── src/
│   │       ├── common/      guards, decorators, shared types
│   │       ├── infrastructure/ Prisma integration
│   │       └── modules/     domain modules and their DTOs/controllers/services
│   └── web/                 Next.js frontend (port 3000)
│       └── src/
├── prisma/                  schema.prisma and migration history
├── docs/                    engineering and deployment documents
├── ui/                      design references; never imported at runtime
├── .env                     local secrets (ignored by Git)
├── .env.example             safe environment-variable template
├── docker-compose.yml       local Redis and MinIO dependencies
└── package.json             workspace-wide scripts
```

This is a standard modular-monolith layout: application deployables live in `apps`, database ownership is centralized in `prisma`, and shared project operations run from the repository root. Do not move Prisma files into an application folder or copy secrets into `apps/api`.

## Where to run commands

Run these commands from the **repository root** (`courier/`) unless noted otherwise.

| Purpose | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Generate Prisma client | `npm run db:generate` |
| Validate Prisma schema | `npm run db:validate` |
| Apply committed migrations | `npm run db:migrate` |
| Check migration state | `npm run db:status` |
| Build all applications | `npm run build` |
| Type-check all applications | `npm run typecheck` |
| Start API in watch mode | `npm run dev --workspace @courier/api` |
| Start web client in watch mode | `npm run dev --workspace @courier/web` |
| Start built API | `npm run start:api` |
| Create initial organization admin | `npm run build --workspace @courier/api`, then run the bootstrap command below |
| Start Redis and MinIO | `docker compose up -d` |

You may also run `npm run dev` from the root to start both workspace development scripts together. Use separate terminals while diagnosing a service so each log remains visible.

## Environment files

Keep the real `.env` only at the repository root. It must never be committed. Start by copying `.env.example` and supply real values:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API runtime | Supabase pooled PostgreSQL URL |
| `DIRECT_URL` | Prisma migrations | direct PostgreSQL URL |
| `JWT_SECRET` | API | token signing secret; required in production |
| `API_PORT` | API | defaults to `3001` |
| `WEB_ORIGIN` | API | allowed frontend origin |
| `NEXT_PUBLIC_API_URL` | Web build | public API base URL |

Reserved characters in database passwords must be URL-encoded. For example, `@` becomes `%40`. The API loads the root `.env` when started from either the repository root or `apps/api`; deployment platforms should provide variables directly rather than shipping a `.env` file.


## Prisma workflow

Prisma uses [prisma/schema.prisma](prisma/schema.prisma), so run every Prisma command from `courier/`.

Development schema changes:

```powershell
npm run db:generate
npx prisma migrate dev --schema prisma/schema.prisma --name descriptive_change_name
```

Production deployment uses only committed migrations:

```powershell
npm ci
npm run db:generate
npm run db:migrate
npm run build
npm run start:api
```

Never use `prisma migrate dev` against production. Confirm `DATABASE_URL` is the pooled runtime URL and `DIRECT_URL` is a reachable direct database URL before migration.

## Initial administrator

The system deliberately has no default password. Create the first organization-scoped administrator once, using environment variables rather than command-line password arguments:

```powershell
$env:BOOTSTRAP_ORGANIZATION_NAME = 'Tezgam'
$env:BOOTSTRAP_ADMIN_NAME = 'Farheen'
$env:BOOTSTRAP_ADMIN_EMAIL = 'admin@example.com'
$env:BOOTSTRAP_ADMIN_PASSWORD = 'use-a-unique-password-with-at-least-12-characters'
npm run build --workspace @courier/api
npm run bootstrap:admin --workspace @courier/api
```

The command is idempotent for roles and permissions but refuses to overwrite an existing user or reset a password. Remove the four temporary environment variables after use. The administrator is scoped to the supplied organization and is audited.

## Deployment order

1. Configure environment variables in the deployment provider.
2. Install dependencies with `npm ci`.
3. Run `npm run db:generate` and `npm run db:migrate` once for the release.
4. Run `npm run build`.
5. Deploy the API, then deploy the web app with `NEXT_PUBLIC_API_URL` pointing to the public API URL.
6. Verify `GET /api/v1/health` and API authentication after deployment.

The database must permit outbound PostgreSQL connectivity from the API host. A frontend deployment cannot connect directly to PostgreSQL.
