import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_familyAuth.js', () => ({ resolveFamilyId: vi.fn(), resolveHouseholdId: vi.fn() }));
vi.mock('./_billingAuth.js', () => ({ requireBillingRole: vi.fn() }));

import handler from './coparent-address';
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
