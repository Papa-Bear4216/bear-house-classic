import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_familyAuth.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_billingAuth.js', () => ({ requireBillingRole: vi.fn() }));

import handler from './coparent-toggle';
import { resolveHouseholdId } from './_familyAuth.js';
import { requireBillingRole } from './_billingAuth.js';

function req(body: unknown = {}, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/coparent-toggle', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockFetchSequence(responses: Array<{ ok: boolean; json?: unknown; status?: number }>) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: r.ok,
      json: async () => r.json ?? [],
      text: async () => JSON.stringify(r.json ?? {}),
      status: r.status ?? (r.ok ? 200 : 500),
    } as Response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(resolveHouseholdId).mockReset();
  vi.mocked(requireBillingRole).mockReset();
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
});

describe('POST /api/coparent-toggle', () => {
  it('rejects non-POST methods', async () => {
    const res = await handler(new Request('https://example.com/api/coparent-toggle', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('rejects a missing bearer token', async () => {
    const res = await handler(req({}, ''));
    expect(res.status).toBe(401);
  });

  it('rejects when the household cannot be resolved', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({}));
    expect(res.status).toBe(401);
  });

  it('404s when the household has no family link', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    mockFetchSequence([
      { ok: true, json: [] }, // household_family_link — no link for this household
    ]);
    const res = await handler(req({}));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not linked/i);
  });

  it('500s with serverError when the family link lookup fails', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    mockFetchSequence([{ ok: false, status: 500 }]);
    const res = await handler(req({}));
    expect(res.status).toBe(500);
  });

  it('404s when the family row itself is missing', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] }, // link
      { ok: true, json: [] }, // families — not found
    ]);
    const res = await handler(req({}));
    expect(res.status).toBe(404);
  });

  it('rejects a caller without admin/superadmin role via requireBillingRole', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: false, status: 403, error: 'Only superadmin/admin can manage billing' });
    mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] },
      { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] },
    ]);
    const res = await handler(req({}));
    expect(res.status).toBe(403);
  });

  it('rejects toggle-off with a redirect to the dual-consent flow instead of attempting a one-sided merge', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] },
      { ok: true, json: [{ id: 'family-1', mode: 'coparent', merge_consent_household_id: null }] },
    ]);
    const res = await handler(req({}));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/coparent-merge-consent/);
  });

  it('400s when enabling co-parenting without a transitioningMemberId', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] },
      { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] },
      { ok: true, json: [{ household_id: 'household-1', role_in_family: 'primary' }] },
    ]);
    const res = await handler(req({}));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/transitioningMemberId is required/);
  });

  it('400s when transitioningMemberId does not belong to the caller\'s household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] },
      { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] },
      { ok: true, json: [{ household_id: 'household-1', role_in_family: 'primary' }] },
      { ok: true, json: [{ id: 'member-caller', name: 'Caller', role: 'superadmin' }] }, // householdMembersRes
    ]);
    const res = await handler(req({ transitioningMemberId: 'not-a-real-member' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/existing member of your own household/);
  });

  it('400s when transitioning the only admin/superadmin in the household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] },
      { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] },
      { ok: true, json: [{ household_id: 'household-1', role_in_family: 'primary' }] },
      { ok: true, json: [
        { id: 'member-caller', name: 'Caller', role: 'superadmin' },
        { id: 'member-kid', name: 'Kid', role: 'child' },
      ] },
    ]);
    const res = await handler(req({ transitioningMemberId: 'member-caller' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/only admin\/superadmin/);
  });

  it('enables coparenting: creates a new secondary household and marks the named member for transition', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] }, // link lookup
      { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] }, // family
      { ok: true, json: [{ household_id: 'household-1', role_in_family: 'primary' }] }, // existingLinkRes
      { ok: true, json: [
        { id: 'member-caller', name: 'Caller', role: 'superadmin' },
        { id: 'member-coparent', name: 'Co-parent', role: 'admin' },
      ] }, // householdMembersRes
      { ok: true, json: [{ address_street: '123 Test St', address_city: 'Testcity', address_state: 'CA', address_zip: '90210', contact_phone: '555-1234' }] }, // address lookup
      { ok: true, json: [{ name: 'Home' }] }, // nameRes
      { ok: true, json: [{ id: 'household-2' }] }, // POST new secondary household
      { ok: true, json: {} }, // POST link secondary
      { ok: true, json: {} }, // PATCH mark transitioning member
      { ok: true, json: {} }, // PATCH families mode=coparent
    ]);
    const res = await handler(req({ transitioningMemberId: 'member-coparent' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('coparent');
    expect(body.primaryHouseholdId).toBe('household-1');
    expect(body.secondaryHouseholdId).toBe('household-2');
  });

  it('rolls back the new secondary household and its link if marking the transitioning member fails', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    const fetchMock = mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] },
      { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] },
      { ok: true, json: [{ household_id: 'household-1', role_in_family: 'primary' }] },
      { ok: true, json: [
        { id: 'member-caller', name: 'Caller', role: 'superadmin' },
        { id: 'member-coparent', name: 'Co-parent', role: 'admin' },
      ] },
      { ok: true, json: [{ address_street: '123 Test St', address_city: 'Testcity', address_state: 'CA', address_zip: '90210', contact_phone: '555-1234' }] }, // address lookup
      { ok: true, json: [{ name: 'Home' }] },
      { ok: true, json: [{ id: 'household-2' }] }, // POST new secondary household
      { ok: true, json: {} }, // POST link secondary
      { ok: false, status: 500, json: { error: 'boom' } }, // PATCH mark transitioning member fails
      { ok: true, json: {} }, // DELETE link (rollback)
      { ok: true, json: {} }, // DELETE household (rollback)
    ]);
    const res = await handler(req({ transitioningMemberId: 'member-coparent' }));
    expect(res.status).toBe(500);
    const linkDeleteCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/rest/v1/household_family_link?household_id=eq.household-2') && c[1]?.method === 'DELETE'
    );
    const hhDeleteCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/rest/v1/households?id=eq.household-2') && c[1]?.method === 'DELETE'
    );
    expect(linkDeleteCall).toBeDefined();
    expect(hhDeleteCall).toBeDefined();
  });

  it('reuses the existing secondary household if co-parenting is toggled on again without a prior merge', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] },
      { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] },
      { ok: true, json: [
        { household_id: 'household-1', role_in_family: 'primary' },
        { household_id: 'household-2', role_in_family: 'secondary' },
      ] },
      { ok: true, json: [{ address_street: '123 Test St', address_city: 'Testcity', address_state: 'CA', address_zip: '90210', contact_phone: '555-1234' }] }, // address lookup
      { ok: true, json: {} }, // PATCH families mode=coparent
    ]);
    const res = await handler(req({}));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.secondaryHouseholdId).toBe('household-2');
  });

  const noAddr = { ok: true, json: [{ address_street: null, address_city: null, address_state: null, address_zip: null, contact_phone: null, address_confidential: false }] };
  const seq = [
    { ok: true, json: [{ family_id: 'family-1' }] },
    { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] },
    { ok: true, json: [{ household_id: 'household-1', role_in_family: 'primary' }] },
    { ok: true, json: [
      { id: 'member-caller', name: 'Caller', role: 'superadmin' },
      { id: 'member-coparent', name: 'Co-parent', role: 'admin' },
    ] },
  ];

  it('rejects a missing address BEFORE any write — no orphaned secondary household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    const fetchMock = mockFetchSequence([...seq, noAddr]);
    const res = await handler(req({ transitioningMemberId: 'member-coparent' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/address/i);
    const writes = fetchMock.mock.calls.filter((c) => c[1]?.method && c[1].method !== 'GET');
    expect(writes).toHaveLength(0);
  });

  it('a confidential household is exempt from the address requirement', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      ...seq,
      { ok: true, json: [{ address_street: null, address_city: null, address_state: null, address_zip: null, contact_phone: null, address_confidential: true }] },
      { ok: true, json: [{ name: 'Home' }] },
      { ok: true, json: [{ id: 'household-2' }] },
      { ok: true, json: {} },
      { ok: true, json: {} },
      { ok: true, json: {} },
    ]);
    const res = await handler(req({ transitioningMemberId: 'member-coparent' }));
    expect(res.status).toBe(200);
  });

  it('returns 409 Conflict when a race creates a secondary link concurrently (23505 unique constraint)', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      ...seq,
      { ok: true, json: [{ address_street: '123 Test St', address_city: 'Testcity', address_state: 'CA', address_zip: '90210', contact_phone: '555-1234' }] },
      { ok: true, json: [{ name: 'Home' }] },
      { ok: true, json: [{ id: 'household-2' }] },
      { ok: false, status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint "idx_unique_secondary_household_link"' } },
      { ok: true, json: {} },
    ]);
    const res = await handler(req({ transitioningMemberId: 'member-coparent' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/Secondary household already exists/i);
  });
});
