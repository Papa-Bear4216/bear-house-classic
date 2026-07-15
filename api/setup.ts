// api/setup.ts — creates a new household + its first (superadmin) member.
export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Resolve the caller's auth.users id from their Supabase access token.
// Never trust a client-supplied auth_user_id directly.
async function getAuthUserId(accessToken: string): Promise<{ id: string; email: string | null } | null> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const user = await res.json() as any;
  return user?.id ? { id: user.id, email: user.email ?? null } : null;
}
// Note: this duplicates api/_db.ts's resolveHouseholdId() auth-token verification
// step by design — setup.ts runs BEFORE a household_members row exists, so it
// can't reuse resolveHouseholdId() (which looks one up and returns null if missing).

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!accessToken) return j({ error: 'Missing Authorization bearer token' }, 401);

  const authUser = await getAuthUserId(accessToken);
  if (!authUser) return j({ error: 'Invalid or expired session' }, 401);

  const body = (await req.json().catch(() => ({}))) as any;
  const { action } = body;

  if (action === 'createHousehold') {
    const householdName = (body.householdName || '').trim();
    const memberName = (body.memberName || '').trim();
    if (!householdName) return j({ error: 'Household name is required' }, 400);
    if (!memberName) return j({ error: 'Your name is required' }, 400);

    const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };

    // Guard: this auth user shouldn't already belong to a household.
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/household_members?auth_user_id=eq.${authUser.id}&select=id`,
      { headers }
    );
    const existing = existingRes.ok ? await existingRes.json() as any[] : [];
    if (existing.length > 0) return j({ error: 'You already belong to a household' }, 409);

    const householdRes = await fetch(`${SUPABASE_URL}/rest/v1/households`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ name: householdName, subscription_status: 'none' }),
    });
    if (!householdRes.ok) {
      const detail = await householdRes.text().catch(() => '');
      return j({ error: `Failed to create household: ${detail}` }, 500);
    }
    const [household] = await householdRes.json() as any[];

    const memberRes = await fetch(`${SUPABASE_URL}/rest/v1/household_members`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        household_id: household.id,
        auth_user_id: authUser.id,
        name: memberName,
        email: authUser.email,
        role: 'superadmin',
        color: 'indigo',
      }),
    });
    if (!memberRes.ok) {
      const detail = await memberRes.text().catch(() => '');
      // Roll back the orphaned household so retries don't pile up dead rows.
      await fetch(`${SUPABASE_URL}/rest/v1/households?id=eq.${household.id}`, { method: 'DELETE', headers });
      return j({ error: `Failed to create member: ${detail}` }, 500);
    }

    return j({ ok: true, householdId: household.id });
  }

  return j({ error: 'Unknown action. Use: createHousehold' }, 400);
}
