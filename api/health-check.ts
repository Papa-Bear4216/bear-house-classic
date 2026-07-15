// api/health-check.ts
export const config = { runtime: 'edge' };

import { dbGet, dbSet, soleHouseholdId } from './_db.js';
import { notifyIFTTT } from './_notify.js';
import { runFix } from './ha-fix.js';
import { FIX_MAP, resolveFix } from './_integrationFixMap.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Which entity_id prefixes / substrings map to each logical integration id.
// Match on entity_id substrings specific to each integration. Keep these TIGHT —
// a broad matcher (e.g. all 'media_player.') would fold unrelated devices (Cast, Sonos, TVs)
// into the integration's health and trigger false alerts/auto-heals.
const MATCHERS: Record<string, (entityId: string) => boolean> = {
  wyze_bridge: (e) => e.includes('wyze'),
  google_ai: (e) => e.includes('google_ai') || e.includes('google_generative'),
  // Alexa Media Player entities carry 'alexa' in the id; do NOT match bare 'media_player.'.
  alexa: (e) => e.includes('alexa'),
};

const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // don't re-alert same integration within 6h

export default async function handler(_req: Request): Promise<Response> {
  const HA_URL = process.env.HOME_ASSISTANT_URL;
  const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN;
  if (!HA_URL || !HA_TOKEN) return j({ error: 'HA not configured' }, 500);

  const householdId = await soleHouseholdId();

  let states: any[];
  try {
    const res = await fetch(`${HA_URL}/api/states`, {
      headers: { Authorization: `Bearer ${HA_TOKEN}` },
    });
    if (!res.ok) throw new Error(`HA states ${res.status}`);
    states = (await res.json()) as any[];
  } catch (e: any) {
    // HA itself unreachable — record a red snapshot, alert once.
    const snapshot = { updatedAt: Date.now(), integrations: [], overall: 'red' as const, haUnreachable: true };
    await dbSet('system_health', householdId, snapshot);
    return j(snapshot);
  }

  const alertState: Record<string, number> = (await dbGet('health_alert_state', householdId)) ?? {};
  const now = Date.now();
  const integrations: any[] = [];

  for (const id of Object.keys(MATCHERS)) {
    const match = MATCHERS[id];
    const ents = states.filter((s) => match(s.entity_id));
    const total = ents.length;
    const unavailable = ents.filter((s) => s.state === 'unavailable').length;
    const unknown = ents.filter((s) => s.state === 'unknown').length;

    // "down" = every entity unavailable (integration auth dead), or zero entities where we expect some.
    // "degraded" = a meaningful fraction unavailable/unknown.
    let status: 'up' | 'degraded' | 'down' = 'up';
    if (total === 0 || (total > 0 && unavailable === total)) status = 'down';
    else if (total > 0 && (unavailable + unknown) / total > 0.5) status = 'degraded';

    let autoHealed = false;
    if (status !== 'up') {
      const fix = resolveFix(id);
      // Tier 1 → auto-heal now, no human.
      if (fix.tier === 1) {
        const result = await runFix(id);
        autoHealed = result.ok;
      }
      // Alert for credential tiers (2/3), de-duped. Also alert if a Tier-1 auto-heal failed.
      const needsHuman = fix.tier >= 2 || (fix.tier === 1 && !autoHealed);
      const lastAlert = alertState[id] ?? 0;
      if (needsHuman && now - lastAlert > ALERT_COOLDOWN_MS) {
        const reconfig = fix.haReconfigPath ? `${HA_URL}${fix.haReconfigPath}` : `${HA_URL}/config/integrations`;
        await notifyIFTTT('bearhouse_health', `${fix.label} needs attention`, fix.keyUrl || 'Open Home Assistant', reconfig);
        alertState[id] = now;
      } else if ((status as 'up' | 'degraded' | 'down') === 'up') {
        delete alertState[id];
      }
    } else {
      delete alertState[id];
    }

    integrations.push({ id, label: resolveFix(id).label, status, unavailable, unknown, total, autoHealed });
  }

  const anyDown = integrations.some((i) => i.status === 'down' && !i.autoHealed);
  const anyDegraded = integrations.some((i) => i.status !== 'up');
  const overall: 'green' | 'yellow' | 'red' = anyDown ? 'red' : anyDegraded ? 'yellow' : 'green';

  const snapshot = { updatedAt: now, integrations, overall };
  await dbSet('system_health', householdId, snapshot);
  await dbSet('health_alert_state', householdId, alertState);
  return j(snapshot);
}
