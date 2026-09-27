/**
 * /api/voice-alexa — Alexa Smart Home Skill adapter (Edge Runtime).
 *
 * Receives Alexa Smart Home directive payloads and maps them to
 * FamilyOS devices via the shared device dispatcher.
 *
 * Alexa sends POST with { directive: { header, endpoint, header, ... } }.
 * Returns Alexa-aligned response structure.
 *
 * Discover queries HA for all controllable entities and maps them to
 * Alexa capability interfaces (PowerController, BrightnessController, etc.).
 *
 * Account linking is configured in the Alexa Developer Console —
 * FamilyOS handles the OAuth token exchange here.
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

const HA_DOMAIN_TO_ALEXA_CAPABILITY: Record<string, string> = {
  light: 'Alexa.PowerController',
  switch: 'Alexa.PowerController',
  lock: 'Alexa.LockController',
  climate: 'Alexa.ThermostatController',
  fan: 'Alexa.PowerController',
  cover: 'Alexa.ChannelController',
  vacuum: 'Alexa.PowerController',
};

const HA_DOMAIN_TO_ALEXA_PROPERTIES: Record<string, string[]> = {
  light: ['powerState', 'brightness'],
  switch: ['powerState'],
  lock: ['lockState'],
  climate: ['temperatureSetpoint', 'thermostatMode'],
  fan: ['powerState'],
  cover: ['channel'],
  vacuum: ['powerState'],
};

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

function haEntityToAlexaEndpoint(entityId: string, householdId: string) {
  const domain = entityId.split('.')[0];
  const name = entityId.split('.')[1].replace(/_/g, ' ');
  const capability = HA_DOMAIN_TO_ALEXA_CAPABILITY[domain];
  const properties = HA_DOMAIN_TO_ALEXA_PROPERTIES[domain] || ['powerState'];
  return {
    endpointId: entityId,
    friendlyName: name,
    description: `FamilyOS ${domain}`,
    manufacturerName: 'FamilyOS',
    displayCategories: [domain],
    cookie: { householdId },
    capabilities: [{ type: 'AlexaInterface', interface: capability, version: '3', properties: { supported: properties.map(p => ({ name: p })), proactivelyReport: false, retrievable: false } }],
  };
}

function mapAlexaDirectiveToFamilyOS(namespace: string, name: string): string | null {
  const id = `${namespace}.${name}`;
  switch (id) {
    case 'Alexa.PowerController.TurnOn': return 'turn_on';
    case 'Alexa.PowerController.TurnOff': return 'turn_off';
    case 'Alexa.PowerController.Toggle': return 'toggle';
    case 'Alexa.LockController.Lock': return 'lock';
    case 'Alexa.LockController.Unlock': return 'unlock';
    case 'Alexa.ChannelController.Open': return 'open_cover';
    case 'Alexa.ChannelController.Close': return 'close_cover';
    case 'Alexa.StartController.Start': return 'start';
    case 'Alexa.StartController.Stop': return 'stop';
    case 'Alexa.ThermostatController.SetTargetTemperature':
      return 'set_temperature';
    default:
      return null; // unsupported directive
  }
}

function mapAlexaParams(directive: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const payload = directive?.payload || {};

  if (payload?.targetTemperature != null) result.temperature = payload.targetTemperature;
  if (payload?.targetSetpoint != null) result.temperature = payload.targetSetpoint;
  if (payload?.brightness != null) result.brightness = payload.brightness;
  if (payload?.mode != null) result.mode = payload.mode;

  return result;
}

function buildAlexaResponse(
  correlationToken: string,
  endpointId: string,
  bearerToken: string,
  status: string,
  errorCode?: string,
) {
  return {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'Response',
        messageId: correlationToken,
        correlationToken,
        payloadVersion: '3',
      },
      endpoint: { scope: { type: 'BearerToken', token: bearerToken }, endpointId },
      payload: {},
    },
  };
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({}));
  const directive = rawBody.directive;
  if (!directive) return j({ error: 'Missing directive' }, 400);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  if (!canControlDevices(caller)) {
    return j({ error: 'This account is not permitted to control devices' }, 403);
  }
  const { householdId } = caller;

  const rl = await checkRateLimit(householdId, 'voice-alexa', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const { header, endpoint, payload } = directive;
  const namespace = header?.namespace || '';
  const name = header?.name || '';
  const correlationToken = header?.correlationToken || '';
  const entityId = endpoint?.endpointId;
  const bearerToken = endpoint?.scope?.token || accessToken;

  if (name === 'Discover') {
    const states = await getHaStates(householdId);
    const endpoints = states
      .filter((s: any) => s.entity_id && s.state !== 'unavailable')
      .map((s: any) => haEntityToAlexaEndpoint(s.entity_id, householdId));
    return j({
      event: {
        header: { namespace: 'Alexa', name: 'Discover.Response', messageId: correlationToken, correlationToken, payloadVersion: '3' },
        payload: { endpoints },
      },
    });
  }

  // Control directives
  const familyAction = mapAlexaDirectiveToFamilyOS(namespace, name);
  const params = mapAlexaParams(directive);

  if (familyAction == null) {
    return j({
      event: {
        header: { namespace: 'Alexa', name: 'ErrorResponse', messageId: correlationToken, correlationToken, payloadVersion: '3' },
        payload: { type: 'INVALID_DIRECTIVE', message: `Unsupported directive: ${namespace}.${name}` },
      },
    }, 400);
  }

  const result = await dispatchDevice(householdId, {
    deviceId: entityId,
    action: familyAction,
    params,
  });

  if (result.ok) {
    const response = buildAlexaResponse(correlationToken, entityId, bearerToken, 'SUCCESS');
    return j(response);
  }

  return j({
    event: {
      header: { namespace: 'Alexa', name: 'ErrorResponse', messageId: correlationToken, correlationToken, payloadVersion: '3' },
      payload: { type: 'INTERNAL_ERROR', message: result.error || 'Device control failed' },
    },
  }, 500);
}
