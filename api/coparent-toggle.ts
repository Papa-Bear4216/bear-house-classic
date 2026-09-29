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

  // The id of an existing household_members row in the caller's own
  // household — that person becomes superadmin of the new secondary
  // household on their next authenticated request (see
  // _familyAuth.ts's applyPendingTransition). Required when toggling on;
  // ignored when toggling off (redirects to the merge flow instead).
  const body = await req.json().catch(() => ({}));
  const transitioningMemberId: string | undefined = body?.transitioningMemberId;

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
    if (!transitioningMemberId) {
      return j({ error: 'transitioningMemberId is required to enable co-parenting — pick the household member moving to the new home.' }, 400);
    }

    // The transitioning member must be an existing row in the caller's OWN
    // household — never trust a client-supplied member id without checking
    // it actually belongs to the household the caller controls.
    const householdMembersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${encodeURIComponent(callerHouseholdId)}&select=id,name,role`,
      { headers }
    );
    if (!householdMembersRes.ok) return serverError('Household member lookup failed', 'coparent-toggle', householdMembersRes.status);
    const householdMemberRows: any[] = await householdMembersRes.json();
    const transitioningMember = householdMemberRows.find((m) => m.id === transitioningMemberId);
    if (!transitioningMember) {
      return j({ error: 'transitioningMemberId must be an existing member of your own household' }, 400);
    }

    // Don't strand the primary household without an admin — require at
    // least one other superadmin/admin remaining after this member leaves.
    const remainingAdmins = householdMemberRows.filter(
      (m) => m.id !== transitioningMemberId && (m.role === 'superadmin' || m.role === 'admin')
    );
    if (remainingAdmins.length === 0) {
      return j({ error: 'Cannot transition the only admin/superadmin — your household would be left without one' }, 400);
    }

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

    const linkNewRes = await fetch(`${SUPABASE_URL}/rest/v1/household_family_link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ household_id: secondaryHouseholdId, family_id: family.id, role_in_family: 'secondary' }),
    });
    if (!linkNewRes.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/households?id=eq.${newHh.id}`, { method: 'DELETE', headers });
      const detail = await linkNewRes.text().catch(() => '');
      return serverError(`Failed to link secondary household: ${detail}`, 'coparent-toggle:link', detail);
    }

    // Mark the transitioning member for the move. They become superadmin of
    // the new secondary household — and their own family_data/device_tokens
    // follow them — on their next authenticated request (see
    // _familyAuth.ts's applyPendingTransition), not immediately here. This
    // lets them keep their current session in the old household until they
    // actually visit next, rather than yanking their access mid-session.
    const markRes = await fetch(`${SUPABASE_URL}/rest/v1/household_members?id=eq.${transitioningMember.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        pending_transition_household_id: secondaryHouseholdId,
        pending_transition_role: 'superadmin',
      }),
    });
    if (!markRes.ok) {
      await fetch(`${SUPABASE_URL}/rest/v1/household_family_link?household_id=eq.${secondaryHouseholdId}`, { method: 'DELETE', headers });
      await fetch(`${SUPABASE_URL}/rest/v1/households?id=eq.${newHh.id}`, { method: 'DELETE', headers });
      const detail = await markRes.text().catch(() => '');
      return serverError(`Failed to mark transitioning member: ${detail}`, 'coparent-toggle:transition', detail);
    }
  }

  // Most custody/parenting orders require each parent to disclose their
  // address and contact info to the other — see /api/coparent-address's
  // GET response's `other` field and coparent_disclosure_statutes for the
  // state-specific citation. Require it before committing the mode change
  // rather than letting a family run co-parenting without ever exchanging
  // this information.
  const callerHhRes = await fetch(
    `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(callerHouseholdId)}&select=address_street,address_city,address_state,address_zip,contact_phone`,
    { headers }
  );
  if (!callerHhRes.ok) return serverError('Household lookup failed', 'coparent-toggle', callerHhRes.status);
  const [callerHh] = await callerHhRes.json() as any[];
  const hasAddress = !!(callerHh?.address_street && callerHh?.address_city && callerHh?.address_state && callerHh?.address_zip && callerHh?.contact_phone);
  if (!hasAddress) {
    return j({ error: 'Enter your household address and phone number before enabling co-parenting (required for the other parent to reach you).' }, 400);
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
