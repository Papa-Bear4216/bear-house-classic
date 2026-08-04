export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbGetHouseholdMemory, dbAddHouseholdMemory, dbClearHouseholdMemory } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, MemoryBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

// Household-wide Hermes memory (replaces per-device localStorage
// 'hermes_memory'). Any member's device can add a note; every device in
// the household sees it, via household_memory (see api/_db.ts).
export default async function handler(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'memory', 60);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  if (req.method === 'GET') {
    try {
      const notes = await dbGetHouseholdMemory(householdId);
      return j({ notes });
    } catch (e: any) {
      return serverError(e?.message || 'Failed to load memory', 'memory', e);
    }
  }

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(MemoryBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);

  try {
    if (parsed.data.action === 'clear') {
      await dbClearHouseholdMemory(householdId);
      return j({ ok: true });
    }
    await dbAddHouseholdMemory(householdId, parsed.data.text, 'auto');
    return j({ ok: true });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to update memory', 'memory', e);
  }
}
