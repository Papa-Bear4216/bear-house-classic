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

describe('GET /api/coparent-address', () => {
  it('rejects a missing bearer token', async () => {
    const res = await handler(req('GET', undefined, ''));
    expect(res.status).toBe(401);
  });

  it('rejects when the family cannot be resolved', async () => {
    vi.mocked(resolveFamilyId).mockResolvedValue(null);
    const res = await handler(req('GET'));
    expect(res.status).toBe(401);
  });

  it('returns only the caller\'s own address in single mode — no other household leaked', async () => {
    vi.mocked(resolveFamilyId).mockResolvedValue({
      familyId: 'family-1',
      mode: 'single',
      households: [{ householdId: 'household-1', familyRole: 'primary', memberRole: 'superadmin' }],
    });
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    mockFetchSequence([
      { ok: true, json: [{ id: 'household-1', address_street: '123 Main St', address_city: 'Springfield', address_state: 'IL', address_zip: '62704', contact_phone: '555-1234' }] },
    ]);
    const res = await handler(req('GET'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe('single');
    expect(body.mine.addressStreet).toBe('123 Main St');
    expect(body.mine.complete).toBe(true);
    expect(body.other).toBeNull();
  });

  it('returns both households\' addresses in coparent mode', async () => {
    vi.mocked(resolveFamilyId).mockResolvedValue({
      familyId: 'family-1',
      mode: 'coparent',
      households: [
        { householdId: 'household-1', familyRole: 'primary', memberRole: 'superadmin' },
        { householdId: 'household-2', familyRole: 'secondary', memberRole: 'superadmin' },
      ],
    });
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    mockFetchSequence([
      { ok: true, json: [
        { id: 'household-1', address_street: '123 Main St', address_city: 'Springfield', address_state: 'IL', address_zip: '62704', contact_phone: '555-1234' },
        { id: 'household-2', address_street: '456 Oak Ave', address_city: 'Shelbyville', address_state: 'IL', address_zip: '62705', contact_phone: '555-5678' },
      ] },
    ]);
    const res = await handler(req('GET'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.mode).toBe('coparent');
    expect(body.mine.addressStreet).toBe('123 Main St');
    expect(body.other.addressStreet).toBe('456 Oak Ave');
    expect(body.other.complete).toBe(true);
  });

  it('reports complete:false when the other household has not filled in their address yet', async () => {
    vi.mocked(resolveFamilyId).mockResolvedValue({
      familyId: 'family-1',
      mode: 'coparent',
      households: [
        { householdId: 'household-1', familyRole: 'primary', memberRole: 'superadmin' },
        { householdId: 'household-2', familyRole: 'secondary', memberRole: 'superadmin' },
      ],
    });
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    mockFetchSequence([
      { ok: true, json: [
        { id: 'household-1', address_street: '123 Main St', address_city: 'Springfield', address_state: 'IL', address_zip: '62704', contact_phone: '555-1234' },
        { id: 'household-2', address_street: null, address_city: null, address_state: null, address_zip: null, contact_phone: null },
      ] },
    ]);
    const res = await handler(req('GET'));
    const body = await res.json();
    expect(body.other.complete).toBe(false);
  });
});

describe('POST /api/coparent-address', () => {
  it('rejects a missing bearer token', async () => {
    const res = await handler(req('POST', {}, ''));
    expect(res.status).toBe(401);
  });

  it('rejects when the household cannot be resolved', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req('POST', {}));
    expect(res.status).toBe(401);
  });

  it('rejects a caller without admin/superadmin role', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: false, status: 403, error: 'Only superadmin/admin can manage billing' });
    const res = await handler(req('POST', {
      addressStreet: '123 Main St', addressCity: 'Springfield', addressState: 'IL', addressZip: '62704', contactPhone: '555-1234',
    }));
    expect(res.status).toBe(403);
  });

  it('400s on an invalid body (bad zip)', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    const res = await handler(req('POST', {
      addressStreet: '123 Main St', addressCity: 'Springfield', addressState: 'IL', addressZip: 'not-a-zip', contactPhone: '555-1234',
    }));
    expect(res.status).toBe(400);
  });

  it('400s on an invalid state code', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    const res = await handler(req('POST', {
      addressStreet: '123 Main St', addressCity: 'Springfield', addressState: 'ZZ', addressZip: '62704', contactPhone: '555-1234',
    }));
    expect(res.status).toBe(400);
  });

  it('saves a valid address', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    mockFetchSequence([{ ok: true, json: [] }]);
    const res = await handler(req('POST', {
      addressStreet: '123 Main St', addressCity: 'Springfield', addressState: 'IL', addressZip: '62704', contactPhone: '555-1234',
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('GET /api/coparent-address — roles, confidentiality, statute', () => {
  const coparent = (memberRole: string) => ({
    familyId: 'family-1',
    mode: 'coparent' as const,
    households: [
      { householdId: 'household-1', familyRole: 'primary' as const, memberRole },
      { householdId: 'household-2', familyRole: 'secondary' as const, memberRole: 'superadmin' },
    ],
  });
  const row = (id: string, extra: object = {}) => ({
    id, address_street: '1 St', address_city: 'C', address_state: 'IL', address_zip: '62704', contact_phone: '555-1234', address_confidential: false, ...extra,
  });

  it.each(['child', 'pet'])('403s for a %s account', async (role) => {
    vi.mocked(resolveFamilyId).mockResolvedValue(coparent(role));
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const fetchMock = mockFetchSequence([]);
    const res = await handler(req('GET'));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('withholds every address field when the other household is confidential', async () => {
    vi.mocked(resolveFamilyId).mockResolvedValue(coparent('admin'));
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    mockFetchSequence([
      { ok: true, json: [row('household-1'), row('household-2', { address_street: 'SECRET ST', contact_phone: '999-9999', address_confidential: true })] },
      { ok: true, json: [] },
    ]);
    const res = await handler(req('GET'));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('SECRET ST');
    expect(text).not.toContain('999-9999');
    expect(JSON.parse(text).other).toEqual({ confidential: true, complete: false });
  });

  it('shows the caller their own confidential address and counts it complete', async () => {
    vi.mocked(resolveFamilyId).mockResolvedValue(coparent('admin'));
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    mockFetchSequence([
      { ok: true, json: [row('household-1', { address_street: null, address_confidential: true }), row('household-2')] },
    ]);
    const body = await (await handler(req('GET'))).json();
    expect(body.mine.confidential).toBe(true);
    expect(body.mine.complete).toBe(true);
  });

  it('returns the state statute with the disclaimer', async () => {
    vi.mocked(resolveFamilyId).mockResolvedValue(coparent('admin'));
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const fetchMock = mockFetchSequence([
      { ok: true, json: [row('household-1'), row('household-2')] },
      { ok: true, json: [{ state_code: 'IL', state_name: 'Illinois', statute_citation: '750 ILCS 5/609.2', summary: 's', confidence: 'unreviewed', source_url: null }] },
    ]);
    const body = await (await handler(req('GET'))).json();
    expect(String(fetchMock.mock.calls[1][0])).toContain('state_code=eq.IL');
    expect(body.statute.citation).toBe('750 ILCS 5/609.2');
    expect(body.statute.confidence).toBe('unreviewed');
    expect(body.statuteDisclaimer).toBe(STATUTE_DISCLAIMER);
    expect(body.statuteDisclaimer).toMatch(/not legal advice/i);
  });

  it('still returns addresses when the statute lookup fails', async () => {
    vi.mocked(resolveFamilyId).mockResolvedValue(coparent('admin'));
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    mockFetchSequence([
      { ok: true, json: [row('household-1'), row('household-2')] },
      { ok: false, status: 500 },
    ]);
    const res = await handler(req('GET'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.statute).toBeNull();
  });
});

describe('POST /api/coparent-address — confidential', () => {
  it('accepts confidential with no address and stores the flag', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    const fetchMock = mockFetchSequence([{ ok: true, json: [] }]);
    const res = await handler(req('POST', { confidential: true }));
    expect(res.status).toBe(200);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.address_confidential).toBe(true);
    expect(sent.address_street).toBeNull();
  });

  it('still requires every field when not confidential', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    const res = await handler(req('POST', { addressStreet: '123 Main St' }));
    expect(res.status).toBe(400);
  });

  it('clears the flag when saving a normal address', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(requireBillingRole).mockResolvedValue({ ok: true });
    const fetchMock = mockFetchSequence([{ ok: true, json: [] }]);
    await handler(req('POST', { addressStreet: '1 St', addressCity: 'C', addressState: 'IL', addressZip: '62704', contactPhone: '555-1234' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).address_confidential).toBe(false);
  });
});
