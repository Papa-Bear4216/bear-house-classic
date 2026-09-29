import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_familyAuth.js', () => ({ resolveFamilyId: vi.fn(), resolveHouseholdId: vi.fn() }));
vi.mock('./_billingAuth.js', () => ({ requireBillingRole: vi.fn() }));

import handler, { STATUTE_DISCLAIMER } from './coparent-address';
import { resolveFamilyId, resolveHouseholdId } from './_familyAuth.js';
import { requireBillingRole } from './_billingAuth.js';

function req(method: string, body?: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/coparent-address', {
    method,
    headers: { authorization: auth, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
  vi.mocked(resolveFamilyId).mockReset();
  vi.mocked(resolveHouseholdId).mockReset();
  vi.mocked(requireBillingRole).mockReset();
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
});

const VALID = { addressStreet: '123 Main St', addressCity: 'Springfield', addressState: 'IL', addressZip: '62704', contactPhone: '555-1234' };

const family = (mode: 'single' | 'coparent', memberRole = 'superadmin') => ({
  familyId: 'family-1',
  mode,
  households: [
    { householdId: 'household-1', familyRole: 'primary' as const, memberRole },
    ...(mode === 'coparent' ? [{ householdId: 'household-2', familyRole: 'secondary' as const, memberRole: 'superadmin' }] : []),
  ],
});

const row = (id: string, extra: object = {}) => ({
  id, address_street: '1 St', address_city: 'C', address_state: 'IL', address_zip: '62704', contact_phone: '555-1234', address_confidential: false, ...extra,
});
const emptyRow = (id: string, extra: object = {}) => row(id, { address_street: null, address_city: null, address_state: null, address_zip: null, contact_phone: null, ...extra });

function asCaller(fam: ReturnType<typeof family> | null, role: { ok: true } | { ok: false; status: number; error: string } = { ok: true }) {
  vi.mocked(resolveFamilyId).mockResolvedValue(fam);
  vi.mocked(resolveHouseholdId).mockResolvedValue(fam ? 'household-1' : null);
  vi.mocked(requireBillingRole).mockResolvedValue(role);
}

const get = async (rows: unknown[], ...extra: Array<{ ok: boolean; json?: unknown; status?: number }>) => {
  const fetchMock = mockFetchSequence([{ ok: true, json: rows }, ...extra]);
  const res = await handler(req('GET'));
  return { res, fetchMock, body: await res.clone().json() };
};

describe('GET /api/coparent-address', () => {
  it('rejects a missing bearer token', async () => {
    expect((await handler(req('GET', undefined, ''))).status).toBe(401);
  });

  it('rejects when the family cannot be resolved', async () => {
    asCaller(null);
    expect((await handler(req('GET'))).status).toBe(401);
  });

  it("returns only the caller's own address in single mode — no other household leaked", async () => {
    asCaller(family('single'));
    const { res, body } = await get([row('household-1', { address_street: '123 Main St' })]);
    expect(res.status).toBe(200);
    expect(body.mode).toBe('single');
    expect(body.mine.addressStreet).toBe('123 Main St');
    expect(body.mine.complete).toBe(true);
    expect(body.other).toBeNull();
  });

  it("returns both households' addresses in coparent mode", async () => {
    asCaller(family('coparent'));
    const { body } = await get([row('household-1', { address_street: '123 Main St' }), row('household-2', { address_street: '456 Oak Ave' })]);
    expect(body.mode).toBe('coparent');
    expect(body.mine.addressStreet).toBe('123 Main St');
    expect(body.other.addressStreet).toBe('456 Oak Ave');
    expect(body.other.complete).toBe(true);
  });

  it('reports complete:false when the other household has not filled in their address yet', async () => {
    asCaller(family('coparent'));
    const { body } = await get([row('household-1'), emptyRow('household-2')]);
    expect(body.other.complete).toBe(false);
  });

  it.each(['child', 'pet'])('403s for a %s account', async (role) => {
    asCaller(family('coparent', role));
    const fetchMock = mockFetchSequence([]);
    expect((await handler(req('GET'))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('withholds every address field when the other household is confidential', async () => {
    asCaller(family('coparent', 'admin'));
    const { body } = await get([row('household-1'), row('household-2', { address_street: 'SECRET ST', contact_phone: '999-9999', address_confidential: true })], { ok: true, json: [] });
    expect(JSON.stringify(body)).not.toMatch(/SECRET ST|999-9999/);
    expect(body.other).toEqual({ confidential: true, complete: false });
  });

  it('shows the caller their own confidential address and counts it complete', async () => {
    asCaller(family('coparent', 'admin'));
    const { body } = await get([emptyRow('household-1', { address_confidential: true }), row('household-2')]);
    expect(body.mine.confidential).toBe(true);
    expect(body.mine.complete).toBe(true);
  });

  it('returns the state statute with the disclaimer', async () => {
    asCaller(family('coparent', 'admin'));
    const { body, fetchMock } = await get([row('household-1'), row('household-2')],
      { ok: true, json: [{ state_code: 'IL', state_name: 'Illinois', statute_citation: '750 ILCS 5/609.2', summary: 's', confidence: 'unreviewed', source_url: null }] });
    expect(String(fetchMock.mock.calls[1][0])).toContain('state_code=eq.IL');
    expect(body.statute.citation).toBe('750 ILCS 5/609.2');
    expect(body.statute.confidence).toBe('unreviewed');
    expect(body.statuteDisclaimer).toBe(STATUTE_DISCLAIMER);
    expect(body.statuteDisclaimer).toMatch(/not legal advice/i);
  });

  it('still returns addresses when the statute lookup fails', async () => {
    asCaller(family('coparent', 'admin'));
    const { res, body } = await get([row('household-1'), row('household-2')], { ok: false, status: 500 });
    expect(res.status).toBe(200);
    expect(body.statute).toBeNull();
  });
});

describe('POST /api/coparent-address', () => {
  const post = (body: unknown) => handler(req('POST', body));

  it('rejects a missing bearer token', async () => {
    expect((await handler(req('POST', {}, ''))).status).toBe(401);
  });

  it('rejects when the household cannot be resolved', async () => {
    asCaller(null);
    expect((await post({})).status).toBe(401);
  });

  it('rejects a caller without admin/superadmin role', async () => {
    asCaller(family('single'), { ok: false, status: 403, error: 'Only superadmin/admin can manage billing' });
    expect((await post(VALID)).status).toBe(403);
  });

  it.each([
    ['a bad zip', { addressZip: 'not-a-zip' }],
    ['an invalid state code', { addressState: 'ZZ' }],
  ])('400s on %s', async (_label, patch) => {
    asCaller(family('single'));
    expect((await post({ ...VALID, ...patch })).status).toBe(400);
  });

  it('saves a valid address and clears the confidential flag', async () => {
    asCaller(family('single'));
    const fetchMock = mockFetchSequence([{ ok: true, json: [] }]);
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).address_confidential).toBe(false);
  });

  it('accepts confidential with no address and stores the flag', async () => {
    asCaller(family('single'));
    const fetchMock = mockFetchSequence([{ ok: true, json: [] }]);
    expect((await post({ confidential: true })).status).toBe(200);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.address_confidential).toBe(true);
    expect(sent.address_street).toBeNull();
  });

  it('still requires every field when not confidential', async () => {
    asCaller(family('single'));
    expect((await post({ addressStreet: '123 Main St' })).status).toBe(400);
  });
});
