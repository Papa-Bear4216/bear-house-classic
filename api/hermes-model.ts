export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbSetHermesModelTier } from './_db.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, HermesModelTierBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

// Household-wide toggle: sonnet gives consistently better reasoning/action
// planning than the haiku default, at real per-message cost (~12x haiku).
// Self-serve — no unlock code, since this doesn't add a new capability,
// just spends more per message on the household's own shared/BYO key.
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'hermes-model', 20);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(HermesModelTierBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);

  try {
    await dbSetHermesModelTier(householdId, parsed.data.tier);
    return j({ ok: true, tier: parsed.data.tier });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to update model tier', 'hermes-model', e);
  }
}
