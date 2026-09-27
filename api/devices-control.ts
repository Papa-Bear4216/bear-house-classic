/**
 * /api/devices/control — Direct device control endpoint (Edge Runtime).
 *
 * Hermes calls this for full voice/device control. Accepts a
 * deviceId (HA entity_id) and action, resolves the household's
 * configured backend, and executes the command.
 *
 * If HA is not configured for this household, returns a clear
 * error rather than silently failing.
 *
 * Env vars: HOME_ASSISTANT_URL, HOME_ASSISTANT_TOKEN (shared fallback)
 */
export const config = { runtime: 'edge' };

import { resolveCallerMember, canControlDevices } from './_db.js';
import { dispatchDevice } from './_deviceDispatcher.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, DeviceControlBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  if (!canControlDevices(caller)) {
    return j({ error: 'This account is not permitted to control devices' }, 403);
  }
  const { householdId } = caller;

  const rl = await checkRateLimit(householdId, 'devices-control', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(DeviceControlBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { deviceId, action, params } = parsed.data;

  const result = await dispatchDevice(householdId, { deviceId, action, params });
  if (!result.ok) {
    return j({ error: result.error }, 500);
  }
  return j({ ok: true });
}
