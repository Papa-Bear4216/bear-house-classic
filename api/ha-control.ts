/**
 * /api/ha-control — Bear House → Home Assistant device control (Edge Runtime)
 *
 * Outbound counterpart to api/ha-webhook.ts (HA -> app). Lets Hermes
 * actually flip devices instead of just reacting to HA events. Deliberately
 * narrow allowlist (see _schemas.ts HaControlBodySchema) — lights/switches/
 * locks/climate/fans/covers only, no domain that could run arbitrary code.
 *
 * Env vars needed (shared with api/ha-cameras.ts):
 *   HOME_ASSISTANT_URL, HOME_ASSISTANT_TOKEN
 */
export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, HaControlBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'ha-control', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const HA_URL = process.env.HOME_ASSISTANT_URL;
  const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN;
  if (!HA_URL || !HA_TOKEN) return serverError('Home Assistant is not configured', 'ha-control');

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(HaControlBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { domain, service, entityId } = parsed.data;

  // entity_id's domain prefix must match the requested service domain —
  // stops e.g. calling light.turn_off on a lock.* entity.
  if (!entityId.startsWith(`${domain}.`)) {
    return j({ error: `entityId must start with "${domain}."` }, 400);
  }

  try {
    const res = await fetch(`${HA_URL}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HA_TOKEN}` },
      body: JSON.stringify({ entity_id: entityId }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return j({ error: `HA ${res.status}: ${detail.slice(0, 200)}` }, res.status);
    }
    return j({ ok: true });
  } catch (e: any) {
    return serverError(e?.message || 'Network error reaching Home Assistant', 'ha-control', e);
  }
}
