export const config = { runtime: 'edge' };

import { resolveCallerMember, dbGetHouseholdMembersByHouseholdId, dbClearMemberGmailToken } from './_db.js';
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
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(caller.householdId, 'gmail-disconnect', 20);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(BodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);

  const isAdmin = caller.role === 'admin' || caller.role === 'superadmin';
  if (parsed.data.memberId !== caller.memberId && !isAdmin) {
    return j({ error: 'Only an admin can disconnect Gmail for another member' }, 403);
  }
  const members = await dbGetHouseholdMembersByHouseholdId(caller.householdId);
  const target = members.find(m => m.id === parsed.data.memberId);
  if (!target) return j({ error: 'Member not found in this household' }, 404);
  if (target.role === 'superadmin' && parsed.data.memberId !== caller.memberId && caller.role !== 'superadmin') {
    return j({ error: "Only a superadmin can manage another superadmin's Gmail connection" }, 403);
  }

  try {
    await dbClearMemberGmailToken(parsed.data.memberId);
    return j({ ok: true });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to disconnect', 'gmail-disconnect', e);
  }
}
