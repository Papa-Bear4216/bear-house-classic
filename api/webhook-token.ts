/**
 * /api/webhook-token — manage the household webhook token (Edge Runtime).
 *
 * POST { action: 'status' } -> { ok, hasToken }
 * POST { action: 'rotate' } -> { ok, token }  (raw token returned exactly once;
 *   only its SHA-256 hash is stored, and any legacy plaintext is cleared)
 *
 * Admin/superadmin only. External callers (IFTTT / Home Assistant / Tasker)
 * send the token in the x-webhook-token header.
 */
export const config = { runtime: 'edge' };

import { resolveCallerMember, dbSetHouseholdWebhookToken, dbHouseholdHasWebhookToken } from './_db.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { json as j, serverError } from './_responseHelpers.js';

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const accessToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  if (caller.role !== 'admin' && caller.role !== 'superadmin') return j({ error: 'Only an admin can manage the webhook token' }, 403);

  const rl = await checkRateLimit(caller.householdId, 'webhook-token', 10);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (body.action === 'status') {
      return j({ ok: true, hasToken: await dbHouseholdHasWebhookToken(caller.householdId) });
    }
    if (body.action === 'rotate') {
      const token = newToken();
      await dbSetHouseholdWebhookToken(caller.householdId, token);
      const res = j({ ok: true, token });
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
    return j({ error: 'Unknown action' }, 400);
  } catch (e: any) {
    return serverError(e?.message || 'Failed to update webhook token', 'webhook-token', e);
  }
}
