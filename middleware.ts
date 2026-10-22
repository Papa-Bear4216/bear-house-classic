// Vercel Routing Middleware — applies a CORS allowlist to every /api/* response.
//
// Centralizing here (rather than in api/_cors.ts + api/_responseHelpers.ts) means
// every route gets the real request Origin without threading `req` through the
// ~20 files that call json()/error()/etc. Runs before each api/* function and
// rewrites the outgoing response's headers.
//
// Origins: the deployed frontend, plus Capacitor's native origin (no custom
// server.hostname in capacitor.config.json, so it serves from https://localhost),
// plus any extra origins listed (comma-separated, exact match) in the
// CORS_ALLOWED_ORIGINS env var, e.g. a specific Vercel preview URL that must
// call the production API. There is deliberately no *.vercel.app wildcard:
// anyone can deploy to that domain.
const ALLOWED_ORIGINS = new Set([
  'https://hotmessexpress.lol',
  'https://www.hotmessexpress.lol',
  'https://localhost',
]);

function extraOrigins(): Set<string> {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? '';
  return new Set(raw.split(',').map((o) => o.trim()).filter(Boolean));
}

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || extraOrigins().has(origin);
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
