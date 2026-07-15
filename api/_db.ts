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

/** Read a value by key from family_data table */
export async function dbGet(key: string): Promise<any> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/family_data?key=eq.${encodeURIComponent(key)}&select=value`,
    { headers: headers(anonKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0]?.value ?? null;
}

/** Upsert a value by key into family_data table */
export async function dbSet(key: string, value: any): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
    method: 'POST',
    headers: { ...headers(serviceKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbSet(${key}) failed: ${res.status} ${detail}`);
  }
}

/** Prepend one item to an array stored at key (read-modify-write) */
export async function dbPrepend(key: string, item: object): Promise<void> {
  const existing: any[] = (await dbGet(key)) ?? [];
  const arr = Array.isArray(existing) ? existing : [];
  await dbSet(key, [item, ...arr]);
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

/** Get the household_id from an existing member (used for new user assignment) */
export async function dbGetHouseholdId(): Promise<string | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?select=household_id&limit=1`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return null;
  const rows = await res.json() as any[];
  return rows[0]?.household_id ?? null;
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
