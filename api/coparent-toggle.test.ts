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

  it('enables coparenting: caller is already linked as primary, creates a new secondary household with a member row', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] }, // link lookup
      { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] }, // family
      // existingLinkRes: the caller's household is always already linked as
      // primary — that's how `family` was resolved above.
      { ok: true, json: [{ household_id: 'household-1', role_in_family: 'primary' }] },
      { ok: true, json: [{ name: 'Home' }] }, // nameRes
      { ok: true, json: [{ id: 'household-2' }] }, // POST new secondary household
      { ok: true, json: {} }, // GET /auth/v1/user for the new member row
      { ok: true, json: [{ id: 'member-1' }] }, // POST household_members for secondary
      { ok: true, json: {} }, // POST link secondary
      { ok: true, json: {} }, // PATCH families mode=coparent
    ]);
    const res = await handler(req({}));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('coparent');
    expect(body.primaryHouseholdId).toBe('household-1');
    expect(body.secondaryHouseholdId).toBe('household-2');
  });

  it('rolls back the new secondary household if adding the member fails', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    const fetchMock = mockFetchSequence([
      { ok: true, json: [{ family_id: 'family-1' }] },
      { ok: true, json: [{ id: 'family-1', mode: 'single', merge_consent_household_id: null }] },
      { ok: true, json: [{ household_id: 'household-1', role_in_family: 'primary' }] }, // existingLinkRes
      { ok: true, json: [{ name: 'Home' }] }, // nameRes
      { ok: true, json: [{ id: 'household-2' }] }, // POST new secondary household
      { ok: true, json: {} }, // GET /auth/v1/user
      { ok: false, status: 500, json: { error: 'boom' } }, // POST household_members fails
      { ok: true, json: {} }, // DELETE households (rollback)
    ]);
    const res = await handler(req({}));
    expect(res.status).toBe(500);
    // Rollback DELETE was issued against the orphaned secondary household.
    const deleteCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/rest/v1/households?id=eq.household-2') && c[1]?.method === 'DELETE'
    );
    expect(deleteCall).toBeDefined();
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
      { ok: true, json: {} }, // PATCH families mode=coparent
    ]);
    const res = await handler(req({}));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.secondaryHouseholdId).toBe('household-2');
  });
});
