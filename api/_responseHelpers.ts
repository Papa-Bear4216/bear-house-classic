/**
 * Standardized JSON response helpers for Edge Function routes.
 *
 * Every route previously defined its own local `j(data, status)` helper —
 * 21 near-identical copies, one of which (briefing.ts) drifted and inlined
 * `new Response(...)` directly, dropping the Content-Type header on one path.
 * This centralizes that helper so the shape can't drift per-route again.
 *
 * Kept the existing wire format (`{ error: string }` for failures, raw data
 * for success) rather than introducing a new `{ success, data }` envelope —
 * changing the response shape would be a breaking change for every client
 * (frontend fetches, Tasker/IFTTT webhooks, voice assistant integrations)
 * calling these routes today.
 */

import { logError } from './_log.js';

const jsonHeaders = { 'Content-Type': 'application/json' };

/** Generic JSON response — direct replacement for each route's local `j()`. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

export function success<T>(data: T, status = 200): Response {
  return json(data, status);
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function unauthorized(message = 'Unauthorized'): Response {
  return json({ error: message }, 401);
}

export function forbidden(message = 'Forbidden'): Response {
  return json({ error: message }, 403);
}

export function notFound(message = 'Not found'): Response {
  return json({ error: message }, 404);
}

export function methodNotAllowed(message = 'Method not allowed'): Response {
  return json({ error: message }, 405);
}

export function rateLimitExceeded(retryAfterSeconds: number): Response {
  return json({ error: `Rate limit exceeded, try again in ${retryAfterSeconds}s` }, 429);
}

export function serverError(message = 'Internal server error', route?: string, err?: unknown): Response {
  if (route) logError(route, err ?? message);
  return json({ error: message }, 500);
}
