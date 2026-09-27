import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));

import handler from './data-write';
import { checkRateLimit } from './_rateLimit.js';
import { resolveHouseholdId } from './_db.js';

function req(body: unknown, opts: { secret?: string | null; auth?: string } = {}) {
  const { secret = 'test-write-secret', auth = 'Bearer valid-token' } = opts;
  return new Request('https://example.com/api/data-write', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: auth,
      ...(secret ? { 'x-write-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  process.env.DATA_WRITE_SECRET = 'test-write-secret';
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
});

describe('POST /api/data-write', () => {
  it('rejects with 500 when DATA_WRITE_SECRET is not configured', async () => {
    delete process.env.DATA_WRITE_SECRET;
    const res = await handler(req({ key: 'chores', value: {} }));
    expect(res.status).toBe(500);
  });

  it('rejects with 401 when x-write-secret is missing', async () => {
    const res = await handler(req({ key: 'chores', value: {} }, { secret: null }));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when x-write-secret does not match', async () => {
    const res = await handler(req({ key: 'chores', value: {} }, { secret: 'wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when there is no bearer token, even with a valid write secret', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ key: 'chores', value: {} }, { auth: '' }));
    expect(res.status).toBe(401);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the token does not resolve to a household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ key: 'chores', value: {} }));
    expect(res.status).toBe(401);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('never trusts a client-supplied householdId — always resolves it from the access token', async () => {
    // Regression guard for the cross-household read/write hole: a client
    // naming a different household's id in the body must not affect which
    // household's row gets written.
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, text: async () => '' } as Response);

    await handler(req({ key: 'chores', value: { done: true }, householdId: 'attacker-controlled-household' } as any));

    const writeCall = vi.mocked(fetch).mock.calls[0];
    const sentBody = JSON.parse(writeCall[1]!.body as string);
    expect(sentBody.household_id).toBe('household-1');
  });

  it('rejects with 403 when the key is server-managed (e.g. simplefin_access_)', async () => {
    // Regression guard: a generic client write to a server-managed key would
    // either strip owner_member_id (leaking per-member finance data to the
    // whole household) or clobber a sync job's value out from under it.
    const res = await handler(req({ key: 'simplefin_access_123', value: {} }));
    expect(res.status).toBe(403);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects with 429 when the household is rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 5 });
    const res = await handler(req({ key: 'chores', value: {} }));
    expect(res.status).toBe(429);
  });

  it('writes successfully and returns 200 with an updatedAt', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, text: async () => '' } as Response);
    const res = await handler(req({ key: 'chores', value: { done: true } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.updatedAt).toBe('string');
  });

  it('returns 409 with the current value when expectedUpdatedAt does not match', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ value: { done: false }, updated_at: '2026-01-01T00:00:00.000Z' }],
    } as Response);

    const res = await handler(req({
      key: 'chores', value: { done: true }, expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
    }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.currentUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
    // Only the version-check GET happened, no write PATCH/POST followed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('proceeds with the write when expectedUpdatedAt matches the current version', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ value: { done: false }, updated_at: '2026-01-01T00:00:00.000Z' }],
      } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => '' } as Response);

    const res = await handler(req({
      key: 'chores', value: { done: true }, expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when the Supabase write fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, statusText: 'error', text: async () => 'db down' } as Response);
    const res = await handler(req({ key: 'chores', value: {} }));
    expect(res.status).toBe(502);
  });
});
