/**
 * /api/voice-google — Google Smart Home fulfillment (Edge Runtime).
 *
 * Google calls this with SYNC / QUERY / EXECUTE / DISCONNECT after a user has
 * linked their account (see _googleHome.ts). Devices are the household's Home
 * Assistant entities; commands go through the shared device dispatcher.
 *
 * Auth: the access token issued by /api/google-home-token ("ght1.…"). A plain
 * Supabase session token is still accepted so the route can be exercised by
 * hand. Either way the member must be allowed to control devices.
 *
 * Formats follow Google's cloud-to-cloud spec: device types are
 * action.devices.types.*, QUERY state is one flat object per device,
 * brightness/openPercent are 0–100, temperatures are Celsius.
 */
export const config = { runtime: 'edge' };

import { resolveCallerMember, canControlDevices } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { dispatchDevice } from './_deviceDispatcher.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { json as j } from './_responseHelpers.js';
import { resolveGoogleHomeCaller, revokeLink } from './_googleHome.js';

const T = (n: string) => `action.devices.types.${n}`;
const TR = (n: string) => `action.devices.traits.${n}`;

const DOMAINS: Record<string, { type: string; traits: string[] }> = {
  light: { type: T('LIGHT'), traits: [TR('OnOff'), TR('Brightness')] },
  switch: { type: T('SWITCH'), traits: [TR('OnOff')] },
  lock: { type: T('LOCK'), traits: [TR('LockUnlock')] },
  climate: { type: T('THERMOSTAT'), traits: [TR('TemperatureSetting')] },
  fan: { type: T('FAN'), traits: [TR('OnOff')] },
  cover: { type: T('BLINDS'), traits: [TR('OpenClose')] },
  vacuum: { type: T('VACUUM'), traits: [TR('StartStop')] },
};

type HaState = { entity_id: string; state: string; attributes?: Record<string, any> };
const domainOf = (id: string) => id.split('.')[0];
const isSupported = (s: HaState) => !!s?.entity_id && !!DOMAINS[domainOf(s.entity_id)];

async function getHaStates(householdId: string): Promise<HaState[]> {
  const { haUrl, haToken } = await resolveHaConfig(householdId);
  if (!haUrl || !haToken) return [];
  try {
    const res = await fetch(`${haUrl}/api/states`, { headers: { Authorization: `Bearer ${haToken}` } });
    return res.ok ? await res.json() : [];
  } catch { return []; }
}

// Home Assistant reports/accepts temperatures in its own unit system; Google
// always speaks Celsius.
async function getHaTempUnit(householdId: string): Promise<'C' | 'F'> {
  const { haUrl, haToken } = await resolveHaConfig(householdId);
  if (!haUrl || !haToken) return 'C';
  try {
    const res = await fetch(`${haUrl}/api/config`, { headers: { Authorization: `Bearer ${haToken}` } });
    if (!res.ok) return 'C';
    const cfg = await res.json();
    return String(cfg?.unit_system?.temperature || '').includes('F') ? 'F' : 'C';
  } catch { return 'C'; }
}
const toC = (v: number, u: 'C' | 'F') => (u === 'F' ? Math.round(((v - 32) * 5 / 9) * 10) / 10 : v);
const fromC = (v: number, u: 'C' | 'F') => (u === 'F' ? Math.round((v * 9 / 5 + 32) * 10) / 10 : v);

function toGoogleDevice(s: HaState, unit: 'C' | 'F') {
  const domain = domainOf(s.entity_id);
  const def = DOMAINS[domain];
  const attributes: Record<string, unknown> =
    domain === 'climate' ? { availableThermostatModes: ['off', 'heat', 'cool', 'heatcool'], thermostatTemperatureUnit: unit }
    : domain === 'cover' ? { discreteOnlyOpenClose: true }
    : {};
  return {
    id: s.entity_id,
    type: def.type,
    traits: def.traits,
    name: { name: s.attributes?.friendly_name || s.entity_id.split('.')[1].replace(/_/g, ' ') },
    willReportState: false,
    attributes,
  };
}

const HVAC_TO_GOOGLE: Record<string, string> = { off: 'off', heat: 'heat', cool: 'cool', heat_cool: 'heatcool', auto: 'heatcool' };

function toGoogleState(s: HaState, unit: 'C' | 'F'): Record<string, unknown> {
  if (s.state === 'unavailable') return { status: 'SUCCESS', online: false };
  const a = s.attributes || {};
  const base: Record<string, unknown> = { status: 'SUCCESS', online: true };
  switch (domainOf(s.entity_id)) {
    case 'light':
      return { ...base, on: s.state === 'on', ...(a.brightness != null ? { brightness: Math.round((Number(a.brightness) / 255) * 100) } : {}) };
    case 'switch':
    case 'fan':
      return { ...base, on: s.state === 'on' };
    case 'lock':
      return { ...base, isLocked: s.state === 'locked', isJammed: s.state === 'jammed' };
    case 'cover':
      return { ...base, openPercent: a.current_position != null ? Number(a.current_position) : s.state === 'open' ? 100 : 0 };
    case 'climate':
      return {
        ...base,
        thermostatMode: HVAC_TO_GOOGLE[s.state] ?? 'off',
        ...(a.temperature != null ? { thermostatTemperatureSetpoint: toC(Number(a.temperature), unit) } : {}),
        ...(a.current_temperature != null ? { thermostatTemperatureAmbient: toC(Number(a.current_temperature), unit) } : {}),
      };
    case 'vacuum':
      return { ...base, isRunning: s.state === 'cleaning' };
    default:
      return base;
  }
}

