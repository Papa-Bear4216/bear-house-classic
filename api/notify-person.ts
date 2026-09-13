/**
 * /api/notify-person — send a push notification to one specific household
 * member's device(s), instead of the whole household (contrast with
 * notifyPush in api/_notify.ts, which is household-wide).
 *
 * Reuses sendPushToTokens() from _notify.ts so the FCM JWT-signing and
 * dead-token-pruning logic exists in exactly one place.
 */
export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbGetDeviceTokensByPersonId, dbGetHouseholdMemberById } from './_db.js';
import { sendPushToTokens } from './_notify.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, NotifyPersonBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'notify-person', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(NotifyPersonBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { personId, title, body } = parsed.data;

  try {
    const member = await dbGetHouseholdMemberById(personId);
    if (!member || member.household_id !== householdId) {
      return j({ error: 'No member with that id in your household' }, 404);
    }

    const tokens = await dbGetDeviceTokensByPersonId(householdId, personId);
    if (!tokens.length) {
      return j({ error: `${member.name} doesn't have any devices registered yet` }, 404);
    }

    const sent = await sendPushToTokens(tokens, title, body);
    return j({ ok: true, deviceCount: sent });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to send notification', 'notify-person', e);
  }
}
