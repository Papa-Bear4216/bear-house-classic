import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_haConfig.js', () => ({ resolveHaConfig: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './ha-control';
import { resolveHouseholdId } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/ha-control', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: 'http://ha.local:8123', haToken: 'ha-token' });
});

describe('POST /api/ha-control', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ domain: 'light', service: 'turn_on', entityId: 'light.kitchen' }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when the token does not resolve to a household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ domain: 'light', service: 'turn_on', entityId: 'light.kitchen' }));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when the household is rate-limited', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });
    const res = await handler(req({ domain: 'light', service: 'turn_on', entityId: 'light.kitchen' }));
    expect(res.status).toBe(429);
  });

  it('rejects with 400 when entityId domain does not match the requested service domain', async () => {
    // Regression guard: without this check a caller could request
    // domain "light" but target a "lock.*" entity.
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const res = await handler(req({ domain: 'light', service: 'turn_off', entityId: 'lock.front_door' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/must start with/i);
  });

  it('rejects with 500 when Home Assistant is not configured for this household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: undefined, haToken: undefined });
    const res = await handler(req({ domain: 'light', service: 'turn_on', entityId: 'light.kitchen' }));
    expect(res.status).toBe(500);
  });

  it('calls the resolved household HA instance and returns 200 on success', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' } as Response);

    const res = await handler(req({ domain: 'light', service: 'turn_on', entityId: 'light.kitchen' }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ha.local:8123/api/services/light/turn_on',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer ha-token' }),
        body: JSON.stringify({ entity_id: 'light.kitchen' }),
      })
    );
  });

  it('propagates a non-2xx response from Home Assistant as the same status', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'entity not found' } as Response);

    const res = await handler(req({ domain: 'light', service: 'turn_on', entityId: 'light.kitchen' }));
    expect(res.status).toBe(404);
  });
});
