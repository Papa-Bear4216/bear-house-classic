export const config = { runtime: 'edge' };

/**
 * Server-side write path for family_data.
 *
 * WHY THIS EXISTS: the browser must never hold the Supabase service_role key,
 * and once RLS is enabled (see docs/fix-family-data-rls.sql) the anon key can
 * no longer write. All cloud writes funnel through here so a single trusted
 * server holds the powerful key.
 *
 * GUARD: a shared secret (DATA_WRITE_SECRET) must match the x-write-secret
 * header. The client half ships in the bundle (VITE_DATA_WRITE_SECRET), so this
 * stops casual/automated abuse, not a determined attacker. The real protection
 * is that the service_role key itself never leaves the server. Upgrade path:
 * verify the caller's Google JWT server-side instead of a shared secret.
 */

import { checkRateLimit } from './_rateLimit.js';
import { parseBody, DataWriteBodySchema } from './_schemas.js';
import { json as j } from './_responseHelpers.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zjialvdolbkccduuwsck.supabase.co';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const writeSecret = process.env.DATA_WRITE_SECRET;
  if (!serviceKey) return j({ error: 'Server not configured: SUPABASE_SERVICE_KEY missing' }, 500);
  if (!writeSecret) return j({ error: 'Server not configured: DATA_WRITE_SECRET missing' }, 500);

  // Guard: reject callers without the shared secret.
  if (req.headers.get('x-write-secret') !== writeSecret) {
    return j({ error: 'Unauthorized' }, 401);
  }

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(DataWriteBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { key, value, householdId, expectedUpdatedAt } = parsed.data;

  const rl = await checkRateLimit(householdId, 'data-write', 60);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  // Optimistic concurrency: if the caller tells us what version it last saw,
  // reject the write when the row has moved on since then. This closes the
  // lost-update race (two devices editing the same key within the same
  // push window) without attempting to merge the two edits — we only have
  // whole-value blobs here, not deltas, so a real merge isn't possible. The
  // loser gets a 409 and re-pulls the winner's value instead of silently
  // clobbering it.
  if (expectedUpdatedAt) {
    const currentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/family_data?household_id=eq.${encodeURIComponent(householdId)}&key=eq.${encodeURIComponent(key)}&select=value,updated_at`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (currentRes.ok) {
      const rows = await currentRes.json().catch(() => []);
      const current = rows[0];
      if (current && current.updated_at !== expectedUpdatedAt) {
        return j({ error: 'Version conflict', current: current.value, currentUpdatedAt: current.updated_at }, 409);
      }
    }
  }

  // Write via PostgREST using the service_role key (bypasses RLS).
  const writtenAt = new Date().toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, value, household_id: householdId, updated_at: writtenAt }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    return j({ error: `Supabase write failed: ${res.status} ${detail.slice(0, 200)}` }, 502);
  }

  return j({ ok: true, updatedAt: writtenAt });
}
