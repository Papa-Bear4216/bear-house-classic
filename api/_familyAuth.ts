/**
 * Family-aware auth resolvers — Phase 0 coparent support.
 *
 * These supersede the single-household resolvers in _db.ts when the family
 * is in coparent mode. In single mode they return the same result.
 *
 * Callers that only need a household_id keep using resolveHouseholdId from
 * _db.ts until they migrate. Callers that need family context (active
 * household selection, multi-household awareness) use resolveFamilyId here.
 *
 * Trust boundary: same as _db.ts — service_role writes, household scoping
 * enforced in application code, never trust client-supplied household_id
 * without validating it belongs to the caller's family.
 */

const SUPABASE_URL = 'https://zjialvdolbkccduuwsck.supabase.co';

function headers(key: string) {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/** One family can hold multiple households (coparenting). */
export type FamilyMode = 'single' | 'coparent';

/** A household within a family, with the caller's role in it. */
export interface HouseholdInFamily {
  householdId: string;
  familyRole: 'primary' | 'secondary';
  /** The caller's role in this specific household (child, admin, etc.). */
  memberRole: string;
}

/** Full family resolution for a caller. */
export interface FamilyResolution {
  familyId: string;
  mode: FamilyMode;
  households: HouseholdInFamily[];
}

/**
 * Applies a pending household transition for a single member row, if one is
 * set: moves the member itself, then re-homes any of their personally-owned
 * family_data rows and device tokens so the data actually follows them
 * rather than staying invisible in the old household.
 *
 * Called lazily on the member's first authenticated request after
 * coparent-toggle marks them pending — there's no separate migration job.
 * Best-effort ordering (member row first, so a failure partway still leaves
 * the member reachable in their new household on retry; the owned-data
 * moves are idempotent re-homes keyed by owner_member_id, safe to retry).
 */
async function applyPendingTransition(
  member: { id: string; household_id: string; pending_transition_household_id: string | null; pending_transition_role: string | null },
  serviceKey: string
): Promise<{ id: string; household_id: string; role: string } | null> {
  if (!member.pending_transition_household_id) return null;
  const targetHouseholdId = member.pending_transition_household_id;
  const targetRole = member.pending_transition_role ?? 'superadmin';

  const moveRes = await fetch(`${SUPABASE_URL}/rest/v1/household_members?id=eq.${member.id}`, {
    method: 'PATCH',
    headers: { ...headers(serviceKey), Prefer: 'return=representation' },
    body: JSON.stringify({
      household_id: targetHouseholdId,
      role: targetRole,
      pending_transition_household_id: null,
      pending_transition_role: null,
    }),
  });
  if (!moveRes.ok) return null;
  const [moved] = (await moveRes.json()) as any[];

  // Re-home this member's own family_data rows (bank connections, personal
  // expenses, etc. — see 20260913000000_scope_family_data_by_owner.sql) so
  // they follow into the new household instead of becoming invisible under
  // the old one's RLS scoping.
  await fetch(`${SUPABASE_URL}/rest/v1/family_data?owner_member_id=eq.${member.id}`, {
    method: 'PATCH',
    headers: headers(serviceKey),
    body: JSON.stringify({ household_id: targetHouseholdId }),
  });

  // Re-home their push-notification device tokens the same way.
  await fetch(`${SUPABASE_URL}/rest/v1/device_tokens?person_id=eq.${member.id}`, {
    method: 'PATCH',
    headers: headers(serviceKey),
    body: JSON.stringify({ household_id: targetHouseholdId }),
  });

  return { id: moved.id, household_id: moved.household_id, role: moved.role };
}

/**
 * Resolve the caller's family from a verified Supabase access token.
 *
 * Returns the family, every household the caller belongs to (a child in a
 * coparent family has a household_members row in each parent's household),
 * and the active household:
 *  - If preferredHouseholdId is given, it must belong to the caller's family
 *    (validated); that household becomes active.
 *  - Otherwise the primary household is active.
 *  - Null if the token is invalid or the user has no household membership.
 */
export async function resolveFamilyId(
  accessToken: string,
  preferredHouseholdId?: string
): Promise<FamilyResolution | null> {
  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as any;
  if (!user?.id) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;

  // Every household_members row for this auth user.
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?auth_user_id=eq.${user.id}&select=id,household_id,role,pending_transition_household_id,pending_transition_role`,
    { headers: headers(serviceKey) }
  );
  if (!memberRes.ok) return null;
  const memberRows: any[] = await memberRes.json();
  if (memberRows.length === 0) return null;

  // Apply any pending household transition (co-parenting: an existing member
  // moving into a newly-created secondary household) before resolving family
  // context, so the rest of this call sees their post-transition household.
  for (let i = 0; i < memberRows.length; i++) {
    if (memberRows[i].pending_transition_household_id) {
      const applied = await applyPendingTransition(memberRows[i], serviceKey);
      if (applied) memberRows[i] = { ...memberRows[i], ...applied };
    }
  }

  // Each household's family link.
  const householdIds = memberRows.map((r) => r.household_id);
  const linkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_family_link?household_id=in.(${householdIds.map(encodeURIComponent).join(',')})&select=household_id,family_id,role_in_family`,
    { headers: headers(serviceKey) }
  );
  if (!linkRes.ok) return null;
  const links: any[] = await linkRes.json();

  const linkByHousehold = new Map(links.map((l) => [l.household_id, l]));

  const households: HouseholdInFamily[] = memberRows
    .map((m) => {
      const link = linkByHousehold.get(m.household_id);
      if (!link) return null;
      return {
        householdId: m.household_id,
        familyRole: (link.role_in_family ?? 'primary') as 'primary' | 'secondary',
        memberRole: m.role,
      };
    })
    .filter((h): h is HouseholdInFamily => h !== null);

  if (households.length === 0) return null;

  // All households must belong to the same family.
  const familyId = links[0]?.family_id;
  if (!familyId) return null;
  for (const h of households) {
    const link = linkByHousehold.get(h.householdId);
    if (link?.family_id !== familyId) return null;
  }

  // Family mode.
  const familyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/families?id=eq.${encodeURIComponent(familyId)}&select=mode`,
    { headers: headers(serviceKey) }
  );
  let mode: FamilyMode = 'single';
  if (familyRes.ok) {
    const familyRows: any[] = await familyRes.json();
    if (familyRows[0]?.mode === 'coparent') mode = 'coparent';
  }

  // Active household selection.
  let activeHouseholdId: string;
  if (preferredHouseholdId) {
    const found = households.find((h) => h.householdId === preferredHouseholdId);
    if (!found) return null; // not in caller's family
    activeHouseholdId = found.householdId;
  } else {
    const primary = households.find((h) => h.familyRole === 'primary');
    activeHouseholdId = primary?.householdId ?? households[0].householdId;
  }

  return { familyId, mode, households };
}

/**
 * Family-aware household_id resolver. Backward-compatible return type.
 *
 * Single mode: returns the one household (identical to old behavior).
 * Coparent mode: returns preferredHouseholdId if valid, else the primary
 * household. Pass undefined for preferredHouseholdId to get the default.
 *
 * Keeps existing callers working without changes while fixing the
 * first-row-wins bug for dual-household children.
 */
export async function resolveHouseholdId(
  accessToken: string,
  preferredHouseholdId?: string
): Promise<string | null> {
  const family = await resolveFamilyId(accessToken, preferredHouseholdId);
  if (!family) return null;
  if (family.mode === 'single') return family.households[0].householdId;
  if (preferredHouseholdId) {
    const found = family.households.find((h) => h.householdId === preferredHouseholdId);
    if (found) return found.householdId;
  }
  const primary = family.households.find((h) => h.familyRole === 'primary');
  return primary?.householdId ?? family.households[0].householdId;
}

/**
 * Family-aware caller-member resolver. Returns the member row for the
 * active household (preferred if valid, else primary).
 */
export async function resolveCallerMember(
  accessToken: string,
  preferredHouseholdId?: string
): Promise<{ householdId: string; memberId: string; role: string; canControlDevices: boolean } | null> {
  const family = await resolveFamilyId(accessToken, preferredHouseholdId);
  if (!family) return null;

  let activeHouseholdId: string;
  if (preferredHouseholdId) {
    const found = family.households.find((h) => h.householdId === preferredHouseholdId);
    if (!found) return null;
    activeHouseholdId = found.householdId;
  } else {
    const primary = family.households.find((h) => h.familyRole === 'primary');
    activeHouseholdId = primary?.householdId ?? family.households[0].householdId;
  }

  const anonKey = process.env.SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;

  // Resolve auth user id from the access token.
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as any;
  if (!user?.id) return null;

  // Look up the caller's member row in the active household.
  const memberRes = await fetch(
    `${SUPABASE_URL}/rest/v1/household_members?household_id=eq.${encodeURIComponent(activeHouseholdId)}&auth_user_id=eq.${user.id}&select=id,household_id,role,can_control_devices`,
    { headers: headers(serviceKey) }
  );
  if (!memberRes.ok) return null;
  const rows: any[] = await memberRes.json();
  const row = rows[0];
  if (!row) return null;
  return {
    householdId: row.household_id,
    memberId: row.id,
    role: row.role,
    canControlDevices: !!row.can_control_devices,
  };
}
