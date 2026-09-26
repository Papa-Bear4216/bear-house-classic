import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_haConfig.js', () => ({ resolveHaConfig: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_deviceDispatcher.js', () => ({ dispatchDevice: vi.fn() }));

import handler from './voice-alexa';
import { resolveHouseholdId } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { checkRateLimit } from './_rateLimit.js';
import { dispatchDevice } from './_deviceDispatcher.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/voice-alexa', {
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
  vi.mocked(dispatchDevice).mockResolvedValue({ ok: true });
});

describe('POST /api/voice-alexa', () => {
  it('rejects with 401 when no bearer token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ directive: { header: { name: 'Discover' } } }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    const res = await handler(req({ directive: { header: { name: 'Discover' } } }));
    expect(res.status).toBe(429);
  });

  it('handles Discover intent', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [
        { entity_id: 'light.kitchen', state: 'on', attributes: { brightness: 80 } },
        { entity_id: 'lock.front_door', state: 'locked' },
      ],
    } as any);
    const res = await handler(req({ directive: { header: { name: 'Discover', correlationToken: 'tok-1' }, endpoint: {}, payload: {} } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.payload.endpoints.length).toBeGreaterThanOrEqual(1);
  });

  it('handles TurnOn directive', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [{ entity_id: 'light.kitchen', state: 'on' }],
    } as any);
    const res = await handler(req({
      directive: {
        header: { name: 'Alexa.PowerController.TurnOn', correlationToken: 'tok-1' },
        endpoint: { endpointId: 'light.kitchen' },
        payload: {},
      },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.header.name).toBe('Response');
  });

  it('handles TurnOff directive', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [{ entity_id: 'switch.living', state: 'off' }],
    } as any);
    const res = await handler(req({
      directive: {
        header: { name: 'Alexa.PowerController.TurnOff', correlationToken: 'tok-1' },
        endpoint: { endpointId: 'switch.living' },
        payload: {},
      },
    }));
    expect(res.status).toBe(200);
  });

  it('returns ErrorResponse when dispatch fails', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [{ entity_id: 'light.kitchen', state: 'on' }],
    } as any);
    vi.mocked(dispatchDevice).mockResolvedValueOnce({ ok: false, error: 'HA 500' });
    const res = await handler(req({
      directive: {
        header: { name: 'Alexa.PowerController.TurnOn', correlationToken: 'tok-1' },
        endpoint: { endpointId: 'light.kitchen' },
        payload: {},
      },
    }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.event.header.name).toBe('ErrorResponse');
  });

  it('rejects POST with 405', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const res = await handler(new Request('https://example.com/api/voice-alexa', {
      method: 'GET',
      headers: { authorization: 'Bearer valid-token' },
    }) as any);
    expect(res.status).toBe(405);
  });
});
