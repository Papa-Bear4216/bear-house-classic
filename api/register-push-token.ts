/**
 * /api/register-push-token — a native (Capacitor) Android device POSTs its
 * FCM device token here after successfully logging in, so the household can
 * receive device push notifications. Edge runtime to match the raw-fetch
 * resolveHouseholdId path (and the Web Crypto FCM sender it feeds).
 */
export const config = { runtime: 'edge' };

import { resolveCallerMember, dbUpsertPushToken } from './_db.js';
import { json as j, serverError } from './_responseHelpers.js';
import { handleCorsPreflight } from './_cors.js';

export default async function handler(req: Request): Promise<Response> {
  // The Capacitor WebView calls this cross-origin (origin https://localhost),
  // so the OPTIONS preflight MUST be answered 204 with CORS headers — without
  // it the webview blocks the token upload before the POST even reaches us.
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  // Same auth convention as api/register-gmail / setup: the Supabase access
  // token is the only identity; household_id is resolved server-side and is
  // never trusted from the client.
  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const caller = await resolveCallerMember(accessToken);
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  const { householdId } = caller;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return j({ error: 'Invalid JSON body' }, 400);
  }

  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) return j({ error: 'token is required' }, 400);
  const platform = typeof body?.platform === 'string' && body.platform ? body.platform : 'android';
  // A device can only register a push token under the caller's OWN member
  // id — src/lib/push.ts's only caller (AppContext) always passes
  // session.member.id, so this is a pure hardening no-op for legitimate
  // traffic. Without this, any authenticated household member could
  // register a token under a different member's id and receive push
  // notifications meant for them.
  const requestedPersonId = typeof body?.personId === 'string' && body.personId ? body.personId : undefined;
  if (requestedPersonId !== undefined && requestedPersonId !== caller.memberId) {
    return j({ error: 'personId must match the authenticated caller' }, 403);
  }
  const personId = requestedPersonId;

  try {
    await dbUpsertPushToken(householdId, token, platform, personId);
  } catch (e: any) {
    return serverError(e?.message || 'Failed to store device token', 'register-push-token', e);
  }

  return j({ ok: true });
}