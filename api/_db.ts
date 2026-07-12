/**
 * Supabase REST helpers — no SDK, pure fetch, works in Edge Functions.
 * Underscore prefix means Vercel won't expose this as a route.
 */
const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

function headers(anonKey: string) {
  return {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`,
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
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  await fetch(`${SUPABASE_URL}/rest/v1/family_data`, {
    method: 'POST',
    headers: { ...headers(anonKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value }),
  });
}

/** Prepend one item to an array stored at key (read-modify-write) */
export async function dbPrepend(key: string, item: object): Promise<void> {
  const existing: any[] = (await dbGet(key)) ?? [];
  const arr = Array.isArray(existing) ? existing : [];
  await dbSet(key, [item, ...arr]);
}