type Mapped = { action: string; params?: Record<string, unknown> } | null;

function mapCommand(command: string, p: Record<string, any>, unit: 'C' | 'F'): Mapped {
  switch (command) {
    case 'action.devices.commands.OnOff':
      return typeof p.on === 'boolean' ? { action: p.on ? 'turn_on' : 'turn_off' } : null;
    case 'action.devices.commands.BrightnessAbsolute': {
      const pct = Number(p.brightness);
      if (!Number.isFinite(pct)) return null;
      return pct <= 0 ? { action: 'turn_off' } : { action: 'set_brightness', params: { brightness: Math.round((Math.min(pct, 100) / 100) * 255) } };
    }
    case 'action.devices.commands.LockUnlock':
      return typeof p.lock === 'boolean' ? { action: p.lock ? 'lock' : 'unlock' } : null;
    case 'action.devices.commands.OpenClose': {
      const pct = Number(p.openPercent);
      return Number.isFinite(pct) ? { action: pct > 0 ? 'open_cover' : 'close_cover' } : null;
    }
    case 'action.devices.commands.StartStop':
      return typeof p.start === 'boolean' ? { action: p.start ? 'start' : 'stop' } : null;
    case 'action.devices.commands.ThermostatTemperatureSetpoint': {
      const c = Number(p.thermostatTemperatureSetpoint);
      return Number.isFinite(c) ? { action: 'set_temperature', params: { temperature: fromC(c, unit) } } : null;
    }
    case 'action.devices.commands.ThermostatSetMode':
      return typeof p.thermostatMode === 'string' ? { action: p.thermostatMode === 'off' ? 'turn_off' : 'turn_on' } : null;
    default:
      return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const accessToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!accessToken) return j({ error: 'Unauthorized' }, 401);
  const viaGoogle = accessToken.startsWith('ght1.');
  const link = viaGoogle ? await resolveGoogleHomeCaller(accessToken) : null;
  const caller = viaGoogle ? link : await resolveCallerMember(accessToken);
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  if (!canControlDevices(caller)) return j({ error: 'This account is not permitted to control devices' }, 403);
  const { householdId } = caller;

  const rl = await checkRateLimit(householdId, 'voice-google', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({})) as any;
  const requestId: string | undefined = rawBody.requestId ?? rawBody.inputs?.[0]?.requestId;
  const input = rawBody.inputs?.[0];
  const intent: string | undefined = input?.intent;
  const payload = input?.payload;

  if (intent === 'action.devices.SYNC') {
    const states = (await getHaStates(householdId)).filter((s) => isSupported(s) && s.state !== 'unavailable');
    const unit = states.some((s) => domainOf(s.entity_id) === 'climate') ? await getHaTempUnit(householdId) : 'C';
    return j({ requestId, payload: { agentUserId: householdId, devices: states.map((s) => toGoogleDevice(s, unit)) } });
  }

  if (intent === 'action.devices.QUERY') {
    const wanted = new Set<string>((payload?.devices || []).map((d: any) => d.id));
    const all = (await getHaStates(householdId)).filter(isSupported);
    const unit = all.some((s) => domainOf(s.entity_id) === 'climate') ? await getHaTempUnit(householdId) : 'C';
    const devices: Record<string, unknown> = {};
    for (const s of all) {
      if (wanted.size > 0 && !wanted.has(s.entity_id)) continue;
      devices[s.entity_id] = toGoogleState(s, unit);
    }
    // A device Google asked about that HA no longer has.
    for (const id of wanted) if (!(id in devices)) devices[id] = { status: 'ERROR', errorCode: 'deviceNotFound' };
    return j({ requestId, payload: { devices } });
  }

  if (intent === 'action.devices.EXECUTE') {
    const commands: any[] = [];
    let unit: 'C' | 'F' | null = null;
    for (const cmd of payload?.commands || []) {
      for (const device of cmd.devices || []) {
        const id: string = device.id;
        let failure: { errorCode: string; debugString?: string } | null = null;
        for (const exec of cmd.execution || []) {
          if (domainOf(id) === 'climate' && unit === null) unit = await getHaTempUnit(householdId);
          const mapped = mapCommand(exec.command, exec.params || {}, unit ?? 'C');
          if (!mapped) { failure = { errorCode: 'functionNotSupported', debugString: `Unsupported or incomplete command: ${exec.command}` }; break; }
          const result = await dispatchDevice(householdId, { deviceId: id, action: mapped.action, params: mapped.params });
          if (!result.ok) { failure = { errorCode: 'hardError', debugString: result.error }; break; }
        }
        commands.push(failure ? { ids: [id], status: 'ERROR', ...failure } : { ids: [id], status: 'SUCCESS', states: { online: true } });
      }
    }
    return j({ requestId, payload: { commands } });
  }

  if (intent === 'action.devices.DISCONNECT') {
    // The user unlinked us in the Google Home app: kill this link's tokens.
    if (link) await revokeLink(link.linkId);
    return j({});
  }

  return j({ requestId, payload: { errorCode: 'protocolError', debugString: `Unknown intent: ${intent}` } });
}
