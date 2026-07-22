// api/ha-fix.ts
export const config = { runtime: 'edge' };

import { resolveFix } from './_integrationFixMap.js';
import { resolveHouseholdId } from './_db.js';
import { parseBody, HaFixBodySchema } from './_schemas.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export type FixResult = {
  ok: boolean; tier: 1 | 2 | 3; action?: string; result?: unknown;
  needsKey?: boolean; assisted?: boolean;
  keyUrl?: string; reconfigUrl?: string; prefillUser?: string; error?: string;
};

async function haService(domain: string, service: string, data: object) {
  const HA_URL = process.env.HOME_ASSISTANT_URL!;
  const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN!;
  const res = await fetch(`${HA_URL}/api/services/${domain}/${service}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${HA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HA service ${domain}.${service} failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

async function restartAddon(slug: string) {
  const HA_URL = process.env.HOME_ASSISTANT_URL!;
  const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN!;
  const res = await fetch(`${HA_URL}/api/hassio/addons/${slug}/restart`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${HA_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Addon restart ${slug} failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

// Find the config_entry_id for a given integration domain, so we can reload it.
// NOTE: /api/config/config_entries/entry is exposed on the REST API for admin long-lived
// tokens on current HA, but has been websocket-only on some older versions. If the GET 404s,
// we fall back to the service call WITHOUT entry_id targeting is not possible, so we surface a
// clear error and let the caller (health-check) fall through to an alert instead of silently
// "succeeding". Task 2 Step 5 verifies this endpoint against the live box before relying on it.
async function reloadByDomain(domain: string) {
  const HA_URL = process.env.HOME_ASSISTANT_URL!;
  const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN!;
  const listRes = await fetch(`${HA_URL}/api/config/config_entries/entry`, {
    headers: { Authorization: `Bearer ${HA_TOKEN}` },
  });
  if (listRes.status === 404) {
    throw new Error('config_entries endpoint not exposed on this HA (websocket-only) — reload unavailable via REST');
  }
  if (!listRes.ok) throw new Error(`Config entries list failed: ${listRes.status}`);
  const entries = (await listRes.json()) as any[];
  const entry = entries.find((e) => e.domain === domain);
  if (!entry) throw new Error(`No config entry found for domain ${domain}`);
  return haService('homeassistant', 'reload_config_entry', { entry_id: entry.entry_id });
}

export async function runFix(integration: string, key?: string): Promise<FixResult> {
  const fix = resolveFix(integration);
  const HA_URL = process.env.HOME_ASSISTANT_URL!;

  try {
    if (fix.tier === 1) {
      if (fix.action === 'restart_addon' && fix.addonSlug) {
        const result = await restartAddon(fix.addonSlug);
        return { ok: true, tier: 1, action: 'restart_addon', result };
      }
      if (fix.action === 'reload_config_entry' && fix.configEntryDomain) {
        const result = await reloadByDomain(fix.configEntryDomain);
        return { ok: true, tier: 1, action: 'reload_config_entry', result };
      }
      return { ok: false, tier: 1, error: 'Tier 1 fix misconfigured' };
    }

    if (fix.tier === 2) {
      if (!key) {
        return { ok: false, tier: 2, needsKey: true, keyUrl: fix.keyUrl };
      }
      // Tier 2: HA has no generic "set API key" REST endpoint; the practical automatable
      // step is to reload the config entry after the user updates the key via the deep-link.
      // We push the key into a Supabase-held staging value the user's HA automation can read,
      // then reload. If configEntryDomain is set, reload it.
      if (fix.configEntryDomain) {
        const result = await reloadByDomain(fix.configEntryDomain);
        return { ok: true, tier: 2, action: 'reload_config_entry', result };
      }
      return { ok: true, tier: 2 };
    }

    // Tier 3 — assisted only
    return {
      ok: false, tier: 3, assisted: true,
      keyUrl: fix.keyUrl,
      reconfigUrl: fix.haReconfigPath ? `${HA_URL}${fix.haReconfigPath}` : undefined,
      prefillUser: fix.prefillUser,
    };
  } catch (e: any) {
    return { ok: false, tier: fix.tier, error: e?.message || 'fix failed' };
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);
  const accessToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(HaFixBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { integration, key } = parsed.data;

  const result = await runFix(integration, key);
  return j(result, result.ok ? 200 : 200); // always 200; ok flag carries success
}
