import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_haConfig.js', () => ({ resolveHaConfig: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './ha-discover';
import { resolveHouseholdId } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { checkRateLimit } from './_rateLimit.js';

function req(method = 'GET', auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/ha-discover', {
    method,
    headers: { authorization: auth },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('GET /api/ha-discover', () => {
  it('rejects with 401 when no auth token provided', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req('GET', ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    const res = await handler(req());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('10s');
  });

  it('rejects with 500 when Home Assistant is not configured', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: null, haToken: null });
    const res = await handler(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('not configured');
  });

  it('discovers controllable entities and filters out disallowed domains', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: 'http://ha.local:8123', haToken: 'token-123' });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { entity_id: 'light.kitchen_lights', state: 'on', attributes: { friendly_name: 'Kitchen Lights' } },
        { entity_id: 'lock.front_door', state: 'locked', attributes: { friendly_name: 'Front Door' } },
        { entity_id: 'switch.coffee_maker', state: 'off', attributes: {} },
        { entity_id: 'climate.hallway_thermostat', state: 'heat', attributes: { friendly_name: 'Hallway Thermostat' } },
        { entity_id: 'sensor.bedroom_temp', state: '72' }, // not in controllable domains
        { entity_id: 'automation.night_mode', state: 'on' }, // not in controllable domains
      ],
    } as any);

    const res = await handler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entities).toEqual([
      { entity_id: 'light.kitchen_lights', domain: 'light', state: 'on', friendly_name: 'Kitchen Lights' },
      { entity_id: 'lock.front_door', domain: 'lock', state: 'locked', friendly_name: 'Front Door' },
      { entity_id: 'switch.coffee_maker', domain: 'switch', state: 'off', friendly_name: 'switch.coffee_maker' },
      { entity_id: 'climate.hallway_thermostat', domain: 'climate', state: 'heat', friendly_name: 'Hallway Thermostat' },
    ]);
  });

  it('rejects POST with 405', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const res = await handler(req('POST'));
    expect(res.status).toBe(405);
  });
});
