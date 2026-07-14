/**
 * Supabase REST helpers — no SDK, pure fetch, works in Edge Functions.
 * Underscore prefix means Vercel won't expose this as a route.
 *
 * Server-only code (never bundled to the browser), so this uses the
 * service_role key to bypass RLS — same trust boundary as api/data-write.ts.
 * The anon key can no longer read/write once family_data RLS is tightened
 * to authenticated, household-scoped policies (see the multi-tenant
 * foundation plan's Task 6) — these are session-less cron/webhook
 * endpoints with no auth.uid(), so they must use service_role with
 * explicit household_id filtering for correctness instead of relying on
 * RLS to scope them.
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zjialvdolbkccduuwsck.supabase.co';

function headers(key: string) {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function serviceKey() {
  return process.env.SUPABASE_SERVICE_KEY!;
}

// There is exactly one household today (no live multi-tenant signups yet).
// Background jobs (crons/webhooks) have no session to derive a household
// from, so they resolve the sole household here. If a second household
// is ever created, this throws loudly instead of silently mixing data
// across tenants — that's the signal to build real per-household job
// routing, not a bug to work around.
let cachedHouseholdId: string | null = null;

async function soleHouseholdId(): Promise<string> {
  if (cachedHouseholdId) return cachedHouseholdId;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/households?select=id`, {
    headers: headers(serviceKey()),
  });
  if (!res.ok) throw new Error(`Failed to resolve household: ${res.status}`);
  const rows = await res.json() as { id: string }[];
  if (rows.length !== 1) {
    throw new Error(
      `Expected exactly 1 household, found ${rows.length} — background jobs need explicit household routing before multi-tenant launch`
    );
  }
  cachedHouseholdId = rows[0].id;
  return cachedHouseholdId;
}

/** Read a value by key (optionally household-scoped) from family_data table */
export async function dbGet(key: string, householdId?: string): Promise<any> {
  const hid = householdId ?? (await soleHouseholdId());
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/family_data?key=eq.${encodeURIComponent(key)}&household_id=eq.${encodeURIComponent(hid)}&select=value`,
    { headers: headers(serviceKey()) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0]?.value ?? null;
}

/** Upsert a value by key (optionally household-scoped) into family_data table */
export async function dbSet(key: string, value: any, householdId?: string): Promise<void> {
  const hid = householdId ?? (await soleHouseholdId());
  const res = await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
    method: 'POST',
    headers: { ...headers(serviceKey()), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value, household_id: hid }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSet(${key}) failed: ${res.status} ${detail}`);
  }
}

/** Prepend one item to an array stored at key (read-modify-write) */
export async function dbPrepend(key: string, item: object, householdId?: string): Promise<void> {
  const hid = householdId ?? (await soleHouseholdId());
  const existing: any[] = (await dbGet(key, hid)) ?? [];
  const arr = Array.isArray(existing) ? existing : [];
  await dbSet(key, [item, ...arr], hid);
}
