import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  canControlDevices: (caller: { role: string; canControlDevices: boolean }) =>
    caller.role === 'admin' || caller.role === 'superadmin' || caller.canControlDevices,
  dbGet: vi.fn(),
}));
vi.mock('./_haConfig.js', () => ({ resolveHaConfig: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_deviceDispatcher.js', () => ({ dispatchDevice: vi.fn() }));

import handler from './devices-control';
import { resolveCallerMember } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { checkRateLimit } from './_rateLimit.js';
import { dispatchDevice } from './_deviceDispatcher.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/devices/control', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const admin = { householdId: 'household-1', memberId: 'admin1', role: 'admin', canControlDevices: false };
const childNoPerm = { householdId: 'household-1', memberId: 'kid1', role: 'child', canControlDevices: false };
const childWithPerm = { householdId: 'household-1', memberId: 'kid1', role: 'child', canControlDevices: true };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: null, haToken: null });
  vi.mocked(dispatchDevice).mockResolvedValue({ ok: true });
});

describe('POST /api/devices/control', () => {
  it('rejects with 401 when no bearer token', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req({ deviceId: 'light.kitchen', action: 'turn_on' }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 403 when a child without the device-control override tries to control a device', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(childNoPerm as any);
    const res = await handler(req({ deviceId: 'light.kitchen', action: 'turn_on' }));
    expect(res.status).toBe(403);
    expect(dispatchDevice).not.toHaveBeenCalled();
  });

  it('allows a child with the device-control override enabled', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(childWithPerm as any);
    const res = await handler(req({ deviceId: 'light.kitchen', action: 'turn_on' }));
    expect(res.status).toBe(200);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 15 });
    const res = await handler(req({ deviceId: 'light.kitchen', action: 'turn_on' }));
    expect(res.status).toBe(429);
  });

  it('rejects with 400 for invalid body', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(req({}));
    expect(res.status).toBe(400);
  });

  it('rejects with 500 when no backend is configured', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: null, haToken: null });
    vi.mocked(dispatchDevice).mockResolvedValueOnce({ ok: false, error: 'No device backend configured for this household.' });
    const res = await handler(req({ deviceId: 'light.kitchen', action: 'turn_on' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('configured');
  });

  it('dispatches to the backend on success', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: 'http://ha.local:8123', haToken: 'ha-token' });
    vi.mocked(dispatchDevice).mockResolvedValue({ ok: true });
    const res = await handler(req({ deviceId: 'light.kitchen', action: 'turn_on' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('rejects with 500 when dispatch fails', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(resolveHaConfig).mockResolvedValue({ haUrl: 'http://ha.local:8123', haToken: 'ha-token' });
    vi.mocked(dispatchDevice).mockResolvedValue({ ok: false, error: 'HA 500: internal' });
    const res = await handler(req({ deviceId: 'light.kitchen', action: 'turn_on' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('HA 500');
  });

  it('rejects POST with 405', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(new Request('https://example.com/api/devices/control', {
      method: 'GET',
      headers: { authorization: 'Bearer valid-token' },
    }) as any);
    expect(res.status).toBe(405);
  });
});
