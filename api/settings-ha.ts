export const config = { runtime: 'edge' };

import { resolveCallerMember, dbGetHouseholdHA, dbSetHouseholdHA } from './_db.js';
import { encryptSecret } from './_crypto.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, SettingsHaBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';
import { validateOutboundUrl } from './_urlSafety.js';

import { handleCorsPreflight } from './_cors.js';
// Lets a household bring their own Home Assistant instance (self-hosted or
// Nabu Casa URL) instead of this app's shared HOME_ASSISTANT_URL/TOKEN (see
// api/_haConfig.ts, used by every HA route). GET returns connection status
// only — the token is never sent back to the browser once saved.
//
// Admin-or-superadmin only: the Settings UI's Integrations tab (where this
// lives) is already isAdmin-gated client-side, but that's not enforcement —
// per this repo's CLAUDE.md, admin-only actions must also check server-side.
// A child able to call this could wipe the household's HA connection
// (clear) or repoint every other HA route (ha-control, ha-cameras, etc.)
// at a server they control.
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  const { householdId } = caller;

  const rl = await checkRateLimit(householdId, 'settings-ha', 20);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  if (req.method === 'GET') {
    // Read-only status check — no admin gate needed, matches the existing
    // household-wide-status pattern used by gmail-status.ts.
    const stored = await dbGetHouseholdHA(householdId);
    return j({ set: Boolean(stored.ha_url && stored.ha_token_encrypted), url: stored.ha_url });
  }

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const isAdmin = caller.role === 'admin' || caller.role === 'superadmin';
  if (!isAdmin) return j({ error: 'Only an admin can change the Home Assistant connection' }, 403);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(SettingsHaBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);

  try {
    if (parsed.data.action === 'clear') {
      await dbSetHouseholdHA(householdId, null, null);
      return j({ ok: true });
    }

    const { url, token } = parsed.data;

    // Best-effort SSRF guard — see api/_urlSafety.ts's doc comment for what
    // this does and doesn't protect against (no DNS-rebinding protection
    // possible on Edge runtime). Real value here is stopping a child (or
    // anyone bypassing the admin check above some other way) from pointing
    // this at an internal service, not a hard security boundary.
    const urlError = validateOutboundUrl(url);
    if (urlError) return j({ error: urlError }, 400);

    // Verify the connection works before saving anything. redirect: 'manual'
    // stops a 3xx response from silently retargeting this request at an
    // internal address that validateOutboundUrl never saw.
    try {
      const testRes = await fetch(`${url}/api/`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'manual',
      });
      if (testRes.type === 'opaqueredirect' || (testRes.status >= 300 && testRes.status < 400)) {
        return j({ error: 'That URL redirected — point this directly at your Home Assistant instance.' }, 400);
      }
      if (!testRes.ok) return j({ error: `Could not connect to Home Assistant: ${testRes.status}` }, 400);
    } catch {
      return j({ error: 'Could not reach that Home Assistant URL. Check it is correct and publicly reachable.' }, 400);
    }

    const encrypted = await encryptSecret(token);
    await dbSetHouseholdHA(householdId, url, encrypted);
    return j({ ok: true, url });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to save Home Assistant connection', 'settings-ha', e);
  }
}
