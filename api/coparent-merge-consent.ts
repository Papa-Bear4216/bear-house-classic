// api/coparent-merge-consent.ts — dual-consent merge flow.
// Each parent types "Make my family whole again" to record their consent.
// Merge executes only when BOTH households have consented.
export const config = { runtime: 'edge' };

import { requireBillingRole } from './_billingAuth.js';
import { json as j, serverError } from './_responseHelpers.js';
import { handleCorsPreflight } from './_cors.js';
import { resolveHouseholdId } from './_familyAuth.js';

const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';
const CONSENT_PHRASE = 'Make my family whole again';

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return j({ error: 'Missing bearer token' }, 401);

  const callerHouseholdId = await resolveHouseholdId(token);
  if (!callerHouseholdId) return j({ error: 'Invalid session' }, 401);

  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const headers = {
    'apikey': process.env.SUPABASE_ANON_KEY!,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  const body = await req.json().catch(() => ({}));
  const { action, phrase } = body as { action?: string; phrase?: string };

  // Fetch the family for the caller's household via the link table (two-step
  // lookup: PostgREST ignores relation filters on the families table directly).
  const linkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_family_link?household_id=eq.${encodeURIComponent(callerHouseholdId)}&select=family_id`,
    { headers }
  );
  if (!linkRes.ok) return serverError('Household link lookup failed', 'coparent-merge-consent', String(linkRes.status));
  const linkRows: any[] = await linkRes.json();
  if (linkRows.length === 0) return j({ error: 'Household is not linked to a family' }, 400);
  const familyId = linkRows[0].family_id;

  const famRes = await fetch(
    `${SUPABASE_URL}/rest/v1/families?id=eq.${encodeURIComponent(familyId)}&select=id,mode`,
    { headers }
  );
  if (!famRes.ok) return serverError('Family lookup failed', 'coparent-merge-consent', String(famRes.status));
  const famRows: any[] = await famRes.json();
  if (famRows.length === 0) return j({ error: 'Family not found' }, 404);
  const family = famRows[0];

  if (family.mode !== 'coparent') {
    return j({ error: 'Not in co-parenting mode — nothing to merge' }, 400);
  }

  // Verify caller has admin/superadmin role in their household.
  const auth = await requireBillingRole(req, callerHouseholdId);
  if (auth.ok === false) return j({ error: auth.error }, auth.status);

  // Fetch both household links.
  const primRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_family_link?family_id=eq.${family.id}&role_in_family=eq.primary&select=household_id`
  );
  const secRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_family_link?family_id=eq.${family.id}&role_in_family=eq.secondary&select=household_id`
  );
  const [primRows, secRows] = await Promise.all([primRes.json(), secRes.json()]);
  const primaryHouseholdId = primRows[0]?.household_id;
  const secondaryHouseholdId = secRows[0]?.household_id;

  if (!primaryHouseholdId || !secondaryHouseholdId) {
    return j({ error: 'Family links incomplete' }, 400);
  }

  // Check existing consents in the dual-consent table.
  const consentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/coparent_merge_consent?family_id=eq.${family.id}&select=household_id`
  );
  const consentRows: any[] = consentRes.ok ? await consentRes.json() : [];
  const consentedHouseholds = new Set(consentRows.map((r) => r.household_id));

  // --- CANCEL: clear a pending merge request ---
  if (action === 'cancel') {
    await fetch(`${SUPABASE_URL}/rest/v1/coparent_merge_consent?family_id=eq.${family.id}`, {
      method: 'DELETE',
      headers,
    });
    await fetch(`${SUPABASE_URL}/rest/v1/families?id=eq.${family.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ merge_initiated_by: null, merge_initiated_at: null }),
    });
    return j({ ok: true, status: 'cancelled' });
  }

  // --- REQUEST: initiate a merge request (no phrase needed, just flags intent) ---
  if (action === 'request') {
    if (consentedHouseholds.size > 0) {
      return j({ error: 'Consent already recorded. Use cancel to start over.' }, 409);
    }
    const initiatorRes = await fetch(`${SUPABASE_URL}/rest/v1/families?id=eq.${family.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        merge_initiated_by: callerHouseholdId,
        merge_initiated_at: new Date().toISOString(),
      }),
    });
    if (!initiatorRes.ok) return serverError('Failed to record merge request', 'coparent-merge-consent', String(initiatorRes.status));
    return j({ ok: true, status: 'pending', initiatorHouseholdId: callerHouseholdId });
  }

  // --- CONSENT: validate phrase and record household's consent ---
  if (action === 'consent') {
    if (!phrase || phrase !== CONSENT_PHRASE) {
      return j({ error: 'Incorrect phrase. Please type it exactly as shown.' }, 400);
    }

    // Check if already consented.
    if (consentedHouseholds.has(callerHouseholdId)) {
      return await checkAndMaybeMerge(family.id, primaryHouseholdId, secondaryHouseholdId, consentedHouseholds, headers, serviceKey, SUPABASE_URL);
    }

    // Insert consent row.
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/coparent_merge_consent`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ family_id: family.id, household_id: callerHouseholdId }),
    });

    if (!upsertRes.ok && upsertRes.status !== 409) {
      return serverError('Failed to record consent', 'coparent-merge-consent', String(upsertRes.status));
    }

    // Re-fetch consents after insert.
    const updatedConsentRes = await fetch(
      `${SUPABASE_URL}/rest/v1/coparent_merge_consent?family_id=eq.${family.id}&select=household_id`
    );
    const updatedRows: any[] = updatedConsentRes.ok ? await updatedConsentRes.json() : consentRows;
    const updatedSet = new Set(updatedRows.map((r) => r.household_id));

    return await checkAndMaybeMerge(family.id, primaryHouseholdId, secondaryHouseholdId, updatedSet, headers, serviceKey, SUPABASE_URL);
  }

  // --- STATUS: check merge readiness ---
  if (action === 'status') {
    return j({
      ok: true,
      status: consentedHouseholds.size === 0 ? 'idle' : 'pending',
      mode: 'coparent',
      primaryHouseholdId,
      secondaryHouseholdId,
      consentedHouseholdIds: Array.from(consentedHouseholds),
      initiatedBy: family.merge_initiated_by,
      initiatedAt: family.merge_initiated_at,
      ready: consentedHouseholds.has(primaryHouseholdId) && consentedHouseholds.has(secondaryHouseholdId),
    });
  }

  return j({ error: 'Unknown action' }, 400);
}

async function checkAndMaybeMerge(
  familyId: string,
  primaryHouseholdId: string,
  secondaryHouseholdId: string,
  consentedHouseholds: Set<string>,
  headers: Record<string, string>,
  serviceKey: string,
  baseUrl: string
): Promise<Response> {
  // Both must have consented.
  if (!consentedHouseholds.has(primaryHouseholdId) || !consentedHouseholds.has(secondaryHouseholdId)) {
    return new Response(JSON.stringify({ ok: true, status: 'pending', ready: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Both consented — execute merge.
  // 1. Set family mode back to single.
  const famUpdate = await fetch(`${baseUrl}/rest/v1/families?id=eq.${familyId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ mode: 'single', merge_initiated_by: null, merge_initiated_at: null }),
  });
  if (!famUpdate.ok) return serverError('Merge: failed to reset family mode', 'coparent-merge-consent', String(famUpdate.status));

  // 2. Move all members from secondary to primary FIRST — do this before
  //    removing the household_family_link, so a partial failure does not
  //    orphan members (they would have no household record and resolveFamilyId
  //    would return null for them going forward).
  const membersInSecondaryRes = await fetch(`${baseUrl}/rest/v1/household_members?household_id=eq.${secondaryHouseholdId}&select=id`, {
    headers: { ...headers, 'Prefer': 'return=minimal' },
  });
  const membersInSecondary: any[] = membersInSecondaryRes.ok ? await membersInSecondaryRes.json() : [];
  for (const member of membersInSecondary) {
    const moveRes = await fetch(`${baseUrl}/rest/v1/household_members?id=eq.${member.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ household_id: primaryHouseholdId }),
    });
    if (!moveRes.ok) return serverError('Merge: failed to move a member to primary', 'coparent-merge-consent', String(moveRes.status));
  }

  // 3. Only remove the secondary link once every member has moved successfully.
  const secLinkDelete = await fetch(`${baseUrl}/rest/v1/household_family_link?household_id=eq.${secondaryHouseholdId}&family_id=eq.${familyId}`, {
    method: 'DELETE',
    headers,
  });
  if (!secLinkDelete.ok && secLinkDelete.status !== 404) return serverError('Merge: failed to remove secondary link', 'coparent-merge-consent', String(secLinkDelete.status));

  // 4. Clean up consent rows.
  await fetch(`${baseUrl}/rest/v1/coparent_merge_consent?family_id=eq.${familyId}`, {
    method: 'DELETE',
    headers,
  });

  return new Response(JSON.stringify({
    ok: true,
    status: 'merged',
    mode: 'single',
    primaryHouseholdId,
    secondaryHouseholdId,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
