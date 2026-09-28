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
  memberRows?: Array<{ id: string; household_id: string; role: string }>;
  linkRows?: Array<{ household_id: string; family_id: string; role_in_family: string }>;
  familyRows?: Array<{ id: string; mode: string }>;
  activeHouseholdMemberRows?: Array<{ id: string; household_id: string; role: string; can_control_devices: boolean }>;
}

function makeFetchMock(config: FetchMockConfig) {
  return async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');

    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: config.userId ?? 'test-user' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.includes('/rest/v1/household_members')) {
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
  vi.spyOn(globalThis, 'fetch').mockImplementation(makeFetchMock(config)) as any;
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
