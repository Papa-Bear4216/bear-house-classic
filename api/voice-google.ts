/**
 * /api/voice-google — Google Home Graph adapter (Edge Runtime).
 *
 * Receives Google Home Graph commands (SYNC, QUERY, EXECUTE) and
 * maps them to FamilyOS devices via the shared device dispatcher.
 *
 * Google sends POST with { inputs: [{ intent, payload }] }.
 * Returns Google-aligned response structure.
 *
 * Device discovery queries HA for all controllable entities and
 * maps them to Google device objects (OnOff, Brightness, Temperature, etc.).
 *
 * OAuth account linking is configured in Google Cloud Console —
 * FamilyOS handles the token exchange here and resolves householdId.
 *
 * Env vars: HOME_ASSISTANT_URL, HOME_ASSISTANT_TOKEN (shared fallback)
 */
export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { resolveHaConfig } from './_haConfig.js';
import { dispatchDevice } from './_deviceDispatcher.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { json as j, serverError } from './_responseHelpers.js';

const HA_DOMAIN_TO_GOOGLE_TYPE: Record<string, string> = {
  light: 'light',
  switch: 'switch',
  lock: 'lock',
  climate: 'thermostat',
  fan: 'fan',
  cover: 'cover',
  vacuum: 'vacuum',
};

const HA_DOMAIN_TO_GOOGLE_TRAITS: Record<string, string[]> = {
  light: ['action.devices.traits.OnOff', 'action.devices.traits.Brightness'],
  switch: ['action.devices.traits.OnOff'],
  lock: ['action.devices.traits.LockUnlock'],
  climate: ['action.devices.traits.TemperatureSetting'],
  fan: ['action.devices.traits.OnOff'],
  cover: ['action.devices.traits.OpenClose'],
  vacuum: ['action.devices.traits.OnOff', 'action.devices.traits.StartStop'],
};

function haEntityToGoogleDevice(entityId: string) {
  const domain = entityId.split('.')[0];
  const type = HA_DOMAIN_TO_GOOGLE_TYPE[domain];
  const traits = HA_DOMAIN_TO_GOOGLE_TRAITS[domain] || [];
  const name = entityId.split('.')[1].replace(/_/g, ' ');
  return {
    id: entityId,
    type,
    traits,
    name: { name },
    willReportState: true,
    attributes: domain === 'climate' ? { temperatureRange: { minC: 10, maxC: 35 }, temperatureUnit: 'C' } : {},
  };
}

async function getHaStates(householdId: string): Promise<any[]> {
  const { haUrl, haToken } = await resolveHaConfig(householdId);
  if (!haUrl || !haToken) return [];
  try {
    const res = await fetch(`${haUrl}/api/states`, {
      headers: { Authorization: `Bearer ${haToken}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

function mapGoogleActionToFamilyOS(googleAction: string): string {
  switch (googleAction) {
    case 'action.devices.commands.OnOff': return 'turn_on';
    case 'action.devices.commands.BrightnessAbsolute': return 'set_brightness';
    case 'action.devices.commands.BrightnessRelative': return 'set_brightness';
    case 'action.devices.commands.TemperatureSetting': return 'set_temperature';
    case 'action.devices.commands.LockUnlock': return 'lock';
    case 'action.devices.commands.OpenClose': return 'open_cover';
    case 'action.devices.commands.StartStop': return 'start';
    case 'action.devices.commands.Stop': return 'stop';
    default: return 'turn_on';
  }
}

function mapGoogleParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (params.cmd) {
    for (const cmd of (params.cmd as any[])) {
      if (cmd?.setting?.brightness) result.brightness = cmd.setting.brightness;
      if (cmd?.setting?.thermostatTemperatureSetpoint) result.temperature = cmd.setting.thermostatTemperatureSetpoint;
    }
  }
  return result;
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'voice-google', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const inputs = rawBody.inputs || [];
  const results: any[] = [];

  for (const input of inputs) {
    const { intent, payload } = input || {};

    if (intent === 'action.devices.SYNC') {
      const states = await getHaStates(householdId);
      const devices = states
        .filter((s: any) => s.entity_id && s.state !== 'unavailable')
        .map((s: any) => haEntityToGoogleDevice(s.entity_id));
      results.push({
        requestId: input.requestId,
        payload: { agentUserId: householdId, devices: { devices } },
      });
    }

    else if (intent === 'action.devices.QUERY') {
      const states = await getHaStates(householdId);
      const devices = states.map((s: any) => ({
        id: s.entity_id,
        status: s.state === 'on' ? 'SUCCESS' : s.state === 'off' ? 'SUCCESS' : 'ERROR',
        online: true,
        ...(s.attributes?.brightness != null ? { brightness: s.attributes.brightness } : {}),
        ...(s.attributes?.temperature != null ? { temperature: s.attributes.temperature } : {}),
        ...(s.attributes?.locked != null ? { isLocked: s.attributes.locked } : {}),
      }));
      results.push({ requestId: input.requestId, payload: { devices } });
    }

    else if (intent === 'action.devices.EXECUTE') {
      const commands = (payload as any)?.commands || [];
      const executeResults: any[] = [];

      for (const cmd of commands) {
        for (const device of (cmd.devices || [])) {
          const entityId = device.id;
          const domain = entityId.split('.')[0];
          const googleAction = cmd.execution?.[0]?.command;
          const familyAction = mapGoogleActionToFamilyOS(googleAction || '');
          const params = mapGoogleParams(cmd.execution?.[0]?.params || {});

          const result = await dispatchDevice(householdId, {
            deviceId: entityId,
            action: familyAction as any,
            params,
          });

          executeResults.push({
            ids: [entityId],
            status: result.ok ? 'SUCCESS' : 'ERROR',
            ...(result.ok ? {} : { error: result.error }),
          });
        }
      }

      results.push({ requestId: input.requestId, payload: { commands: executeResults } });
    }

    else {
      results.push({ requestId: input.requestId, error: `Unknown intent: ${intent}` });
    }
  }

  return j({ requestId: rawBody.requestId, payload: {}, results });
}
