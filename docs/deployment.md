# Deployment

## Runtime topology

```text
Next.js web -> NestJS API -> Prisma -> Supabase PostgreSQL
                              |-> Redis/BullMQ when enabled
                              |-> S3-compatible object storage
```

Supabase PostgreSQL is the only application database. `DATABASE_URL` is the runtime URL and `DIRECT_URL` is the Prisma migration URL. The Supabase Data API is not used as the persistence layer.

## Required configuration

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `WEB_ORIGIN`
- `API_PORT`

## Vercel Services

The repository root `vercel.json` defines `web` and `api` services. Only the
Next.js `web` service receives public traffic. Browser requests use the
same-origin `/api/v1` path, and the Next.js API proxy calls the internal NestJS
service through the runtime-only `API_INTERNAL_URL` service binding. Do not set
`API_INTERNAL_URL` manually in Vercel. For ordinary local development outside
`vercel dev`, `API_ORIGIN` defaults to `http://localhost:3001`.

Set the Vercel project framework to **Services**. Configure `DATABASE_URL`,
`DIRECT_URL`, `JWT_SECRET`, and other secrets in Vercel project environment
variables. The web service must receive `API_INTERNAL_URL` from the Vercel
service binding. If that binding is unavailable in the selected Vercel plan,
set `API_ORIGIN` on the web service to the deployed API origin, for example
`https://courier-api.example.com` without `/api/v1`. Browser requests always
use the same-origin `/api/v1` proxy; do not configure `NEXT_PUBLIC_API_URL`.
- Object-storage credentials and bucket settings
- Redis settings when background jobs are enabled

Never commit `.env` or secrets. Use platform secret storage in production.

## Build and run

```powershell
npm ci
npm run db:generate
npm run db:validate
npm run db:migrate
npm run build
npm start
```

The API build emits `apps/api/dist/main.js`. Supabase must be reachable before migration or API startup can complete. Docker Compose intentionally provides only non-database local dependencies.

## Production controls

Use TLS, a restricted `WEB_ORIGIN`, a strong generated `JWT_SECRET`, private object storage, database backups, structured logs, health monitoring, rate limits, and least-privilege database credentials. Run migrations as a deployment step, not from application startup.
