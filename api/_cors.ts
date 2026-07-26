// Shared CORS helpers.
//
// These endpoints used to only ever be called same-origin (bearhouseos.vercel.app
// calling its own /api/*), so no CORS headers were needed. Now the native app
// (Capacitor) calls this backend from its own local origin, which makes every
// request cross-origin — without these headers the browser/webview blocks the
// response (and blocks the preflight OPTIONS request entirely for POSTs with a
// JSON body).
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-camera-token, x-webhook-token, x-write-secret',
};

/** Call at the top of a handler; returns a response for OPTIONS preflight, or null otherwise. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return null;
}
