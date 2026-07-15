/**
 * Supabase REST helpers — no SDK, pure fetch, works in Edge Functions.
 * Underscore prefix means Vercel won't expose this as a route.
 *
 * Server-only code (never bundled to the browser), so this uses the
 * service_role key to bypass RLS — same trust boundary as api/data-write.ts.
 * The anon key can no longer write since RLS was locked down (see
 * docs/fix-family-data-rls.sql).
 */
const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

function headers(key: string) {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Resolve the caller's household_id from a verified Supabase access token.
 * NEVER trust a client-supplied household_id — service_role writes bypass
 * RLS, so the household_id is the only thing enforcing tenant isolation.
 * Returns null if the token is invalid or the user has no household row.
 */
export async function resolveHouseholdId(accessToken: string): Promise<string | null> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json() as any;
  if (!user?.id) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?auth_user_id=eq.${user.id}&select=household_id`,
    { headers: headers(serviceKey) }
  );
  if (!memberRes.ok) return null;
  const rows = await memberRes.json() as any[];
  return rows[0]?.household_id ?? null;
}

/**
 * For true background jobs (crons, external webhooks) with no per-request
 * auth session. Deliberate scope-reduction: assumes exactly one household
 * exists today and throws loudly otherwise, rather than silently guessing.
 * Revisit before a second household needs cron/webhook support.
 */
export async function soleHouseholdId(): Promise<string> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/households?select=id&limit=2`, {
    headers: headers(serviceKey),
  });
  if (!res.ok) throw new Error(`soleHouseholdId: households lookup failed: ${res.status}`);
  const rows = await res.json() as any[];
  if (rows.length === 0) throw new Error('soleHouseholdId: no households exist');
  if (rows.length > 1) throw new Error('soleHouseholdId: more than one household exists — background jobs need real household_id threading now');
  return rows[0].id;
}

/** Read a value by key, scoped to one household, from family_data table */
export async function dbGet(key: string, householdId: string): Promise<any> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/family_data?key=eq.${encodeURIComponent(key)}&household_id=eq.${encodeURIComponent(householdId)}&select=value`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0]?.value ?? null;
}

/** Upsert a value by key, scoped to one household, into family_data table */
export async function dbSet(key: string, householdId: string, value: any): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
    method: 'POST',
    headers: { ...headers(serviceKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, household_id: householdId, value }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSet(${key}) failed: ${res.status} ${detail}`);
  }
}

/** Prepend one item to an array stored at key (read-modify-write), scoped to one household */
export async function dbPrepend(key: string, householdId: string, item: object): Promise<void> {
  const existing: any[] = (await dbGet(key, householdId)) ?? [];
  const arr = Array.isArray(existing) ? existing : [];
  await dbSet(key, householdId, [item, ...arr]);
}

/** Get a household member by email (uses service role to bypass RLS) */
export async function dbGetHouseholdMemberByEmail(email: string): Promise<{id: string; name: string; email: string; role: string; color: string} | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?email=eq.${encodeURIComponent(email)}&select=id,name,email,role,color`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    color: row.color,
  };
}

/** Get a household member by id (uses service role to bypass RLS) */
export async function dbGetHouseholdMemberById(id: string): Promise<{id: string; name: string; email: string | null; role: string; color: string; pin_hash: string | null} | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?id=eq.${encodeURIComponent(id)}&select=id,name,email,role,color,pin_hash`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0] ?? null;
}

/** Get all household members for a given household_id (uses service role to bypass RLS) */
export async function dbGetHouseholdMembersByHouseholdId(householdId: string): Promise<Array<{id: string; name: string; email: string | null; role: string; color: string; pin_hash: string | null; household_id: string}> | []> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&select=id,name,email,role,color,pin_hash,household_id`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return [];
  return await res.json() as any[];
}

/** Create a new household member */
export async function dbCreateHouseholdMember(member: {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  household_id: string;
}): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/household_members`, {
    method: 'POST',
    headers: { ...headers(serviceKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(member),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbCreateHouseholdMember failed: ${res.status} ${detail}`);
  }
}
