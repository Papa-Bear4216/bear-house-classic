// Vercel Routing Middleware — applies a CORS allowlist to every /api/* response.
//
// Centralizing here (rather than in api/_cors.ts + api/_responseHelpers.ts) means
// every route gets the real request Origin without threading `req` through the
// ~20 files that call json()/error()/etc. Runs before each api/* function and
// rewrites the outgoing response's headers.
//
// Origins: the deployed frontend, plus Capacitor's native origin (no custom
// server.hostname in capacitor.config.json, so it serves from https://localhost),
// plus Vercel preview deployments (see api/_cors.ts's original comment —
// bearhouseos.vercel.app previews call these same routes).
const ALLOWED_ORIGINS = new Set([
  'https://hotmessexpress.lol',
  'https://www.hotmessexpress.lol',
  'https://localhost',
]);

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    return new URL(origin).hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

export default async function middleware(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : '';

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, Vary: 'Origin' } : {}),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-token, x-write-secret',
      },
    });
  }

  const response = await fetch(request);
  if (!allowOrigin) return response;

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const config = {
  matcher: '/api/:path*',
};
