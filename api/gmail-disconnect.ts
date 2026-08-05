export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbGetHouseholdMembersByHouseholdId, dbClearMemberGmailToken } from './_db.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody } from './_schemas.js';
import { z } from 'zod';
import { json as j, serverError } from './_responseHelpers.js';

const BodySchema = z.object({ memberId: z.string().min(1) });

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'gmail-disconnect', 20);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(BodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);

  const members = await dbGetHouseholdMembersByHouseholdId(householdId);
  if (!members.some(m => m.id === parsed.data.memberId)) return j({ error: 'Member not found in this household' }, 404);

  try {
    await dbClearMemberGmailToken(parsed.data.memberId);
    return j({ ok: true });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to disconnect', 'gmail-disconnect', e);
  }
}
