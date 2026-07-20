const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

export async function requireBillingRole(
  req: Request,
  householdId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing bearer token' };
  }
  const accessToken = authHeader.slice('Bearer '.length);
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!anonKey || !serviceKey) {
    return { ok: false, status: 500, error: 'Billing auth is not configured (missing Supabase keys)' };
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return { ok: false, status: 401, error: 'Invalid session' };
  const user = await userRes.json() as any;

  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?auth_user_id=eq.${user.id}&household_id=eq.${householdId}&select=role`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!memberRes.ok) {
    return { ok: false, status: 502, error: 'Failed to look up household membership' };
  }
  const rows = await memberRes.json() as any[];
  const role = rows[0]?.role;

  if (role !== 'superadmin' && role !== 'admin') {
    return { ok: false, status: 403, error: 'Only superadmin/admin can manage billing' };
  }
  return { ok: true };
}
