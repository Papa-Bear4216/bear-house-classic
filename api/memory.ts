export const config = { runtime: 'edge' };

import { resolveCallerMember, dbGetHouseholdMemory, dbAddHouseholdMemory, dbClearHouseholdMemory, dbGetPendingMemories, dbSetMemoryStatus } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, MemoryBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

import { handleCorsPreflight } from './_cors.js';
// Household-wide Hermes memory (replaces per-device localStorage
// 'hermes_memory'). Any member's device can add a note; every device in
// the household sees it, via household_memory (see api/_db.ts).
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken).catch(() => null) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  const householdId = caller.householdId;
  const isAdmin = caller.role === 'admin' || caller.role === 'superadmin';

  const rl = await checkRateLimit(householdId, 'memory', 60);
  if (!rl.allowed) {
    const retry = 'retryAfterSeconds' in rl ? rl.retryAfterSeconds : 60;
    return j({ error: `Rate limit exceeded, try again in ${retry}s` }, 429);
  }

  if (req.method === 'GET') {
    try {
      if (!isAdmin) return j({ notes: [] });
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
    if (!isAdmin) return j({ error: 'Admin role required for household memory changes.' }, 403);
    if (parsed.data.action === 'clear') {
      await dbClearHouseholdMemory(householdId);
      return j({ ok: true });
    }
    if (parsed.data.action === 'listPending') {
      return j({ notes: await dbGetPendingMemories(householdId) });
    }
    if (parsed.data.action === 'setStatus') {
      await dbSetMemoryStatus(parsed.data.id, householdId, parsed.data.status);
      return j({ ok: true });
    }
    const data = parsed.data;
    const status = data.inferred || data.kind === 'pattern' ? 'pending_review' : 'active';
    const result = await dbAddHouseholdMemory(householdId, data.text, {
      source: 'manual',
      memberId: data.memberId ?? caller.memberId,
      subjectMemberId: data.subjectMemberId,
      kind: data.kind || 'fact',
      importance: data.importance,
      status,
    });
    return j({ ok: true, result, status });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to update memory', 'memory', e);
  }
}
