// api/coparent-toggle.ts — toggle co-parenting mode on/off for a family.
export const config = { runtime: 'edge' };

import { requireBillingRole } from './_billingAuth.js';
import { json as j, serverError } from './_responseHelpers.js';
import { handleCorsPreflight } from './_cors.js';
import { resolveHouseholdId } from './_familyAuth.js';

const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return j({ error: 'Missing bearer token' }, 401);

  // Resolve caller's household from the token.
  const callerHouseholdId = await resolveHouseholdId(token);
  if (!callerHouseholdId) return j({ error: 'Invalid session' }, 401);

  // Service-role for writes.
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const headers = {
    'apikey': process.env.SUPABASE_ANON_KEY!,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // Fetch the family for this household via the link table (two-step lookup:
  // PostgREST ignores relation filters on the families table directly, so query
  // household_family_link first, then families by id).
  const linkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_family_link?household_id=eq.${encodeURIComponent(callerHouseholdId)}&select=family_id`,
    { headers }
  );
  if (!linkRes.ok) return serverError('Household link lookup failed', 'coparent-toggle', String(linkRes.status));
  const linkRows: any[] = await linkRes.json();
  if (linkRows.length === 0) return j({ error: 'Household is not linked to a family' }, 400);
  const familyId = linkRows[0].family_id;

  const famRes = await fetch(
    `${SUPABASE_URL}/rest/v1/families?id=eq.${encodeURIComponent(familyId)}&select=id,mode,merge_consent_household_id`,
    { headers }
  );
  if (!famRes.ok) return serverError('Family lookup failed', 'coparent-toggle', String(famRes.status));
  const famRows: any[] = await famRes.json();
  if (famRows.length === 0) return j({ error: 'Family not found' }, 404);
  const family = famRows[0];

  // Verify caller has admin/superadmin role in their own household. This must
  // check callerHouseholdId (derived from the token), never a client-supplied
  // household id — a caller who's admin of some unrelated household could
  // otherwise pass its id to pass this check while the mutation below still
  // acts on their own (different) household/family.
  const auth = await requireBillingRole(req, callerHouseholdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

  const isCoparent = family.mode === 'coparent';

  if (isCoparent) {
    // Merge is handled by the dual-consent flow — both households must
    // consent first. Redirect callers here rather than attempting a
    // one-sided merge that would leave the family in an inconsistent state.
    return j({ error: 'Use /api/coparent-merge-consent to merge — both households must consent first.' }, 400);
  }

  // --- TOGGLE ON: enable co-parenting ---
  // The caller's household is always already linked here — it's how `family`
  // was resolved above (via household_family_link on callerHouseholdId) —
  // and setup.ts always links a brand-new household as 'primary'. So the
  // caller's own link always exists and is always 'primary'; there is
  // nothing to create for it. Only the secondary side can be missing.
  const existingLinkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_family_link?family_id=eq.${family.id}&select=household_id,role_in_family`,
    { headers }
  );
  const existingLinks: any[] = await existingLinkRes.json();

  let secondaryHouseholdId: string | null = null;

  const primaryLink = existingLinks.find((l) => l.role_in_family === 'primary');
  const primaryHouseholdId = primaryLink?.household_id ?? callerHouseholdId;

  // Find an existing secondary, or create one.
  const secondaryLink = existingLinks.find((l) => l.role_in_family === 'secondary');
  if (secondaryLink) {
    secondaryHouseholdId = secondaryLink.household_id;
  } else {
    // Create a new secondary household.
    const nameRes = await fetch(
      `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(callerHouseholdId)}&select=name`,
      { headers }
    );
    const nameRows: any[] = await nameRes.json();
    const primaryName = nameRows[0]?.name || 'Home';

    const newHhRes = await fetch(`${SUPABASE_URL}/rest/v1/households`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ name: `${primaryName} — Second Home` }),
    });
    if (!newHhRes.ok) return serverError('Failed to create secondary household', 'coparent-toggle', newHhRes.status);
    const [newHh] = await newHhRes.json() as any[];
    secondaryHouseholdId = newHh.id;

    // The caller needs a membership row in the new secondary household so they
    // aren't locked out of it — mirror the superadmin pattern setup.ts uses for
    // a fresh household.
    // Resolve the caller's auth user id so the membership row is owned (mirrors
    // setup.ts's getAuthUserId pattern). Fall back to null if the Auth API is
    // unreachable — the row can be claimed on a later sign-in.
    const authUserRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
    });
    const authUser = authUserRes.ok ? (await authUserRes.json() as any) : null;
    const authUserId = authUser?.id ?? null;

    const memberRes = await fetch(`${SUPABASE_URL}/rest/v1/household_members`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        household_id: newHh.id,
        auth_user_id: authUserId,
        name: primaryName,
        role: 'superadmin',
        color: 'emerald',
      }),
    });
    if (!memberRes.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/households?id=eq.${newHh.id}`, { method: 'DELETE', headers });
      const detail = await memberRes.text().catch(() => '');
      return serverError(`Failed to add caller to secondary household: ${detail}`, 'coparent-toggle:member', detail);
    }
    await fetch(`${SUPABASE_URL}/rest/v1/household_family_link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ household_id: secondaryHouseholdId, family_id: family.id, role_in_family: 'secondary' }),
    });
  }

  // Set mode to coparent.
  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/families?id=eq.${family.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ mode: 'coparent' }),
  });
  if (!updateRes.ok) return serverError('Failed to enable co-parenting', 'coparent-toggle', updateRes.status);

  return j({
    ok: true,
    mode: 'coparent',
    primaryHouseholdId,
    secondaryHouseholdId,
    householdId: callerHouseholdId,
  });
}
