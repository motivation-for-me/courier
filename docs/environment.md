# Environment Variables

## Database

- `DATABASE_URL`: Supabase session-pooler runtime connection used by the application. Use the session-pooler URL on port `5432`; do not use the transaction-pooler URL on port `6543` with Prisma prepared statements.
- `DIRECT_URL`: Supabase direct/session connection used by Prisma CLI and migrations. Keep this available separately from `DATABASE_URL`.

The Supabase transaction pooler can move requests between PostgreSQL connections while Prisma is using prepared statements. That causes errors such as `prepared statement "s19" does not exist` or `prepared statement "s0" already exists`. If the runtime is configured with a transaction-pooler URL, replace `DATABASE_URL` with the Supabase session-pooler URL on port `5432` and redeploy. Do not expose either URL in source control, logs, screenshots, or support messages.

## Application

- `NODE_ENV`: `development`, `test`, or `production`.
- `JWT_SECRET`: required in production; never use the development fallback outside local development.
- `API_PORT`: NestJS listen port.
- `WEB_ORIGIN`: exact allowed browser origin for CORS.
- `API_INTERNAL_URL`: injected by the Vercel service binding; do not set it manually.
- `API_ORIGIN`: local fallback used by the Next.js server-side API proxy.

## Storage and jobs

- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `REDIS_URL`

Keep values in ignored `.env` files locally and managed secret stores in deployment. Rotate any credential that has been exposed. Passwords containing URL-reserved characters must be URL-encoded in PostgreSQL connection strings.
