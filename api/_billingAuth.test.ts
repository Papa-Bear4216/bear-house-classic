import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireBillingRole } from './_billingAuth';

function mockFetchSequence(responses: Array<{ ok: boolean; json?: unknown }>) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: r.ok,
      json: async () => r.json ?? [],
      text: async () => JSON.stringify(r.json ?? {}),
    } as Response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function reqWithAuth(header: string | null) {
  return new Request('https://example.com', header ? { headers: { authorization: header } } : {});
}

beforeEach(() => {
  vi.unstubAllGlobals();
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
});

describe('requireBillingRole', () => {
  it('rejects with 401 when there is no Authorization header at all', async () => {
    const result = await requireBillingRole(reqWithAuth(null), 'household-1');
    expect(result).toEqual({ ok: false, status: 401, error: 'Missing bearer token' });
  });

  it('rejects with 401 when the header is not a Bearer token', async () => {
    const result = await requireBillingRole(reqWithAuth('Basic abc123'), 'household-1');
    expect(result).toEqual({ ok: false, status: 401, error: 'Missing bearer token' });
  });

  it('rejects with 500 (not 401) when Supabase keys are missing — a config problem must never masquerade as an auth failure', async () => {
    delete process.env.SUPABASE_ANON_KEY;
    const result = await requireBillingRole(reqWithAuth('Bearer sometoken'), 'household-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.error).toMatch(/not configured/i);
    }
  });

  it('rejects with 401 when the access token does not verify with Supabase', async () => {
    mockFetchSequence([{ ok: false }]); // GET /auth/v1/user fails
    const result = await requireBillingRole(reqWithAuth('Bearer bad-token'), 'household-1');
    expect(result).toEqual({ ok: false, status: 401, error: 'Invalid session' });
  });

  it('rejects with 502 (not 403) when the household_members lookup itself fails — an outage must never masquerade as a permissions denial', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1' } },
      { ok: false }, // household_members lookup fails
    ]);
    const result = await requireBillingRole(reqWithAuth('Bearer valid-token'), 'household-1');
    expect(result).toEqual({ ok: false, status: 502, error: 'Failed to look up household membership' });
  });

  it('rejects with 403 when the caller has no role in this household (not a member at all)', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1' } },
      { ok: true, json: [] }, // no matching household_members row
    ]);
    const result = await requireBillingRole(reqWithAuth('Bearer valid-token'), 'household-1');
    expect(result).toEqual({ ok: false, status: 403, error: 'Only superadmin/admin can manage billing' });
  });

  it('rejects with 403 when the caller is a child-role member', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1' } },
      { ok: true, json: [{ role: 'child' }] },
    ]);
    const result = await requireBillingRole(reqWithAuth('Bearer valid-token'), 'household-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it('allows an admin-role member', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1' } },
      { ok: true, json: [{ role: 'admin' }] },
    ]);
    const result = await requireBillingRole(reqWithAuth('Bearer valid-token'), 'household-1');
    expect(result).toEqual({ ok: true });
  });

  it('allows a superadmin-role member', async () => {
    mockFetchSequence([
      { ok: true, json: { id: 'user-1' } },
      { ok: true, json: [{ role: 'superadmin' }] },
    ]);
    const result = await requireBillingRole(reqWithAuth('Bearer valid-token'), 'household-1');
    expect(result).toEqual({ ok: true });
  });

  it('scopes the membership lookup to the specific household_id passed in, not just the user', async () => {
    // Regression guard: a user could be a superadmin of household A and a
    // member (or nothing) of household B — this must check the role
    // *within the requested household*, not just "is this user a
    // superadmin of ANY household." Assert the query URL actually
    // includes both auth_user_id and the target household_id.
    const fetchMock = mockFetchSequence([
      { ok: true, json: { id: 'user-1' } },
      { ok: true, json: [{ role: 'superadmin' }] },
    ]);
    await requireBillingRole(reqWithAuth('Bearer valid-token'), 'household-XYZ');
    const secondCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('auth_user_id=eq.user-1');
    expect(secondCallUrl).toContain('household_id=eq.household-XYZ');
  });
});
