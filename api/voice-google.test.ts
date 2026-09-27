import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_haConfig.js', () => ({ resolveHaConfig: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_deviceDispatcher.js', () => ({ dispatchDevice: vi.fn() }));

import handler from './voice-google';
import { resolveHouseholdId } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { checkRateLimit } from './_rateLimit.js';
import { dispatchDevice } from './_deviceDispatcher.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/voice-google', {
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

describe('POST /api/voice-google', () => {
  it('rejects with 401 when no bearer token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC' }] }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC' }] }));
    expect(res.status).toBe(429);
  });

  it('handles SYNC intent', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [
        { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen' } },
        { entity_id: 'switch.living', state: 'off' },
      ],
    } as any);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC', requestId: 'req-1', payload: {} }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestId).toBe('req-1');
    expect(body.payload.agentUserId).toBe('household-1');
    expect(Array.isArray(body.payload.devices)).toBe(true);
    expect(body.payload.devices.length).toBeGreaterThanOrEqual(1);
  });

  it('handles QUERY intent — returns only requested devices, keyed by ID', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [
        { entity_id: 'light.kitchen', state: 'on', attributes: { brightness: 80 } },
        { entity_id: 'light.living', state: 'off', attributes: {} },
      ],
    } as any);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.QUERY', requestId: 'req-1', payload: { devices: [{ id: 'light.kitchen' }] } }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestId).toBe('req-1');
    expect(body.payload.devices).toHaveProperty('light.kitchen');
    expect(body.payload.devices).not.toHaveProperty('light.living');
    expect(body.payload.devices['light.kitchen'].on.status).toBe('SUCCESS');
    expect(body.payload.devices['light.kitchen'].brightness).toEqual({ status: 'SUCCESS', value: 80 });
  });

  it('handles QUERY intent — empty requested list returns all devices', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [
        { entity_id: 'light.kitchen', state: 'on', attributes: { brightness: 80 } },
        { entity_id: 'light.living', state: 'off' },
      ],
    } as any);
    const res = await handler(req({
      inputs: [{
        requestId: 'req-1',
        intent: 'action.devices.QUERY',
        payload: { devices: [] },
      }],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestId).toBe('req-1');
    expect(body.payload.devices).toHaveProperty('light.kitchen');
    expect(body.payload.devices).toHaveProperty('light.living');
  });

  it('handles EXECUTE intent — OnOff with on:false maps to turn_off', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [{ entity_id: 'light.kitchen', state: 'on' }],
    } as any);
    vi.mocked(dispatchDevice).mockResolvedValue({ ok: true });
    const res = await handler(req({
      inputs: [{
        requestId: 'req-1',
        intent: 'action.devices.EXECUTE',
        payload: {
          commands: [{
            devices: [{ id: 'light.kitchen' }],
            execution: [{ command: 'action.devices.commands.OnOff', params: { on: false } }],
          }],
        },
      }],
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.requestId).toBe('req-1');
    expect(body.payload.commands.length).toBe(1);
    expect(body.payload.commands[0].status).toBe('SUCCESS');
    expect(body.payload.commands[0].ids).toEqual(['light.kitchen']);
  });

  it('returns error for unknown intent', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const res = await handler(req({ inputs: [{ intent: 'unknown.intent', requestId: 'req-1', payload: {} }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].error).toContain('Unknown intent');
    expect(body.requestId).toBe('req-1');
  });

  it('rejects POST with 405', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const res = await handler(new Request('https://example.com/api/voice-google', {
      method: 'GET',
      headers: { authorization: 'Bearer valid-token' },
    }) as any);
    expect(res.status).toBe(405);
  });
});
