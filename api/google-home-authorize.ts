/**
 * POST /api/google-home-authorize — step 2 of Google Smart Home account
 * linking. The in-app consent page (src/pages/GoogleHomeLink.tsx) calls this
 * with the signed-in user's Supabase session after they tap Allow/Cancel, and
 * gets back the URL to send the browser to (Google's redirect + code/state).
 */
export const config = { runtime: 'edge' };

import { resolveCallerMember, canControlDevices } from './_db.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { json as j, serverError } from './_responseHelpers.js';
import { googleHomeConfig, isAllowedRedirect, createAuthCode, timingSafeEqual } from './_googleHome.js';

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const cfg = googleHomeConfig();
  if (!cfg) return j({ error: 'Google Home is not configured on this server.' }, 503);

  const accessToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  // Linking lets Google command devices as this member, so only members who
  // may control devices at all can link.
  if (!canControlDevices(caller)) return j({ error: 'This account is not permitted to control devices' }, 403);

  const rl = await checkRateLimit(caller.householdId, 'google-home-authorize', 10);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const body = await req.json().catch(() => ({})) as any;
  const { client_id, redirect_uri, state, deny } = body;
  if (typeof client_id !== 'string' || typeof redirect_uri !== 'string' || typeof state !== 'string') {
    return j({ error: 'Missing client_id, redirect_uri or state' }, 400);
  }
  if (!timingSafeEqual(client_id, cfg.clientId)) return j({ error: 'Unknown client' }, 400);
  if (!isAllowedRedirect(redirect_uri, cfg.projectId)) return j({ error: 'redirect_uri is not allowed' }, 400);

  const target = new URL(redirect_uri);
  target.searchParams.set('state', state);

  if (deny) {
    target.searchParams.set('error', 'access_denied');
    return j({ redirectTo: target.toString() });
  }

  const code = await createAuthCode({ memberId: caller.memberId, householdId: caller.householdId }, redirect_uri);
  if (!code) return serverError('Failed to create authorization code', 'google-home-authorize');
  target.searchParams.set('code', code);
  return j({ redirectTo: target.toString() });
}
