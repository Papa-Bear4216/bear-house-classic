/**
 * /api/ha-discover — Home Assistant entity discovery (Edge Runtime)
 *
 * Read-only counterpart to api/ha-control.ts. Lets Hermes list available
 * lights/switches/locks/climate/fans/covers/vacuums without the user having
 * to know or supply exact entity_ids up front.
 *
 * Env vars needed (shared with api/ha-control.ts): HOME_ASSISTANT_URL,
 * HOME_ASSISTANT_TOKEN — resolved per-household via resolveHaConfig, same
 * as ha-control.ts.
 */
export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { json as j, serverError } from './_responseHelpers.js';

// Same allowlist as HaControlBodySchema in _schemas.ts — keep in sync.
const CONTROLLABLE_DOMAINS = new Set(['light', 'switch', 'lock', 'climate', 'fan', 'cover', 'vacuum']);

interface HaEntity {
  entity_id: string;
  domain: string;
  state: string;
  friendly_name: string;
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'ha-discover', 20);
  if (!rl.allowed) {
    const retry = 'retryAfterSeconds' in rl ? rl.retryAfterSeconds : 20;
    return j({ error: `Rate limit exceeded, try again in ${retry}s` }, 429);
  }

  const { haUrl: HA_URL, haToken: HA_TOKEN } = await resolveHaConfig(householdId);
  if (!HA_URL || !HA_TOKEN) return serverError('Home Assistant is not configured', 'ha-discover');

  try {
    const res = await fetch(`${HA_URL}/api/states`, {
      headers: { Authorization: `Bearer ${HA_TOKEN}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return serverError(`Home Assistant returned ${res.status}: ${detail}`, 'ha-discover');
    }

    const states = (await res.json()) as any[];
    const entities: HaEntity[] = states
      .filter((s) => typeof s?.entity_id === 'string' && CONTROLLABLE_DOMAINS.has(s.entity_id.split('.')[0]))
      .map((s) => ({
        entity_id: s.entity_id,
        domain: s.entity_id.split('.')[0],
        state: s.state,
        friendly_name: s.attributes?.friendly_name || s.entity_id,
      }));

    return j({ ok: true, entities, count: entities.length });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to reach Home Assistant', 'ha-discover', e);
  }
}
