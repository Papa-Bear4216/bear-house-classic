export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbGetHouseholdMembersByHouseholdId, dbGetHouseholdGmailStatus } from './_db.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { json as j, serverError } from './_responseHelpers.js';

// Returns per-member connection status (masked email only — never the
// token) so the Settings UI can show whose Gmail is connected household-wide.
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'gmail-status', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  try {
    const members = await dbGetHouseholdMembersByHouseholdId(householdId);
    const rows = await dbGetHouseholdGmailStatus(householdId);
    const emailByMember = new Map(rows.map(r => [r.id, r.gmail_connected_email]));

    const statuses = members.map(m => ({
      memberId: m.id,
      name: m.name,
      connected: !!emailByMember.get(m.id),
      email: emailByMember.get(m.id) || null,
    }));
    return j({ members: statuses });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to load status', 'gmail-status', e);
  }
}
