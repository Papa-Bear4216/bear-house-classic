import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_haConfig.js', () => ({ resolveHaConfig: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './ha-cameras';
import { resolveHouseholdId } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { checkRateLimit } from './_rateLimit.js';

function req(url = 'https://example.com/api/ha-cameras', method = 'GET', auth = 'Bearer valid-token') {
  return new Request(url, {
    method,
    headers: { authorization: auth },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('GET /api/ha-cameras', () => {
  it('rejects with 401 when there is no auth token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req('https://example.com/api/ha-cameras', 'GET', ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 25 });
    const res = await handler(req());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('25s');
  });

  it('rejects with 500 when Home Assistant is not configured for household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: null, haToken: null });
    const res = await handler(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('not configured');
  });

  it('lists camera entities when no entity query param is passed', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: 'http://ha.local:8123', haToken: 'ha-token-xyz' });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { entity_id: 'camera.living_room', state: 'idle', attributes: { friendly_name: 'Living Room Camera' } },
        { entity_id: 'light.kitchen_lamp', state: 'on' },
        { entity_id: 'camera.backyard', state: 'recording', attributes: {} },
      ],
    } as any);

    const res = await handler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cameras).toEqual([
      { entityId: 'camera.living_room', name: 'Living Room Camera', state: 'idle' },
      { entityId: 'camera.backyard', name: 'camera.backyard', state: 'recording' },
    ]);
  });

  it('fetches a snapshot data URI when entity query param is supplied', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: 'http://ha.local:8123', haToken: 'ha-token-xyz' });

    // Mock binary buffer
    const mockBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG header bytes
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => mockBytes.buffer,
    } as any);

    const res = await handler(req('https://example.com/api/ha-cameras?entity=camera.living_room'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entity).toBe('camera.living_room');
    expect(body.image).toMatch(/^data:image\/jpeg;base64,/);
    expect(fetch).toHaveBeenCalledWith(
      'http://ha.local:8123/api/camera_proxy/camera.living_room',
      expect.anything()
    );
  });

  it('rejects POST with 405 Method Not Allowed', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const res = await handler(req('https://example.com/api/ha-cameras', 'POST'));
    expect(res.status).toBe(405);
  });
});
