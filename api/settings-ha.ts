export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbGetHouseholdHA, dbSetHouseholdHA } from './_db.js';
import { encryptSecret } from './_crypto.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, SettingsHaBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

import { handleCorsPreflight } from './_cors.js';
// Lets a household bring their own Home Assistant instance (self-hosted or
// Nabu Casa URL) instead of this app's shared HOME_ASSISTANT_URL/TOKEN (see
// api/_haConfig.ts, used by every HA route). GET returns connection status
// only — the token is never sent back to the browser once saved.
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'settings-ha', 20);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  if (req.method === 'GET') {
    const stored = await dbGetHouseholdHA(householdId);
    return j({ set: Boolean(stored.ha_url && stored.ha_token_encrypted), url: stored.ha_url });
  }

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(SettingsHaBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);

  try {
    if (parsed.data.action === 'clear') {
      await dbSetHouseholdHA(householdId, null, null);
      return j({ ok: true });
    }

    const { url, token } = parsed.data;

    // Verify the connection works before saving anything.
    try {
      const testRes = await fetch(`${url}/api/`, { headers: { Authorization: `Bearer ${token}` } });
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
