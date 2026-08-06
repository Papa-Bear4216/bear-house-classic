export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbGetHouseholdActivity, dbAddHouseholdActivity } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, ActivityBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';
import { handleCorsPreflight } from './_cors.js';

// Household activity feed — "who did what" so members don't have to ask
// each other what changed. Logged client-side at each mutation site (see
// src/lib/householdActivity.ts) since task/shopping/etc. writes go through
// family_data (src/lib/sync.ts), not server API routes.
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'activity', 120);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  if (req.method === 'GET') {
    try {
      const entries = await dbGetHouseholdActivity(householdId);
      return j({ entries });
    } catch (e: any) {
      return serverError(e?.message || 'Failed to load activity', 'activity', e);
    }
  }

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(ActivityBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);

  try {
    await dbAddHouseholdActivity(householdId, parsed.data.actorName, parsed.data.text);
    return j({ ok: true });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to log activity', 'activity', e);
  }
}
