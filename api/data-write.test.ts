import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './data-write';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, secret: string | null = 'test-write-secret') {
  return new Request('https://example.com/api/data-write', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
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
});

describe('POST /api/data-write', () => {
  it('rejects with 500 when DATA_WRITE_SECRET is not configured', async () => {
    delete process.env.DATA_WRITE_SECRET;
    const res = await handler(req({ key: 'chores', value: {}, householdId: 'h1' }));
    expect(res.status).toBe(500);
  });

  it('rejects with 401 when x-write-secret is missing', async () => {
    const res = await handler(req({ key: 'chores', value: {}, householdId: 'h1' }, null));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when x-write-secret does not match', async () => {
    const res = await handler(req({ key: 'chores', value: {}, householdId: 'h1' }, 'wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('rejects with 403 when the key is server-managed (e.g. simplefin_access_)', async () => {
    // Regression guard: a generic client write to a server-managed key would
    // either strip owner_member_id (leaking per-member finance data to the
    // whole household) or clobber a sync job's value out from under it.
    const res = await handler(req({ key: 'simplefin_access_123', value: {}, householdId: 'h1' }));
    expect(res.status).toBe(403);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('rejects with 429 when the household is rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 5 });
    const res = await handler(req({ key: 'chores', value: {}, householdId: 'h1' }));
    expect(res.status).toBe(429);
  });

  it('writes successfully and returns 200 with an updatedAt', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, text: async () => '' } as Response);
    const res = await handler(req({ key: 'chores', value: { done: true }, householdId: 'h1' }));
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
      key: 'chores', value: { done: true }, householdId: 'h1', expectedUpdatedAt: '2025-01-01T00:00:00.000Z',
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
      key: 'chores', value: { done: true }, householdId: 'h1', expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when the Supabase write fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, statusText: 'error', text: async () => 'db down' } as Response);
    const res = await handler(req({ key: 'chores', value: {}, householdId: 'h1' }));
    expect(res.status).toBe(502);
  });
});
