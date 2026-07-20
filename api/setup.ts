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

  if (action === 'inviteMember') {
    const memberName = (body.memberName || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const role = body.role === 'admin' || body.role === 'child' ? body.role : 'child';
    const color = (body.color || 'slate').trim();
    if (!memberName) return j({ error: 'Name is required' }, 400);
    if (!email) return j({ error: 'Email is required' }, 400);

    const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };

    // Caller must be a superadmin/admin of a real household.
    const callerRes = await fetch(
      `${SUPABASE_URL}/rest/v1/household_members?auth_user_id=eq.${authUser.id}&select=household_id,role`,
      { headers }
    );
    const callerRows = callerRes.ok ? await callerRes.json() as any[] : [];
    const caller = callerRows[0];
    if (!caller || (caller.role !== 'superadmin' && caller.role !== 'admin')) {
      return j({ error: 'Only superadmin/admin can invite members' }, 403);
    }

    // Guard: email not already a member of this household.
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${caller.household_id}&email=eq.${encodeURIComponent(email)}&select=id`,
      { headers }
    );
    const existing = existingRes.ok ? await existingRes.json() as any[] : [];
    if (existing.length > 0) return j({ error: 'That email is already a member of this household' }, 409);

    // Pending row: no auth_user_id yet — claimed on the invitee's first sign-in.
    const memberRes = await fetch(`${SUPABASE_URL}/rest/v1/household_members`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        household_id: caller.household_id,
        auth_user_id: null,
        name: memberName,
        email,
        role,
        color,
      }),
    });
    if (!memberRes.ok) {
      const detail = await memberRes.text().catch(() => '');
      return j({ error: `Failed to create invite: ${detail}` }, 500);
    }

    const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email }),
    });
    if (!inviteRes.ok) {
      if (inviteRes.status === 422) {
        // Already a confirmed Supabase Auth user elsewhere — no invite email
        // needed, they can just sign in with Google and the app will claim
        // this pending row on their next sign-in via claimInvite.
        return j({ ok: true, note: 'This person already has an account — they can sign in directly to join.' });
      }
      const detail = await inviteRes.text().catch(() => '');
      return j({ error: `Member added, but the invite email failed to send: ${detail}` }, 502);
    }

    return j({ ok: true });
  }

  if (action === 'claimInvite') {
    if (!authUser.email) return j({ error: 'Your account has no email to match against' }, 400);

    const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    };

    const pendingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/household_members?email=eq.${encodeURIComponent(authUser.email)}&auth_user_id=is.null&select=id,household_id`,
      { headers }
    );
    const pendingRows = pendingRes.ok ? await pendingRes.json() as any[] : [];
    const pending = pendingRows[0];
    if (!pending) return j({ error: 'No pending invite found for your email' }, 404);

    const claimRes = await fetch(`${SUPABASE_URL}/rest/v1/household_members?id=eq.${pending.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ auth_user_id: authUser.id }),
    });
    if (!claimRes.ok) {
      const detail = await claimRes.text().catch(() => '');
      return j({ error: `Failed to claim invite: ${detail}` }, 500);
    }

    return j({ ok: true, householdId: pending.household_id });
  }

  return j({ error: 'Unknown action. Use: createHousehold | inviteMember | claimInvite' }, 400);
}
