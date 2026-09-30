# Environment Variables

## Database

- `DATABASE_URL`: Supabase pooled runtime connection used by the application.
- `DIRECT_URL`: Supabase direct/session connection used by Prisma CLI and migrations.

## Application

- `NODE_ENV`: `development`, `test`, or `production`.
- `JWT_SECRET`: required in production; never use the development fallback outside local development.
- `API_PORT`: NestJS listen port.
- `WEB_ORIGIN`: exact allowed browser origin for CORS.
- `NEXT_PUBLIC_API_URL`: browser-visible API base URL; contains no secret.

## Storage and jobs

- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `REDIS_URL`

Keep values in ignored `.env` files locally and managed secret stores in deployment. Rotate any credential that has been exposed. Passwords containing URL-reserved characters must be URL-encoded in PostgreSQL connection strings.
