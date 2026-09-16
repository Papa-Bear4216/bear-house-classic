// Shared CORS helpers.
//
// The actual Access-Control-Allow-Origin allowlist now lives in root
// middleware.ts, which sees the real request Origin and can set it on every
// /api/* response without threading `req` through every route. This module's
// OPTIONS short-circuit stays for routes that check it directly, but no
// longer sets an Origin header itself — middleware adds the right one to
// whatever handleCorsPreflight (or the route's own json() response) returns.
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-token, x-write-secret',
};

/** Call at the top of a handler; returns a response for OPTIONS preflight, or null otherwise. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return null;
}
