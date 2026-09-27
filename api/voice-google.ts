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

import { resolveCallerMember, canControlDevices } from './_db.js';
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

function mapGoogleActionToFamilyOS(
  googleAction: string,
  params: Record<string, unknown>,
): string | null {
  switch (googleAction) {
    case 'action.devices.commands.OnOff': {
      const on = params.on;
      if (on === true) return 'turn_on';
      if (on === false) return 'turn_off';
      return null; // 'on' param required
    }
    case 'action.devices.commands.BrightnessAbsolute':
    case 'action.devices.commands.BrightnessRelative':
      return 'set_brightness';
    case 'action.devices.commands.TemperatureSetting':
      return 'set_temperature';
    case 'action.devices.commands.LockUnlock': {
      const lock = params.lock;
      if (lock === true) return 'lock';
      if (lock === false) return 'unlock';
      return null; // 'lock' param required
    }
    case 'action.devices.commands.OpenClose': {
      const open = params.open;
      if (open === true) return 'open_cover';
      if (open === false) return 'close_cover';
      return null; // 'open' param required
    }
    case 'action.devices.commands.StartStop':
      return 'start';
    case 'action.devices.commands.Stop':
      return 'stop';
    default:
      return null; // unsupported command
  }
}

function mapGoogleParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (params.brightness != null) result.brightness = params.brightness;
  if (params.thermostatTemperatureSetpoint != null) result.temperature = params.thermostatTemperatureSetpoint;
  if (params.mode != null) result.mode = params.mode;
  return result;
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  if (!canControlDevices(caller)) {
    return j({ error: 'This account is not permitted to control devices' }, 403);
  }
  const { householdId } = caller;

  const rl = await checkRateLimit(householdId, 'voice-google', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const inputs = rawBody.inputs || [];
  const results: any[] = [];
  let requestId: string | undefined = rawBody.requestId;

  for (const input of inputs) {
    requestId = input.requestId || requestId;
    const { intent, payload } = input || {};

    if (intent === 'action.devices.SYNC') {
      const states = await getHaStates(householdId);
      const devices = states
        .filter((s: any) => s.entity_id && s.state !== 'unavailable')
        .map((s: any) => haEntityToGoogleDevice(s.entity_id));
      results.push({
        requestId: input.requestId,
        payload: { agentUserId: householdId, devices },
      });
    }

    else if (intent === 'action.devices.QUERY') {
      const requestedIds = new Set((payload?.devices || [])?.map((d: any) => d.id) || []);
      const states = await getHaStates(householdId);
      // Return only the requested devices, keyed by device ID.
      const queryResults: Record<string, any> = {};
      for (const s of states) {
        if (!s.entity_id || s.state === 'unavailable') continue;
        if (requestedIds.size > 0 && !requestedIds.has(s.entity_id)) continue;
        queryResults[s.entity_id] = {
          on: { status: s.state === 'on' ? 'SUCCESS' : 'SUCCESS', online: true },
          ...(s.attributes?.brightness != null ? { brightness: { status: 'SUCCESS', value: s.attributes.brightness } } : {}),
          ...(s.attributes?.temperature != null ? { temperature: { status: 'SUCCESS', value: s.attributes.temperature } } : {}),
          ...(s.attributes?.locked != null ? { lockState: { status: 'SUCCESS', value: s.attributes.locked ? 'LOCKED' : 'UNLOCKED' } } : {}),
        };
      }
      results.push({ requestId: input.requestId, payload: { devices: queryResults } });
    }

    else if (intent === 'action.devices.EXECUTE') {
      const commands = (payload as any)?.commands || [];
      const executeResults: any[] = [];

      for (const cmd of commands) {
        for (const device of (cmd.devices || [])) {
          const entityId = device.id;
          const googleAction = cmd.execution?.[0]?.command;
          const rawParams = cmd.execution?.[0]?.params || {};
          const familyAction = mapGoogleActionToFamilyOS(googleAction || '', rawParams);
          const params = mapGoogleParams(rawParams);

          if (familyAction == null) {
            executeResults.push({
              ids: [entityId],
              status: 'ERROR',
              error: { type: 'INVALID_VALUE', message: `Unsupported or incomplete command: ${googleAction}` },
            });
            continue;
          }

          const dispatchResult = await dispatchDevice(householdId, {
            deviceId: entityId,
            action: familyAction,
            params,
          });

          executeResults.push({
            ids: [entityId],
            status: dispatchResult.ok ? 'SUCCESS' : 'ERROR',
            ...(dispatchResult.ok ? {} : { error: { type: 'INTERNAL_ERROR', message: dispatchResult.error } }),
          });
        }
      }

      results.push({ requestId: input.requestId, payload: { commands: executeResults } });
    }

    else {
      results.push({ requestId: input.requestId, error: `Unknown intent: ${intent}` });
    }
  }

  const response: any = { requestId };
  if (results.length === 1 && results[0].payload !== undefined) {
    response.payload = results[0].payload;
  } else {
    response.results = results;
  }
  return j(response);
}
