// api/triad-notify.ts
export const config = { runtime: 'edge' };

import { handleCorsPreflight } from './_cors.js';
import { json as j, serverError } from './_responseHelpers.js';
import { resolveHouseholdId, dbGetPushTokensByHouseholdId } from './_db.js';
import { sendPushToTokens, notifyIFTTT } from './_notify.js';

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rawBody = await req.json().catch(() => ({}));
  const { title = 'Autonomous Triad Alert', body = '', status = 'info' } = rawBody;

  try {
    // 1. If IFTTT is configured, fire out-of-band maker webhook
    await notifyIFTTT('triad_alert', title, body, status);

    // 2. If household tokens exist, send FCM push notification
    let tokens: string[] = [];
    if (householdId) {
      tokens = await dbGetPushTokensByHouseholdId(householdId).catch(() => []);
    }

    let sentCount = 0;
    if (tokens.length > 0) {
      sentCount = await sendPushToTokens(tokens, title, body);
    }

    return j({
      ok: true,
      delivered: true,
      fcmCount: sentCount,
      title,
      status,
    });
  } catch (err: any) {
    return serverError(err?.message || 'Notification bridge error', 'triad-notify', err);
  }
}
