import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const excludedRequestHeaders = new Set(['connection', 'content-length', 'host', 'transfer-encoding']);
const excludedResponseHeaders = new Set(['connection', 'content-length', 'transfer-encoding']);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const internalBaseUrl = process.env.API_INTERNAL_URL ?? process.env.API_ORIGIN ?? 'http://localhost:3001';
  const target = new URL(`/api/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`, internalBaseUrl);
  const headers = new Headers();
  request.headers.forEach((value, key) => { if (!excludedRequestHeaders.has(key.toLowerCase())) headers.set(key, value); });
  headers.set('x-forwarded-host', request.nextUrl.host);
  headers.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      duplex: request.method === 'GET' || request.method === 'HEAD' ? undefined : 'half',
      redirect: 'manual',
      cache: 'no-store',
    } as RequestInit & { duplex?: 'half' });
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => { if (!excludedResponseHeaders.has(key.toLowerCase())) responseHeaders.append(key, value); });
    responseHeaders.set('cache-control', 'private, no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    return Response.json({ statusCode: 503, message: 'Courier API is temporarily unavailable' }, { status: 503, headers: { 'cache-control': 'private, no-store' } });
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
