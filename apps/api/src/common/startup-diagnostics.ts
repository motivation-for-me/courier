// Log classifications, never raw driver errors: they can contain credentials.
export function startupDiagnostics(error: unknown) {
  const value = error as { name?: unknown; errorCode?: unknown; code?: unknown; message?: unknown } | null;
  const message = typeof value?.message === 'string' ? value.message : '';
  const candidate = value?.errorCode ?? value?.code;
  const code = typeof candidate === 'string' && /^P\d{4}$/.test(candidate) ? candidate : undefined;
  let reason = 'Unclassified startup failure';
  if (code === 'P1000' || /authentication failed|password authentication/i.test(message)) reason = 'Database credentials rejected';
  else if (/tenant.*not found|user.*not found/i.test(message)) reason = 'Database pooler project or user not found';
  else if (code === 'P1001' || /can.t reach database|ECONNREFUSED|ENOTFOUND/i.test(message)) reason = 'Database endpoint unreachable';
  else if (code === 'P1002' || /timed out/i.test(message)) reason = 'Database connection timed out';
  else if (code === 'P1011' || /TLS|SSL certificate/i.test(message)) reason = 'Database TLS connection failed';
  else if (code === 'P1013') reason = 'Invalid database connection string';
  else if (code === 'P1010') reason = 'Database user lacks access';
  else if (/environment variable not found/i.test(message)) reason = 'Required environment variable missing';
  else if (/query engine|libquery_engine|openssl/i.test(message)) reason = 'Prisma runtime engine unavailable or incompatible';
  const configurationErrors = ['DATABASE_URL must be configured', 'JWT_SECRET must be configured', 'JWT_SECRET must be at least 32 characters', 'WEB_ORIGIN must be configured in production', 'WEB_ORIGIN contains an invalid origin', 'API_PORT must be a valid TCP port'];
  if (configurationErrors.includes(message)) reason = message;
  return { type: value?.name === 'PrismaClientInitializationError' ? 'PrismaClientInitializationError' : 'StartupError', ...(code ? { code } : {}), reason };
}
