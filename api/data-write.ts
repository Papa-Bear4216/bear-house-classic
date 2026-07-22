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

import { parseBody, DataWriteBodySchema } from './_schemas.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zjialvdolbkccduuwsck.supabase.co';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

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
  const { key, value, householdId } = parsed.data;

  // Write via PostgREST using the service_role key (bypasses RLS).
  const res = await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, value, household_id: householdId, updated_at: new Date().toISOString() }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    return j({ error: `Supabase write failed: ${res.status} ${detail.slice(0, 200)}` }, 502);
  }

  return j({ ok: true });
}
