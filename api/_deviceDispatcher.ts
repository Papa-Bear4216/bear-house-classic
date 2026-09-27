/**
 * Device control dispatcher — resolves household config and routes
 * commands to whichever backend is configured. Currently the only
 * real backend is Home Assistant (via the existing ha-control path).
 *
 * This module is shared by api/devices/control.ts and api/voice-trigger.ts
 * so that Google/Alexa adapters and voice triggers all converge on the
 * same dispatch logic without duplicating routing.
 *
 * If no backend is configured for a household, returns a clear
 * "not configured" error instead of silently failing.
 */

import { resolveHaConfig } from './_haConfig.js';
import { resolveHouseholdId } from './_db.js';
import { serverError } from './_responseHelpers.js';

export interface DispatchResult {
  ok: boolean;
  error?: string;
}

export interface DeviceCommand {
  deviceId: string;
  action: string;
  params?: Record<string, unknown>;
}

/**
 * Route a device command to the appropriate backend.
 *
 * Currently: HA-only. If the household has HA configured, the
 * deviceId is passed directly as an HA entity_id and the action
 * as an HA service call. This mirrors api/ha-control.ts logic.
 *
 * Future: vendor adapters (Google/Alexa) would resolve deviceId
 * to vendor-specific entity ids and call vendor APIs here instead.
 */
export async function dispatchDevice(
  householdId: string,
  command: DeviceCommand
): Promise<DispatchResult> {
  const { haUrl: HA_URL, haToken: HA_TOKEN } = await resolveHaConfig(householdId);

  if (!HA_URL || !HA_TOKEN) {
    return { ok: false, error: 'No device backend configured for this household. Set up Home Assistant in Settings.' };
  }

  const { deviceId, action } = command;
  const cleanEntityId = deviceId.trim().toLowerCase();

  if (!cleanEntityId || !cleanEntityId.includes('.')) {
    return { ok: false, error: 'deviceId must be an HA entity_id, e.g. light.kitchen' };
  }

  const domain = cleanEntityId.split('.')[0];
  const validDomains = ['light', 'switch', 'lock', 'climate', 'fan', 'cover', 'vacuum'];
  if (!validDomains.includes(domain)) {
    return { ok: false, error: `Unsupported device domain "${domain}". Supported: ${validDomains.join(', ')}` };
  }

  const validActions: Record<string, string[]> = {
    light: ['turn_on', 'turn_off', 'toggle', 'set_brightness', 'set_color'],
    switch: ['turn_on', 'turn_off', 'toggle'],
    lock: ['lock', 'unlock'],
    climate: ['turn_on', 'turn_off', 'set_temperature'],
    fan: ['turn_on', 'turn_off', 'toggle'],
    cover: ['open_cover', 'close_cover', 'toggle'],
    vacuum: ['start', 'stop', 'return_to_base'],
  };

  const allowed = validActions[domain] || [];
  if (!allowed.includes(action)) {
    return { ok: false, error: `Action "${action}" not valid for domain "${domain}". Valid: ${allowed.join(', ')}` };
  }

  const service = domain === 'climate' && action === 'set_temperature' ? 'set_temperature'
    : domain === 'climate' && action === 'turn_on' ? 'turn_on'
    : domain === 'light' && (action === 'set_brightness' || action === 'set_color') ? 'turn_on'
    : action;

  const body: Record<string, unknown> = { entity_id: cleanEntityId };
  if (command.params) {
    // Allowed param keys per domain+action — reject anything that could
    // target a different entity or broaden scope (e.g. entity_id, area_id).
    const allowedParams: Record<string, string[]> = {
      light: ['brightness', 'rgb_color', 'color_temp', 'transition'],
      switch: [],
      lock: [],
      climate: ['temperature', 'hvac_mode'],
      fan: [],
      cover: ['position'],
      vacuum: [],
    };
    const allowed = allowedParams[domain] || [];
    for (const key of Object.keys(command.params)) {
      if (!allowed.includes(key)) {
        return { ok: false, error: `Parameter "${key}" not allowed for ${domain} ${action}` };
      }
    }
    Object.assign(body, command.params);
  }

  // Brightness/color: HA expects these on light.turn_on, not as separate services.
  if (domain === 'light' && action === 'set_brightness' && body.brightness != null) {
    body.brightness = Math.max(0, Math.min(255, Math.round(Number(body.brightness))));
  }

  try {
    const res = await fetch(`${HA_URL}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${HA_TOKEN}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `HA ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error reaching device backend' };
  }
}
