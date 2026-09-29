import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveFamilyId,
  resolveHouseholdId,
  resolveCallerMember,
  type FamilyResolution,
  type HouseholdInFamily,
} from './_familyAuth.js';

// ---------------------------------------------------------------------------
// Test fetch mock factory
// ---------------------------------------------------------------------------
// Each test gets a fresh fetch mock wired to the data it needs. No shared
// spy state between tests — avoids the "mockAuthUser then override" trap.

interface FetchMockConfig {
  userId?: string;
  memberRows?: Array<{
    id: string;
    household_id: string;
    role: string;
    pending_transition_household_id?: string | null;
    pending_transition_role?: string | null;
  }>;
  linkRows?: Array<{ household_id: string; family_id: string; role_in_family: string }>;
  familyRows?: Array<{ id: string; mode: string }>;
  activeHouseholdMemberRows?: Array<{ id: string; household_id: string; role: string; can_control_devices: boolean }>;
  /** Response for the PATCH that applies a pending transition to a member row. */
  transitionMovePatchOk?: boolean;
  transitionMovedRow?: { id: string; household_id: string; role: string };
}

function makeFetchMock(config: FetchMockConfig, calls: Array<{ url: string; method?: string; body?: string }>) {
  return async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body });
    const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');

    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: config.userId ?? 'test-user' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.includes('/rest/v1/household_members')) {
      if (method === 'PATCH') {
        const ok = config.transitionMovePatchOk ?? true;
        return new Response(
          JSON.stringify(ok ? [config.transitionMovedRow ?? {}] : { error: 'boom' }),
          { status: ok ? 200 : 500, headers: { 'content-type': 'application/json' } }
        );
      }
      // First call in resolveFamilyId: auth_user_id only (find all households for user).
      if (params.has('auth_user_id') && !params.has('household_id')) {
        return new Response(JSON.stringify(config.memberRows ?? []), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // Second call in resolveCallerMember: household_id + auth_user_id.
      if (params.has('household_id') && params.has('auth_user_id')) {
        return new Response(JSON.stringify(config.activeHouseholdMemberRows ?? []), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.includes('/rest/v1/family_data') || url.includes('/rest/v1/device_tokens')) {
      // Re-homing PATCHes for the transitioning member's owned data.
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.includes('/rest/v1/household_family_link')) {
      return new Response(JSON.stringify(config.linkRows ?? []), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.includes('/rest/v1/families')) {
      return new Response(JSON.stringify(config.familyRows ?? []), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(null), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };
}

function setFetchMock(config: FetchMockConfig) {
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(makeFetchMock(config, calls) as any);
  return calls;
}

// ---------------------------------------------------------------------------
// resolveFamilyId
// ---------------------------------------------------------------------------

describe('resolveFamilyId', () => {
  it('returns null for an invalid token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );
    const result = await resolveFamilyId('bad-token');
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('returns null when the user has no household membership', async () => {
    setFetchMock({
      userId: 'user-no-household',
      memberRows: [],
    });
    const result = await resolveFamilyId('valid-token');
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('returns a single-family resolution for a user in one household', async () => {
    setFetchMock({
      userId: 'parent-1',
      memberRows: [{ id: 'm1', household_id: 'h1', role: 'admin' }],
      linkRows: [{ household_id: 'h1', family_id: 'family-single', role_in_family: 'primary' }],
      familyRows: [{ id: 'family-single', mode: 'single' }],
    });

    const result = await resolveFamilyId('valid-token');
    expect(result).not.toBeNull();
    expect(result!.familyId).toBe('family-single');
    expect(result!.mode).toBe('single');
    expect(result!.households).toHaveLength(1);
    expect(result!.households[0]).toEqual({
      householdId: 'h1',
      familyRole: 'primary',
      memberRole: 'admin',
    });
    vi.restoreAllMocks();
  });

  it('returns a coparent-family resolution for a child in two households', async () => {
    setFetchMock({
      userId: 'child-1',
      memberRows: [
        { id: 'm-child-1', household_id: 'h-mom', role: 'child' },
        { id: 'm-child-2', household_id: 'h-dad', role: 'child' },
      ],
      linkRows: [
        { household_id: 'h-mom', family_id: 'family-coparent', role_in_family: 'primary' },
        { household_id: 'h-dad', family_id: 'family-coparent', role_in_family: 'secondary' },
      ],
      familyRows: [{ id: 'family-coparent', mode: 'coparent' }],
    });

    const result = await resolveFamilyId('valid-token');
    expect(result).not.toBeNull();
    expect(result!.familyId).toBe('family-coparent');
    expect(result!.mode).toBe('coparent');
    expect(result!.households).toHaveLength(2);
    expect(result!.households.map((h) => h.householdId)).toContain('h-mom');
    expect(result!.households.map((h) => h.householdId)).toContain('h-dad');
    expect(result!.households[0].familyRole).toBe('primary');
    expect(result!.households[1].familyRole).toBe('secondary');
    vi.restoreAllMocks();
  });

  it('returns family info when preferredHouseholdId is given and valid', async () => {
    setFetchMock({
      userId: 'child-1',
      memberRows: [
        { id: 'm-child-1', household_id: 'h-mom', role: 'child' },
        { id: 'm-child-2', household_id: 'h-dad', role: 'child' },
      ],
      linkRows: [
        { household_id: 'h-mom', family_id: 'family-coparent', role_in_family: 'primary' },
        { household_id: 'h-dad', family_id: 'family-coparent', role_in_family: 'secondary' },
      ],
      familyRows: [{ id: 'family-coparent', mode: 'coparent' }],
    });

    const result = await resolveFamilyId('valid-token', 'h-dad');
    expect(result).not.toBeNull();
    expect(result!.familyId).toBe('family-coparent');
    expect(result!.mode).toBe('coparent');
    vi.restoreAllMocks();
  });

  it('returns null when preferredHouseholdId is not in the caller\'s family', async () => {
    setFetchMock({
      userId: 'child-1',
      memberRows: [{ id: 'm-child-1', household_id: 'h-mom', role: 'child' }],
      linkRows: [{ household_id: 'h-mom', family_id: 'family-single', role_in_family: 'primary' }],
      familyRows: [{ id: 'family-single', mode: 'single' }],
    });

    const result = await resolveFamilyId('valid-token', 'h-other-family');
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// resolveHouseholdId
// ---------------------------------------------------------------------------

describe('resolveHouseholdId', () => {
  it('returns the single household in single-family mode', async () => {
    setFetchMock({
      userId: 'parent-1',
      memberRows: [{ id: 'm1', household_id: 'h1', role: 'admin' }],
      linkRows: [{ household_id: 'h1', family_id: 'family-single', role_in_family: 'primary' }],
      familyRows: [{ id: 'family-single', mode: 'single' }],
    });

    const result = await resolveHouseholdId('valid-token');
    expect(result).toBe('h1');
    vi.restoreAllMocks();
  });

  it('returns the preferred household in coparent mode when valid', async () => {
    setFetchMock({
      userId: 'child-1',
      memberRows: [
        { id: 'm-child-1', household_id: 'h-mom', role: 'child' },
        { id: 'm-child-2', household_id: 'h-dad', role: 'child' },
      ],
      linkRows: [
        { household_id: 'h-mom', family_id: 'family-coparent', role_in_family: 'primary' },
        { household_id: 'h-dad', family_id: 'family-coparent', role_in_family: 'secondary' },
      ],
      familyRows: [{ id: 'family-coparent', mode: 'coparent' }],
    });

    const result = await resolveHouseholdId('valid-token', 'h-dad');
    expect(result).toBe('h-dad');
    vi.restoreAllMocks();
  });

  it('returns primary household when no preferredHouseholdId in coparent mode', async () => {
    setFetchMock({
      userId: 'child-1',
      memberRows: [
        { id: 'm-child-1', household_id: 'h-mom', role: 'child' },
        { id: 'm-child-2', household_id: 'h-dad', role: 'child' },
      ],
      linkRows: [
        { household_id: 'h-mom', family_id: 'family-coparent', role_in_family: 'primary' },
        { household_id: 'h-dad', family_id: 'family-coparent', role_in_family: 'secondary' },
      ],
      familyRows: [{ id: 'family-coparent', mode: 'coparent' }],
    });

    const result = await resolveHouseholdId('valid-token');
    expect(result).toBe('h-mom'); // primary
    vi.restoreAllMocks();
  });

  it('returns null for an invalid token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );
    const result = await resolveHouseholdId('bad-token');
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// resolveCallerMember
// ---------------------------------------------------------------------------

describe('resolveCallerMember', () => {
  it('returns the caller\'s member row in the active household', async () => {
    setFetchMock({
      userId: 'parent-1',
      memberRows: [{ id: 'm1', household_id: 'h1', role: 'admin' }],
      linkRows: [{ household_id: 'h1', family_id: 'family-single', role_in_family: 'primary' }],
      familyRows: [{ id: 'family-single', mode: 'single' }],
      activeHouseholdMemberRows: [
        { id: 'm1', household_id: 'h1', role: 'admin', can_control_devices: true },
      ],
    });

    const result = await resolveCallerMember('valid-token');
    expect(result).not.toBeNull();
    expect(result!.householdId).toBe('h1');
    expect(result!.memberId).toBe('m1');
    expect(result!.role).toBe('admin');
    expect(result!.canControlDevices).toBe(true);
    vi.restoreAllMocks();
  });

  it('returns null when the caller has no member row in the requested household', async () => {
    setFetchMock({
      userId: 'child-1',
      memberRows: [
        { id: 'm-child-1', household_id: 'h-mom', role: 'child' },
        { id: 'm-child-2', household_id: 'h-dad', role: 'child' },
      ],
      linkRows: [
        { household_id: 'h-mom', family_id: 'family-coparent', role_in_family: 'primary' },
        { household_id: 'h-dad', family_id: 'family-coparent', role_in_family: 'secondary' },
      ],
      familyRows: [{ id: 'family-coparent', mode: 'coparent' }],
      activeHouseholdMemberRows: [],
    });

    const result = await resolveCallerMember('valid-token', 'h-dad');
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('returns null for an invalid token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );
    const result = await resolveCallerMember('bad-token');
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// applyPendingTransition (co-parenting: exercised through resolveFamilyId,
// since it's an internal helper invoked lazily on the member's next request)
// ---------------------------------------------------------------------------

describe('resolveFamilyId — pending household transition', () => {
  it('moves a member with a pending transition into their new household before resolving family context', async () => {
    const calls = setFetchMock({
      userId: 'coparent-1',
      memberRows: [
        {
          id: 'm-coparent',
          household_id: 'h-old',
          role: 'admin',
          pending_transition_household_id: 'h-new',
          pending_transition_role: 'superadmin',
        },
      ],
      transitionMovedRow: { id: 'm-coparent', household_id: 'h-new', role: 'superadmin' },
      linkRows: [{ household_id: 'h-new', family_id: 'family-coparent', role_in_family: 'secondary' }],
      familyRows: [{ id: 'family-coparent', mode: 'coparent' }],
    });

    const result = await resolveFamilyId('valid-token');
    expect(result).not.toBeNull();
    // Family context reflects the post-transition household, not the old one.
    expect(result!.households).toHaveLength(1);
    expect(result!.households[0].householdId).toBe('h-new');
    expect(result!.households[0].memberRole).toBe('superadmin');

    // The member-move PATCH actually fired with the right target household/role.
    const movePatch = calls.find(
      (c) => c.method === 'PATCH' && c.url.includes('/rest/v1/household_members?id=eq.m-coparent')
    );
    expect(movePatch).toBeDefined();
    const patchBody = JSON.parse(movePatch!.body!);
    expect(patchBody.household_id).toBe('h-new');
    expect(patchBody.role).toBe('superadmin');
    expect(patchBody.pending_transition_household_id).toBeNull();

    // Owned data re-homed to the new household too.
    const familyDataPatch = calls.find((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/family_data?owner_member_id=eq.m-coparent'));
    const deviceTokenPatch = calls.find((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/device_tokens?person_id=eq.m-coparent'));
    expect(familyDataPatch).toBeDefined();
    expect(deviceTokenPatch).toBeDefined();
    expect(JSON.parse(familyDataPatch!.body!).household_id).toBe('h-new');
    expect(JSON.parse(deviceTokenPatch!.body!).household_id).toBe('h-new');

    vi.restoreAllMocks();
  });

  it('leaves the member in their old household if the move PATCH fails', async () => {
    setFetchMock({
      userId: 'coparent-1',
      memberRows: [
        {
          id: 'm-coparent',
          household_id: 'h-old',
          role: 'admin',
          pending_transition_household_id: 'h-new',
          pending_transition_role: 'superadmin',
        },
      ],
      transitionMovePatchOk: false,
      linkRows: [{ household_id: 'h-old', family_id: 'family-coparent', role_in_family: 'primary' }],
      familyRows: [{ id: 'family-coparent', mode: 'coparent' }],
    });

    const result = await resolveFamilyId('valid-token');
    // Move failed, so the member is still resolved in their original household.
    expect(result).not.toBeNull();
    expect(result!.households[0].householdId).toBe('h-old');

    vi.restoreAllMocks();
  });

  it('does not touch a member with no pending transition', async () => {
    const calls = setFetchMock({
      userId: 'parent-1',
      memberRows: [{ id: 'm1', household_id: 'h1', role: 'admin' }],
      linkRows: [{ household_id: 'h1', family_id: 'family-single', role_in_family: 'primary' }],
      familyRows: [{ id: 'family-single', mode: 'single' }],
    });

    await resolveFamilyId('valid-token');
    const movePatch = calls.find((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/household_members'));
    expect(movePatch).toBeUndefined();

    vi.restoreAllMocks();
  });
});
