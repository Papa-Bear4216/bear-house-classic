/**
 * /api/ha-cameras — pulls camera list + snapshots from a household's Home Assistant.
 *
 * Serves live interior camera footage, so it requires the caller's real household
 * session (same as every other authenticated route) rather than a static shared token.
 *
 * GET /api/ha-cameras                       -> list of camera entities
 * GET /api/ha-cameras?entity=camera.foo      -> single JPEG snapshot (base64 data URI)
 */
export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { checkRateLimit } from './_rateLimit.js';
import { json as j, serverError } from './_responseHelpers.js';
import { handleCorsPreflight } from './_cors.js';

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'ha-cameras', 60);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const url = new URL(req.url);
  const { haUrl: HA_URL, haToken: HA_TOKEN } = await resolveHaConfig(householdId);
  if (!HA_URL || !HA_TOKEN) return serverError('Home Assistant is not configured', 'ha-cameras');

  const haHeaders = { Authorization: `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' };
  const entity = url.searchParams.get('entity');

  try {
    if (entity) {
      const res = await fetch(`${HA_URL}/api/camera_proxy/${encodeURIComponent(entity)}`, { headers: haHeaders });
      if (!res.ok) return j({ error: `HA snapshot error: ${res.status}` }, res.status);
      const buf = await res.arrayBuffer();
      const b64 = bufToBase64(buf);
      return j({ entity, image: `data:image/jpeg;base64,${b64}` });
    }

    const res = await fetch(`${HA_URL}/api/states`, { headers: haHeaders });
    if (!res.ok) return j({ error: `HA states error: ${res.status}` }, res.status);
    const states = await res.json() as any[];
    const cameras = states
      .filter(s => s.entity_id?.startsWith('camera.'))
      .map(s => ({ entityId: s.entity_id, name: s.attributes?.friendly_name || s.entity_id, state: s.state }));

    return j({ cameras });
  } catch (e: any) {
    return serverError(e?.message || 'Home Assistant request failed', 'ha-cameras', e);
  }
}
