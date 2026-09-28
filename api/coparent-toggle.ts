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

  // Body: optional target household (defaults to caller's household if toggling on).
  const body = await req.json().catch(() => ({}));
  const targetHouseholdId = body.householdId || callerHouseholdId;

  // Fetch the family for this household.
  const famRes = await fetch(
    `${SUPABASE_URL}/rest/v1/families?household_family_link.household_id=eq.${encodeURIComponent(targetHouseholdId)}&select=id,mode,merge_consent_household_id`
  );
  if (!famRes.ok) return serverError('Family lookup failed', 'coparent-toggle', famRes.status);
  const famRows: any[] = await famRes.json();
  if (famRows.length === 0) return j({ error: 'Family not found' }, 404);
  const family = famRows[0];

  // Verify caller has admin/superadmin role in the target household.
  const auth = await requireBillingRole(req, targetHouseholdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

  const isCoparent = family.mode === 'coparent';

  if (isCoparent) {
    // --- TOGGLE OFF: merge back to single ---
    // Both households must have consented (merge_consent_household_id set to both primary and secondary).
    const primRes = await fetch(
      `${SUPABASE_URL}/rest/v1/household_family_link?family_id=eq.${family.id}&role_in_family=eq.primary&select=household_id`
    );
    const secRes = await fetch(
      `${SUPABASE_URL}/rest/v1/household_family_link?family_id=eq.${family.id}&role_in_family=eq.secondary&select=household_id`
    );
    const [primRows, secRows] = await Promise.all([primRes.json(), secRes.json()]);
    const primaryHouseholdId = primRows[0]?.household_id;
    const secondaryHouseholdId = secRows[0]?.household_id;

    if (!primaryHouseholdId) return j({ error: 'Primary household not found' }, 400);

    // Check consent: both households must have set merge_consent_household_id.
    const consentHouseholdId = family.merge_consent_household_id;
    if (!consentHouseholdId) {
      return j({ error: 'Merge not consented by all households. Both parents must type the consent phrase first.' }, 403);
    }

    // Execute merge: set mode to single, clear merge consent fields, remove secondary link.
    const afterMerge = await fetch(`${SUPABASE_URL}/rest/v1/families?id=eq.${family.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        mode: 'single',
        merge_consent_household_id: null,
        merge_initiated_by: null,
        merge_initiated_at: null,
      }),
    });
    if (!afterMerge.ok) return serverError('Merge failed', 'coparent-toggle', afterMerge.status);

    // Remove the secondary household family link (household itself stays, just unlinked).
    if (secondaryHouseholdId) {
      await fetch(`${SUPABASE_URL}/rest/v1/household_family_link?household_id=eq.${secondaryHouseholdId}`, {
        method: 'DELETE',
        headers,
      });
    }

    // Move all members from secondary to primary (if secondary existed).
    if (secondaryHouseholdId) {
      await fetch(`${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${secondaryHouseholdId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ household_id: primaryHouseholdId }),
      });
    }

    return j({ ok: true, mode: 'single', merged: true });
  }

  // --- TOGGLE ON: enable co-parenting ---
  // Create the secondary household if it doesn't exist yet.
  const hhRes = await fetch(
    `${SUPABASE_URL}/rest/v1/households?select=id,name&limit=100`,
    { headers }
  );
  const allHouseholds: any[] = await hhRes.json();

  const existingLinkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_family_link?family_id=eq.${family.id}&select=household_id,role_in_family`
  );
  const existingLinks: any[] = await existingLinkRes.json();
  const existingHouseholdIds = existingLinks.map((l) => l.household_id);

  let secondaryHouseholdId: string | null = null;

  if (!existingHouseholdIds.includes(callerHouseholdId)) {
    // The caller's household isn't linked to this family yet — link it as primary.
    await fetch(`${SUPABASE_URL}/rest/v1/household_family_link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ household_id: callerHouseholdId, family_id: family.id, role_in_family: 'primary' }),
    });
  }

  // Find or create a secondary household (different from primary).
  const primaryLink = existingLinks.find((l) => l.role_in_family === 'primary');
  const primaryHouseholdId = primaryLink?.household_id;

  if (!primaryHouseholdId) {
    // No primary yet — caller's household becomes primary.
    await fetch(`${SUPABASE_URL}/rest/v1/household_family_link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ household_id: callerHouseholdId, family_id: family.id, role_in_family: 'primary' }),
    });
  }

  // Find an existing secondary, or create one.
  const secondaryLink = existingLinks.find((l) => l.role_in_family === 'secondary');
  if (secondaryLink) {
    secondaryHouseholdId = secondaryLink.household_id;
  } else {
    // Create a new secondary household.
    const nameRes = await fetch(
      `${SUPABASE_URL}/rest/v1/households?id=eq.${encodeURIComponent(callerHouseholdId)}&select=name`
    );
    const nameRows: any[] = await nameRes.json();
    const primaryName = nameRows[0]?.name || 'Home';

    const newHhRes = await fetch(`${SUPABASE_URL}/rest/v1/households`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: `${primaryName} — Second Home` }),
    });
    if (!newHhRes.ok) return serverError('Failed to create secondary household', 'coparent-toggle', newHhRes.status);
    const newHh = await newHhRes.json();
    secondaryHouseholdId = newHh.id;

    // Link it to the family as secondary.
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
