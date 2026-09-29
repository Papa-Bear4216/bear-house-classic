import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_familyAuth.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_billingAuth.js', () => ({ requireBillingRole: vi.fn() }));

import handler from './coparent-merge-consent';
import { resolveHouseholdId } from './_familyAuth.js';
import { requireBillingRole } from './_billingAuth.js';

function req(body: unknown = {}, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/coparent-merge-consent', {
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

// Shared setup: caller in household-primary, family-1 in coparent mode, both
// households linked. Tests append their action-specific responses after these 5.
function baseSequence(overrides?: { mode?: string }) {
  return [
    { ok: true, json: [{ family_id: 'family-1' }] }, // household_family_link (caller)
    { ok: true, json: [{ id: 'family-1', mode: overrides?.mode ?? 'coparent' }] }, // families
  ];
}

describe('POST /api/coparent-merge-consent', () => {
  it('rejects non-POST methods', async () => {
    const res = await handler(new Request('https://example.com/api/coparent-merge-consent', { method: 'GET' }));
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

  it('400s when the household has no family link', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
    mockFetchSequence([{ ok: true, json: [] }]);
    const res = await handler(req({ action: 'status' }));
    expect(res.status).toBe(400);
  });

  it('400s when the family is not in coparent mode', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
    mockFetchSequence(baseSequence({ mode: 'single' }));
    const res = await handler(req({ action: 'status' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not in co-parenting mode/i);
  });

  it('rejects a caller without admin/superadmin role', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: false, status: 403, error: 'Only superadmin/admin can manage billing' });
    mockFetchSequence(baseSequence());
    const res = await handler(req({ action: 'status' }));
    expect(res.status).toBe(403);
  });

  it('400s when the family links are incomplete (missing primary or secondary)', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      ...baseSequence(),
      { ok: true, json: [{ household_id: 'household-primary' }] }, // primary link
      { ok: true, json: [] }, // secondary link — missing
    ]);
    const res = await handler(req({ action: 'status' }));
    expect(res.status).toBe(400);
  });

  describe('action: status', () => {
    it('reports idle when nobody has consented', async () => {
      vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
      vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
      mockFetchSequence([
        ...baseSequence(),
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: [] }, // no consent rows
      ]);
      const res = await handler(req({ action: 'status' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe('idle');
      expect(body.ready).toBe(false);
    });

    it('reports ready when both households have consented', async () => {
      vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
      vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
      mockFetchSequence([
        ...baseSequence(),
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: [{ household_id: 'household-primary' }, { household_id: 'household-secondary' }] },
      ]);
      const res = await handler(req({ action: 'status' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe('pending');
      expect(body.ready).toBe(true);
    });
  });

  describe('action: request', () => {
    it('records the merge initiator when nobody has consented yet', async () => {
      vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
      vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
      mockFetchSequence([
        ...baseSequence(),
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: [] }, // no consent yet
        { ok: true, json: {} }, // PATCH families merge_initiated_by
      ]);
      const res = await handler(req({ action: 'request' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe('pending');
      expect(body.initiatorHouseholdId).toBe('household-primary');
    });

    it('409s if a merge request already has consent recorded', async () => {
      vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
      vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
      mockFetchSequence([
        ...baseSequence(),
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: [{ household_id: 'household-primary' }] }, // already consented
      ]);
      const res = await handler(req({ action: 'request' }));
      expect(res.status).toBe(409);
    });
  });

  describe('action: cancel', () => {
    it('clears consent rows and merge-request fields', async () => {
      vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
      vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
      const fetchMock = mockFetchSequence([
        ...baseSequence(),
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: {} }, // DELETE coparent_merge_consent
        { ok: true, json: {} }, // PATCH families clear fields
      ]);
      const res = await handler(req({ action: 'cancel' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe('cancelled');
      const deleteCall = fetchMock.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/rest/v1/coparent_merge_consent') && c[1]?.method === 'DELETE'
      );
      expect(deleteCall).toBeDefined();
    });
  });

  describe('action: consent', () => {
    it('rejects an incorrect consent phrase', async () => {
      vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
      vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
      mockFetchSequence([
        ...baseSequence(),
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: [] },
      ]);
      const res = await handler(req({ action: 'consent', phrase: 'wrong phrase' }));
      expect(res.status).toBe(400);
    });

    it('records consent and stays pending when the other household has not consented', async () => {
      vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
      vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
      mockFetchSequence([
        ...baseSequence(),
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: [] }, // no consent yet
        { ok: true, json: {} }, // POST consent row
        { ok: true, json: [{ household_id: 'household-primary' }] }, // re-fetch: only primary consented
      ]);
      const res = await handler(req({ action: 'consent', phrase: 'Make my family whole again' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe('pending');
      expect(body.ready).toBe(false);
    });

    it('executes the merge when both households have consented, moving members before unlinking the secondary, flipping mode last', async () => {
      vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
      vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
      const fetchMock = mockFetchSequence([
        ...baseSequence(),
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] }, // secondary already consented
        { ok: true, json: {} }, // POST consent row for primary (caller)
        { ok: true, json: [{ household_id: 'household-primary' }, { household_id: 'household-secondary' }] }, // re-fetch: both
        { ok: true, json: [{ id: 'member-1' }, { id: 'member-2' }] }, // members in secondary
        { ok: true, json: {} }, // PATCH member-1 -> primary household
        { ok: true, json: {} }, // PATCH member-2 -> primary household
        { ok: true, json: {} }, // DELETE household_family_link for secondary
        { ok: true, json: {} }, // PATCH families mode=single (last)
        { ok: true, json: {} }, // DELETE coparent_merge_consent rows
      ]);
      const res = await handler(req({ action: 'consent', phrase: 'Make my family whole again' }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.status).toBe('merged');
      expect(body.mode).toBe('single');

      // Assert ordering: member PATCHes -> link DELETE -> mode PATCH, in that order.
      const calls = fetchMock.mock.calls;
      const memberPatchIndices = calls
        .map((c, i) => ({ i, url: c[0], method: c[1]?.method }))
        .filter((c) => typeof c.url === 'string' && c.url.includes('/rest/v1/household_members?id=eq.') && c.method === 'PATCH')
        .map((c) => c.i);
      const linkDeleteIndex = calls.findIndex(
        (c) => typeof c[0] === 'string' && c[0].includes('/rest/v1/household_family_link?household_id=eq.household-secondary') && c[1]?.method === 'DELETE'
      );
      const modePatchIndex = calls.findIndex(
        (c) => typeof c[0] === 'string' && c[0].includes('/rest/v1/families?id=eq.') && c[1]?.method === 'PATCH'
          && JSON.parse(c[1].body as string).mode === 'single'
      );
      expect(memberPatchIndices.length).toBe(2);
      expect(Math.max(...memberPatchIndices)).toBeLessThan(linkDeleteIndex);
      expect(linkDeleteIndex).toBeLessThan(modePatchIndex);
    });

    it('aborts before unlinking the secondary or flipping mode if moving a member fails', async () => {
      vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
      vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
      const fetchMock = mockFetchSequence([
        ...baseSequence(),
        { ok: true, json: [{ household_id: 'household-primary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: [{ household_id: 'household-secondary' }] },
        { ok: true, json: {} }, // POST consent row for primary
        { ok: true, json: [{ household_id: 'household-primary' }, { household_id: 'household-secondary' }] },
        { ok: true, json: [{ id: 'member-1' }] }, // members in secondary
        { ok: false, status: 500, json: { error: 'boom' } }, // PATCH member-1 fails
      ]);
      const res = await handler(req({ action: 'consent', phrase: 'Make my family whole again' }));
      expect(res.status).toBe(500);
      const linkDeleteCall = fetchMock.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/rest/v1/household_family_link?household_id=eq.household-secondary') && c[1]?.method === 'DELETE'
      );
      expect(linkDeleteCall).toBeUndefined();
      // Mode must stay 'coparent' on a partial failure — flipping to 'single'
      // here would falsely report the family as merged while the secondary
      // household and its members are still live and unmigrated.
      const modePatchCall = fetchMock.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('/rest/v1/families?id=eq.') && c[1]?.method === 'PATCH'
          && JSON.parse(c[1].body as string).mode === 'single'
      );
      expect(modePatchCall).toBeUndefined();
    });
  });

  it('400s on an unknown action', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-primary');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([
      ...baseSequence(),
      { ok: true, json: [{ household_id: 'household-primary' }] },
      { ok: true, json: [{ household_id: 'household-secondary' }] },
      { ok: true, json: [] },
    ]);
    const res = await handler(req({ action: 'not-a-real-action' }));
    expect(res.status).toBe(400);
  });
});
