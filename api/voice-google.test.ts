import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  canControlDevices: (caller: { role: string; canControlDevices: boolean }) =>
    caller.role === 'admin' || caller.role === 'superadmin' || caller.canControlDevices,
}));
vi.mock('./_haConfig.js', () => ({ resolveHaConfig: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_deviceDispatcher.js', () => ({ dispatchDevice: vi.fn() }));
vi.mock('./_googleHome.js', () => ({ resolveGoogleHomeCaller: vi.fn(), revokeLink: vi.fn() }));

import handler from './voice-google';
import { resolveCallerMember } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { checkRateLimit } from './_rateLimit.js';
import { dispatchDevice } from './_deviceDispatcher.js';
import { resolveGoogleHomeCaller, revokeLink } from './_googleHome.js';

const admin = { householdId: 'household-1', memberId: 'admin1', role: 'admin', canControlDevices: false };
const childNoPerm = { householdId: 'household-1', memberId: 'kid1', role: 'child', canControlDevices: false };

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
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC' }] }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 403 when a child without the device-control override sends a request', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(childNoPerm as any);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC' }] }));
    expect(res.status).toBe(403);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC' }] }));
    expect(res.status).toBe(429);
  });

  it('SYNC returns Google device types, friendly names, and traits', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [
        { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen Lights' } },
        { entity_id: 'lock.front', state: 'locked' },
        { entity_id: 'sensor.temp', state: '20' },
        { entity_id: 'switch.gone', state: 'unavailable' },
      ],
    } as any);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC', requestId: 'req-1', payload: {} }] }));
    const body = await res.json();
    expect(body.requestId).toBe('req-1');
    expect(body.payload.agentUserId).toBe('household-1');
    const ids = body.payload.devices.map((d: any) => d.id);
    expect(ids).toEqual(['light.kitchen', 'lock.front']);
    const light = body.payload.devices[0];
    expect(light.type).toBe('action.devices.types.LIGHT');
    expect(light.name.name).toBe('Kitchen Lights');
    expect(light.traits).toContain('action.devices.traits.Brightness');
    expect(body.payload.devices[1].type).toBe('action.devices.types.LOCK');
  });

  it('QUERY returns one flat state object per device, brightness on a 0-100 scale', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [
        { entity_id: 'light.kitchen', state: 'on', attributes: { brightness: 128 } },
        { entity_id: 'light.living', state: 'off', attributes: {} },
        { entity_id: 'lock.front', state: 'locked', attributes: {} },
      ],
    } as any);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.QUERY', requestId: 'r', payload: { devices: [{ id: 'light.kitchen' }, { id: 'lock.front' }, { id: 'light.missing' }] } }] }));
    const d = (await res.json()).payload.devices;
    expect(d['light.kitchen']).toEqual({ status: 'SUCCESS', online: true, on: true, brightness: 50 });
    expect(d).not.toHaveProperty('light.living');
    expect(d['lock.front']).toMatchObject({ isLocked: true, isJammed: false });
    expect(d['light.missing']).toEqual({ status: 'ERROR', errorCode: 'deviceNotFound' });
  });

  it('QUERY with no requested ids returns every supported device', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => [{ entity_id: 'light.a', state: 'on' }, { entity_id: 'switch.b', state: 'off' }],
    } as any);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.QUERY', requestId: 'r', payload: { devices: [] } }] }));
    expect(Object.keys((await res.json()).payload.devices)).toEqual(['light.a', 'switch.b']);
  });

  it('converts a thermostat to Celsius when Home Assistant runs in Fahrenheit', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ entity_id: 'climate.home', state: 'heat', attributes: { temperature: 68, current_temperature: 70 } }] } as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ unit_system: { temperature: '°F' } }) } as any);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.QUERY', requestId: 'r', payload: { devices: [{ id: 'climate.home' }] } }] }));
    const t = (await res.json()).payload.devices['climate.home'];
    expect(t.thermostatMode).toBe('heat');
    expect(t.thermostatTemperatureSetpoint).toBe(20);
    expect(t.thermostatTemperatureAmbient).toBe(21.1);
  });

  const exec = (id: string, command: string, params: object) => req({
    inputs: [{ requestId: 'r', intent: 'action.devices.EXECUTE', payload: { commands: [{ devices: [{ id }], execution: [{ command, params }] }] } }],
  });

  it('EXECUTE OnOff on:false -> turn_off, reported SUCCESS', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const body = await (await handler(exec('light.kitchen', 'action.devices.commands.OnOff', { on: false }))).json();
    expect(dispatchDevice).toHaveBeenCalledWith('household-1', { deviceId: 'light.kitchen', action: 'turn_off', params: undefined });
    expect(body.payload.commands[0]).toEqual({ ids: ['light.kitchen'], status: 'SUCCESS', states: { online: true } });
  });

  it('EXECUTE BrightnessAbsolute scales 0-100 to Home Assistant 0-255', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    await handler(exec('light.kitchen', 'action.devices.commands.BrightnessAbsolute', { brightness: 50 }));
    expect(dispatchDevice).toHaveBeenCalledWith('household-1', { deviceId: 'light.kitchen', action: 'set_brightness', params: { brightness: 128 } });
  });

  it('EXECUTE OpenClose uses openPercent', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    await handler(exec('cover.garage', 'action.devices.commands.OpenClose', { openPercent: 100 }));
    await handler(exec('cover.garage', 'action.devices.commands.OpenClose', { openPercent: 0 }));
    expect(vi.mocked(dispatchDevice).mock.calls.map((c) => c[1].action)).toEqual(['open_cover', 'close_cover']);
  });

  it('EXECUTE StartStop and LockUnlock map both directions', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    await handler(exec('vacuum.rob', 'action.devices.commands.StartStop', { start: false }));
    await handler(exec('lock.front', 'action.devices.commands.LockUnlock', { lock: true }));
    expect(vi.mocked(dispatchDevice).mock.calls.map((c) => c[1].action)).toEqual(['stop', 'lock']);
  });

  it('EXECUTE thermostat setpoint converts Celsius to the HA unit', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ unit_system: { temperature: '°F' } }) } as any);
    await handler(exec('climate.home', 'action.devices.commands.ThermostatTemperatureSetpoint', { thermostatTemperatureSetpoint: 20 }));
    expect(dispatchDevice).toHaveBeenCalledWith('household-1', { deviceId: 'climate.home', action: 'set_temperature', params: { temperature: 68 } });
  });

  it('EXECUTE reports functionNotSupported for an unknown command, without dispatching', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const body = await (await handler(exec('light.kitchen', 'action.devices.commands.Nope', {}))).json();
    expect(dispatchDevice).not.toHaveBeenCalled();
    expect(body.payload.commands[0]).toMatchObject({ status: 'ERROR', errorCode: 'functionNotSupported' });
  });

  it('EXECUTE reports hardError when the device backend fails', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    vi.mocked(dispatchDevice).mockResolvedValue({ ok: false, error: 'HA 500' });
    const body = await (await handler(exec('light.kitchen', 'action.devices.commands.OnOff', { on: true }))).json();
    expect(body.payload.commands[0]).toMatchObject({ status: 'ERROR', errorCode: 'hardError', debugString: 'HA 500' });
  });

  it('authenticates a Google-issued token and scopes everything to the linked member\'s household', async () => {
    vi.mocked(resolveGoogleHomeCaller).mockResolvedValue({ linkId: 'link-1', householdId: 'household-9', memberId: 'm9', role: 'admin', canControlDevices: false });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as any);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC', requestId: 'r', payload: {} }] }, 'Bearer ght1.link-1.9999999999.sig'));
    expect((await res.json()).payload.agentUserId).toBe('household-9');
    expect(resolveCallerMember).not.toHaveBeenCalled();
  });

  it('rejects a Google token that no longer resolves (revoked link)', async () => {
    vi.mocked(resolveGoogleHomeCaller).mockResolvedValue(null);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC' }] }, 'Bearer ght1.link-1.9999999999.sig'));
    expect(res.status).toBe(401);
  });

  it('a demoted member (child, no override) is refused even with a valid link', async () => {
    vi.mocked(resolveGoogleHomeCaller).mockResolvedValue({ linkId: 'link-1', householdId: 'h1', memberId: 'k1', role: 'child', canControlDevices: false });
    const res = await handler(req({ inputs: [{ intent: 'action.devices.SYNC' }] }, 'Bearer ght1.link-1.9999999999.sig'));
    expect(res.status).toBe(403);
  });

  it('DISCONNECT via a Google token revokes that link', async () => {
    vi.mocked(resolveGoogleHomeCaller).mockResolvedValue({ linkId: 'link-1', householdId: 'h1', memberId: 'm1', role: 'admin', canControlDevices: false });
    const res = await handler(req({ inputs: [{ intent: 'action.devices.DISCONNECT', requestId: 'r' }] }, 'Bearer ght1.link-1.9999999999.sig'));
    expect(await res.json()).toEqual({});
    expect(revokeLink).toHaveBeenCalledWith('link-1');
  });

  it('DISCONNECT answers with an empty object', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(req({ inputs: [{ intent: 'action.devices.DISCONNECT', requestId: 'r' }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('answers an unknown intent with protocolError', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const body = await (await handler(req({ inputs: [{ intent: 'unknown.intent', requestId: 'req-1', payload: {} }] }))).json();
    expect(body.requestId).toBe('req-1');
    expect(body.payload.errorCode).toBe('protocolError');
  });

  it('rejects GET with 405', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(admin as any);
    const res = await handler(new Request('https://example.com/api/voice-google', { method: 'GET', headers: { authorization: 'Bearer valid-token' } }) as any);
    expect(res.status).toBe(405);
  });
});
