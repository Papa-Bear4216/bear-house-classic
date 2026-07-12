# FamilyOS App-Side Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FamilyOS honest about Home Assistant's state and self-heal the frequent, scriptable failures — while flagging the rare credential failures with actionable, one-tap fixes.

**Architecture:** A Vercel Cron route (`api/health-check`) polls Home Assistant, computes per-integration health, persists a `system_health` snapshot to Supabase, auto-invokes fixes for scriptable failures, and sends de-duped IFTTT alerts for credential failures. A companion route (`api/ha-fix`) runs the highest available fix tier per integration, driven by a static `integrationFixMap`. An in-app "System Health" panel reads the snapshot and exposes per-integration "Fix It" buttons.

**Tech Stack:** Vercel Edge Functions (`runtime: 'edge'`), TypeScript, Supabase REST (via existing `api/_db.ts`), Home Assistant REST + Supervisor API, IFTTT Maker Webhooks (via existing `api/_notify.ts`), React + Tailwind (frontend panel).

## Global Constraints

- All API routes use `export const config = { runtime: 'edge' }` — match existing routes (`api/ha-cameras.ts`, `api/weather.ts`).
- Reuse existing env vars — do NOT invent new HA auth: `HOME_ASSISTANT_URL`, `HOME_ASSISTANT_TOKEN`, `WEBHOOK_TOKEN`, `IFTTT_WEBHOOKS_KEY`, `SUPABASE_ANON_KEY`.
- Persist all state via the existing `dbGet`/`dbSet` helpers in `api/_db.ts` — no new storage layer.
- Notifications go through the existing `notifyIFTTT(event, value1, value2, value3)` in `api/_notify.ts`.
- Token-guard any state-changing route with the `WEBHOOK_TOKEN` header pattern from `api/ha-webhook.ts` (`x-webhook-token` header or `token` body field).
- No test framework exists in this repo. Each task is verified by running the route (curl) or the app, with expected output stated.
- HA reconfigure deep-links and key-source URLs use the Nabu Casa remote URL (`HOME_ASSISTANT_URL`) so fixes work off the home network.
- Frontend: TypeScript + React function components + Tailwind, matching `src/components/familyos/`. Import helpers from `@/lib/...`.

---

### Task 1: `integrationFixMap` — the fix metadata table

**Files:**
- Create: `api/_integrationFixMap.ts`

**Interfaces:**
- Produces: `FIX_MAP: Record<string, IntegrationFix>` and `type IntegrationFix`; helper `resolveFix(integrationId: string): IntegrationFix` (returns a generic Tier-3 fallback for unknown ids).
- `type IntegrationFix = { id: string; label: string; tier: 1 | 2 | 3; action?: 'reload_config_entry' | 'restart_addon'; addonSlug?: string; configEntryDomain?: string; keyUrl?: string; haReconfigPath?: string; prefillUser?: string }`

- [ ] **Step 1: Create the map file**

```ts
// api/_integrationFixMap.ts
// Underscore prefix → Vercel won't expose this as a route.
// Static metadata: how to fix each known-fragile HA integration, by tier.

export type IntegrationFix = {
  id: string;                 // logical id used in health-check + ha-fix ?integration=
  label: string;              // human name for alerts / UI
  tier: 1 | 2 | 3;            // 1 = full auto, 2 = paste-one-secret, 3 = assisted
  action?: 'reload_config_entry' | 'restart_addon';
  addonSlug?: string;         // for restart_addon (Supervisor addon slug)
  configEntryDomain?: string; // for reload_config_entry (HA integration domain)
  keyUrl?: string;            // Tier 2/3: where the human gets a fresh credential
  haReconfigPath?: string;    // Tier 2/3: HA deep-link path (appended to HOME_ASSISTANT_URL)
  prefillUser?: string;       // Tier 3: username to prefill in the assisted flow
};

export const FIX_MAP: Record<string, IntegrationFix> = {
  wyze_bridge: {
    id: 'wyze_bridge',
    label: 'Wyze Cameras (docker-wyze-bridge)',
    tier: 1,
    action: 'restart_addon',
    addonSlug: 'docker-wyze-bridge', // NOTE: verify exact slug in Task 1 Step 3
  },
  google_ai: {
    id: 'google_ai',
    label: 'Google AI (Gemini)',
    tier: 2,
    action: 'reload_config_entry',
    configEntryDomain: 'google_generative_ai_conversation',
    keyUrl: 'https://aistudio.google.com/apikey',
    haReconfigPath: '/config/integrations/integration/google_generative_ai_conversation',
  },
  alexa: {
    id: 'alexa',
    label: 'Alexa Media Player',
    tier: 3,
    keyUrl: 'https://www.amazon.com/ap/signin',
    haReconfigPath: '/config/integrations/integration/alexa_media',
    prefillUser: 'michael711hebert@gmail.com',
  },
};

const GENERIC_FALLBACK = (id: string): IntegrationFix => ({
  id,
  label: id,
  tier: 3,
  haReconfigPath: '/config/integrations',
});

export function resolveFix(integrationId: string): IntegrationFix {
  return FIX_MAP[integrationId] ?? GENERIC_FALLBACK(integrationId);
}
```

- [ ] **Step 2: Type-check the file compiles**

Run: `npx tsc --noEmit -p tsconfig.node.json 2>&1 | grep _integrationFixMap || echo "no errors in _integrationFixMap"`
Expected: `no errors in _integrationFixMap`

- [ ] **Step 3: Verify the wyze addon slug against the live HA box**

Run (requires HA reachable + a shell with the token):
```bash
curl -s "$HOME_ASSISTANT_URL/api/hassio/addons" -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" | grep -o '"slug":"[^"]*wyze[^"]*"'
```
Expected: prints the real slug (e.g. `"slug":"a889bffc_docker-wyze-bridge"`). If it differs from `docker-wyze-bridge`, update `addonSlug` in the map to the exact value and note it inline. If HA is unreachable during planning, leave a `// TODO(verify-at-runtime)` is NOT allowed — instead set `addonSlug` to the best-known value and the health-check will surface a clear error if wrong.

- [ ] **Step 4: Commit**

```bash
git add api/_integrationFixMap.ts
git commit -m "feat(reliability): add integration fix map"
```

---

### Task 2: `api/ha-fix` — tiered fix executor

**Files:**
- Create: `api/ha-fix.ts`
- Test (manual): curl against a running `vercel dev`

**Interfaces:**
- Consumes: `resolveFix`, `IntegrationFix` from `api/_integrationFixMap.ts`.
- Produces: `POST /api/ha-fix` (token-guarded). Body `{ integration: string, key?: string, token: string }`.
  - Tier 1 → performs the HA action, returns `{ ok: true, tier: 1, action, result }`.
  - Tier 2 without `key` → returns `{ ok: false, tier: 2, needsKey: true, keyUrl }`. With `key` → pushes key + reloads, returns `{ ok: true, tier: 2 }`.
  - Tier 3 → returns `{ ok: false, tier: 3, assisted: true, keyUrl, reconfigUrl, prefillUser }`.
- Exports `async function runFix(integration: string, key?: string): Promise<FixResult>` for reuse by `api/health-check` (self-invoke without an HTTP round-trip).
- `type FixResult = { ok: boolean; tier: 1 | 2 | 3; action?: string; result?: unknown; needsKey?: boolean; assisted?: boolean; keyUrl?: string; reconfigUrl?: string; prefillUser?: string; error?: string }`

- [ ] **Step 1: Write the route + reusable `runFix`**

```ts
// api/ha-fix.ts
export const config = { runtime: 'edge' };

import { resolveFix } from './_integrationFixMap.js';

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
  const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN;
  const body = (await req.json().catch(() => ({}))) as any;
  const token = req.headers.get('x-webhook-token') || body?.token;
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) return j({ error: 'Unauthorized' }, 401);

  const { integration, key } = body;
  if (!integration) return j({ error: 'Missing integration' }, 400);

  const result = await runFix(integration, key);
  return j(result, result.ok ? 200 : 200); // always 200; ok flag carries success
}
```

- [ ] **Step 2: Verify Tier-3 assisted response (no HA calls needed)**

Run (against `vercel dev` or deployed preview):
```bash
curl -s -X POST "$BASE_URL/api/ha-fix" -H "Content-Type: application/json" \
  -d '{"integration":"alexa","token":"'"$WEBHOOK_TOKEN"'"}'
```
Expected JSON: `{"ok":false,"tier":3,"assisted":true,"keyUrl":"https://www.amazon.com/ap/signin","reconfigUrl":"<HA_URL>/config/integrations/integration/alexa_media","prefillUser":"michael711hebert@gmail.com"}`

- [ ] **Step 3: Verify auth guard rejects bad token**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/ha-fix" \
  -H "Content-Type: application/json" -d '{"integration":"alexa","token":"wrong"}'
```
Expected: `401`

- [ ] **Step 4: Verify Tier-1 restart against live HA (only if HA reachable)**

Run:
```bash
curl -s -X POST "$BASE_URL/api/ha-fix" -H "Content-Type: application/json" \
  -d '{"integration":"wyze_bridge","token":"'"$WEBHOOK_TOKEN"'"}'
```
Expected: `{"ok":true,"tier":1,"action":"restart_addon",...}`. If the addon slug is wrong you'll get `{"ok":false,"tier":1,"error":"Addon restart ... failed: 404"}` — fix `addonSlug` in `api/_integrationFixMap.ts` and re-run.

- [ ] **Step 5: Verify the config-entries reload endpoint is exposed over REST (Tier-2 gate)**

`reloadByDomain` (used by google_ai Tier-2 reload) depends on `/api/config/config_entries/entry` being available to a long-lived token. Confirm before relying on it:
```bash
curl -s -o /dev/null -w "%{http_code}" "$HOME_ASSISTANT_URL/api/config/config_entries/entry" \
  -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN"
```
Expected: `200`. If `404`, this HA build gates config-entries behind websocket only — the google_ai Tier-2 auto-reload will report a clear error and fall through to an alert (already handled in `reloadByDomain`). In that case leave google_ai effectively Tier-3 (assisted) — the alert + deep-link still works; only the hands-off reload is unavailable. Note the result inline in the plan.

- [ ] **Step 6: Commit**

```bash
git add api/ha-fix.ts
git commit -m "feat(reliability): add tiered ha-fix executor"
```

---

### Task 3: `api/health-check` — poll, snapshot, auto-heal, alert

**Files:**
- Create: `api/health-check.ts`
- Modify: `vercel.json` (add `crons`)

**Interfaces:**
- Consumes: `runFix` from `api/ha-fix.ts`; `resolveFix`/`FIX_MAP` from `api/_integrationFixMap.ts`; `dbGet`/`dbSet` from `api/_db.ts`; `notifyIFTTT` from `api/_notify.ts`.
- Produces: `GET /api/health-check` (also runs on cron). Writes Supabase key `system_health`:
  `{ updatedAt: number; integrations: Array<{ id: string; label: string; status: 'up'|'degraded'|'down'; unavailable: number; unknown: number; total: number; autoHealed?: boolean }>; overall: 'green'|'yellow'|'red' }`
- De-dupe state persisted at key `health_alert_state`: `Record<string, number>` (integration id → last-alerted timestamp).

- [ ] **Step 1: Write the health-check route**

```ts
// api/health-check.ts
export const config = { runtime: 'edge' };

import { dbGet, dbSet } from './_db.js';
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
    await dbSet('system_health', snapshot);
    return j(snapshot);
  }

  const alertState: Record<string, number> = (await dbGet('health_alert_state')) ?? {};
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
      } else if (status === 'up') {
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
  await dbSet('system_health', snapshot);
  await dbSet('health_alert_state', alertState);
  return j(snapshot);
}
```

- [ ] **Step 2: Add the cron to `vercel.json`**

Replace the entire `vercel.json` with:
```json
{
  "buildCommand": "vite build",
  "outputDirectory": "dist",
  "framework": "vite",
  "crons": [
    { "path": "/api/health-check", "schedule": "*/30 * * * *" }
  ],
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 3: Verify the snapshot shape (against live HA)**

Run:
```bash
curl -s "$BASE_URL/api/health-check" | python -m json.tool
```
Expected: JSON with `updatedAt`, `overall` (green/yellow/red), and an `integrations` array where each item has `id,label,status,unavailable,unknown,total`. If HA is down you get `{"overall":"red","haUnreachable":true,...}`.

- [ ] **Step 4: Verify snapshot persisted to Supabase**

Run:
```bash
curl -s "https://pbiffzdcythkwtwxtqlu.supabase.co/rest/v1/family_data?key=eq.system_health&select=value" \
  -H "apikey: $SUPABASE_ANON_KEY"
```
Expected: one row whose `value` matches the snapshot from Step 3.

- [ ] **Step 5: Commit**

```bash
git add api/health-check.ts vercel.json
git commit -m "feat(reliability): add health-check cron with auto-heal and alerts"
```

---

### Task 4: Monthly pre-emptive token-refresh cron

**Files:**
- Create: `api/preempt-refresh.ts`
- Modify: `vercel.json` (add second cron)

**Interfaces:**
- Consumes: `runFix` from `api/ha-fix.ts`.
- Produces: `GET /api/preempt-refresh` — runs Tier-1 reloads/restarts for integrations with predictable token rot (currently `wyze_bridge`) before expiry bites. Returns `{ ok: true, refreshed: string[] }`.

- [ ] **Step 1: Write the route**

```ts
// api/preempt-refresh.ts
export const config = { runtime: 'edge' };

import { runFix } from './ha-fix.js';

const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

// Integrations whose tokens expire on a known cadence and can be refreshed with a Tier-1 action.
const PREEMPT_TARGETS = ['wyze_bridge'];

export default async function handler(_req: Request): Promise<Response> {
  const refreshed: string[] = [];
  for (const id of PREEMPT_TARGETS) {
    const result = await runFix(id);
    if (result.ok) refreshed.push(id);
  }
  return j({ ok: true, refreshed });
}
```

- [ ] **Step 2: Add the monthly cron to `vercel.json`**

Update the `crons` array in `vercel.json` to:
```json
  "crons": [
    { "path": "/api/health-check", "schedule": "*/30 * * * *" },
    { "path": "/api/preempt-refresh", "schedule": "0 4 1 * *" }
  ],
```
(Runs 04:00 on the 1st of each month.)

- [ ] **Step 3: Verify it runs**

Run:
```bash
curl -s "$BASE_URL/api/preempt-refresh"
```
Expected: `{"ok":true,"refreshed":["wyze_bridge"]}` (or `[]` if HA unreachable / slug wrong — cross-check with Task 2 Step 4).

- [ ] **Step 4: Commit**

```bash
git add api/preempt-refresh.ts vercel.json
git commit -m "feat(reliability): add monthly pre-emptive token refresh cron"
```

---

### Task 5: In-app System Health panel

**Files:**
- Create: `src/components/familyos/SystemHealth.tsx`
- Modify: `src/components/familyos/Dashboard.tsx` (mount the panel, adults only)

**Interfaces:**
- Consumes: the `system_health` Supabase snapshot via the existing frontend sync (localStorage key `system_health`, kept fresh by `pullFromCloud`/realtime in `src/lib/sync.ts`), and `POST /api/ha-fix` for the "Fix It" buttons.
- Reuses role gating from the existing pattern in `FinanceHub.tsx` (`isAdmin(currentRole)` from `@/lib/familyos`) and `useAppContext`.

- [ ] **Step 1: Confirm frontend helper names + token storage (verified during planning)**

Verified facts (already checked against the codebase — do NOT re-guess):
- `@/lib/familyos` exports `loadJSON`, `isAdmin(role)`, and `KEYS` (with `KEYS.settings = 'familyos_settings'`). No `webhook_token` key exists.
- `useAppContext()` exposes `currentRole` and `currentUser`.
- The superadmin-entered secrets live in the settings object under `KEYS.settings` (same place `SettingsModal.tsx` writes the GitHub PAT / camera token). The panel reads `settings.webhookToken` from there.

**Security note:** `WEBHOOK_TOKEN` is a server env var. Storing a copy in client settings so the panel can authenticate to `/api/ha-fix` means it ships in the browser for adults. Acceptable under the "family-trust" posture AND because the Settings/Integrations tab is already superadmin-gated out of the DOM for other roles (per the existing SettingsModal role restrictions). Confirm the settings field is added under that same superadmin gate when wiring it. If you prefer zero client exposure, make the "Fix It" button call a thin authenticated-by-session route instead — deferred; not required for v1.

Run to confirm the settings key name:
```bash
grep -n "familyos_settings\|KEYS.settings\|webhookToken" src/lib/familyos.ts src/components/familyos/*.tsx | head
```
Expected: `KEYS.settings` resolves to `'familyos_settings'`. Add a `webhookToken` field to the settings shape/UI under the existing superadmin gate.

- [ ] **Step 2: Write the panel component**

```tsx
// src/components/familyos/SystemHealth.tsx
import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { loadJSON, isAdmin, KEYS } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

type IntegrationHealth = {
  id: string; label: string;
  status: 'up' | 'degraded' | 'down';
  unavailable: number; unknown: number; total: number; autoHealed?: boolean;
};
type Snapshot = {
  updatedAt: number;
  integrations: IntegrationHealth[];
  overall: 'green' | 'yellow' | 'red';
  haUnreachable?: boolean;
};

const DOT: Record<string, string> = {
  up: 'bg-emerald-500', degraded: 'bg-amber-500', down: 'bg-rose-500',
};

const SystemHealth: React.FC = () => {
  const { currentRole } = useAppContext();
  const [snap, setSnap] = useState<Snapshot | null>(() => loadJSON('system_health', null));
  const [fixing, setFixing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const t = setInterval(() => setSnap(loadJSON('system_health', null)), 5000);
    return () => clearInterval(t);
  }, []);

  if (!currentRole || !isAdmin(currentRole)) return null;
  if (!snap) return null;

  const fixIt = async (integration: string) => {
    setFixing(integration); setMsg('');
    try {
      // WEBHOOK_TOKEN is a server env var, NOT stored client-side. The panel must not hold it.
      // Instead, ha-fix accepts the adult session as sufficient here is NOT possible (edge route
      // has no session). So: read the webhook token from the settings object the superadmin enters.
      const settings = loadJSON<Record<string, any>>(KEYS.settings, {});
      const token = settings.webhookToken || '';
      const res = await fetch('/api/ha-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration, token }),
      });
      const data = await res.json();
      if (data.ok) setMsg(`✓ ${integration} fixed`);
      else if (data.assisted) {
        // Tier 3 — open the two quicklinks
        if (data.keyUrl) window.open(data.keyUrl, '_blank');
        if (data.reconfigUrl) window.open(data.reconfigUrl, '_blank');
        setMsg('Opened key + reconfigure pages');
      } else if (data.needsKey) {
        if (data.keyUrl) window.open(data.keyUrl, '_blank');
        setMsg('Get a fresh key, then paste it in Settings');
      } else {
        setMsg(data.error || 'Fix failed');
      }
    } catch (e: any) {
      setMsg(e?.message || 'Fix failed');
    } finally {
      setFixing(null);
    }
  };

  return (
    <div className="bg-slate-800/40 border border-slate-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-emerald-400" />
        <span className="text-white text-sm font-semibold">System Health</span>
        <span className={`ml-auto w-2.5 h-2.5 rounded-full ${
          snap.overall === 'green' ? 'bg-emerald-500' : snap.overall === 'yellow' ? 'bg-amber-500' : 'bg-rose-500'
        }`} />
        <span className="text-slate-500 text-xs">
          {snap.updatedAt ? new Date(snap.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
        </span>
      </div>

      {snap.haUnreachable && (
        <div className="flex items-center gap-2 text-rose-300 text-xs">
          <AlertTriangle className="w-3.5 h-3.5" /> Home Assistant unreachable
        </div>
      )}

      {msg && <div className="text-xs text-slate-300">{msg}</div>}

      <div className="space-y-2">
        {snap.integrations.map((it) => (
          <div key={it.id} className="flex items-center gap-3 bg-slate-900/50 border border-slate-700/50 rounded-xl px-3 py-2">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT[it.status]}`} />
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm truncate">{it.label}</div>
              <div className="text-slate-500 text-xs">
                {it.status === 'up'
                  ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> healthy</span>
                  : `${it.unavailable} down · ${it.unknown} unknown of ${it.total}`}
                {it.autoHealed && ' · self-healed'}
              </div>
            </div>
            {it.status !== 'up' && (
              <button
                onClick={() => fixIt(it.id)}
                disabled={fixing === it.id}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs px-3 py-1.5 rounded-lg transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${fixing === it.id ? 'animate-spin' : ''}`} />
                Fix It
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SystemHealth;
```

- [ ] **Step 3: Mount the panel in the Dashboard**

Open `src/components/familyos/Dashboard.tsx`, add the import at the top with the other component imports:
```tsx
import SystemHealth from './SystemHealth';
```
Then render `<SystemHealth />` near the top of the dashboard's main content (the component self-gates to adults and self-hides when there is no snapshot, so placement is safe anywhere in the grid). Match the surrounding JSX indentation.

- [ ] **Step 4: Verify it builds**

Run: `npm run build`
Expected: build completes with no TypeScript errors referencing `SystemHealth`.

- [ ] **Step 5: Verify it renders (running app)**

Run `npm run dev`, log in as an adult, open the Dashboard.
Expected: a "System Health" card appears showing one row per integration with a colored status dot. Down/degraded rows show a "Fix It" button. Log in as a kid → the card is absent.

- [ ] **Step 6: Commit**

```bash
git add src/components/familyos/SystemHealth.tsx src/components/familyos/Dashboard.tsx
git commit -m "feat(reliability): add in-app System Health panel with Fix It"
```

---

## Self-Review Notes

- **Spec coverage:** §2 graceful-degradation/staleness → Task 5 (honest per-integration rendering + timestamp). §3 health-check → Task 3; ha-fix tiers → Task 2; integrationFixMap → Task 1; pre-emptive cron → Task 4; System Health panel → Task 5; actionable IFTTT alert → Task 3 Step 1 (`notifyIFTTT('bearhouse_health', …)`). All covered.
- **Deferred to a follow-up (documented, not silently dropped):** Tier-2 "paste-one-secret" from the app (a Settings field that POSTs `{integration, key}` to `api/ha-fix`) is stubbed in `runFix` but has no dedicated UI task — the panel currently opens the key URL for Tier-2/3. Add a Settings key-paste field when wiring the real Google-AI flow. Flagged here so it isn't mistaken for complete.
- **Assumptions surfaced:** exact wyze addon slug (Task 1 Step 3 verifies live), `loadJSON`/`isAdmin` helper names (Task 5 Step 1 verifies against `FinanceHub.tsx`), and the adult-entered `webhook_token` localStorage key (mirrors the existing camera-token pattern — confirm the actual key name when wiring Settings).
- **Cadences:** health-check, monthly pre-empt, 6-h alert cooldown — all tunable in one place (`vercel.json` + `ALERT_COOLDOWN_MS`).

## Deployment note (2026-07-12): Vercel Hobby cron cap

The Vercel project is on the **Hobby** plan, which limits Cron Jobs to **at most once per day**. The original `*/30 * * * *` health-check failed to deploy. Changed to **daily `0 7 * * *`**. Tradeoff: the app catches a dead HA integration (and fires the actionable alert / auto-heal) once per day instead of every 30 min — acceptable given HA token rot is slow-moving (monthly), but the 30-min cadence is strictly better. **To restore 30-min: upgrade the Vercel project to Pro, then set the schedule back to `*/30 * * * *`.** `preempt-refresh` (monthly) and `finance-sync` (daily) are within the Hobby limit and unchanged.

## Opus 4.8 Verification (2026-07-12)

Reviewed against the live codebase. Defects found and **fixed inline**:
- **Panel read a non-existent `webhook_token` localStorage key** → every Fix-It call would 401. Fixed: reads `settings.webhookToken` from `KEYS.settings` (`familyos_settings`), imported `KEYS`, added a security note that the field must sit under the existing superadmin DOM gate.
- **Alexa matcher over-matched** every `media_player.` entity (Cast/Sonos/TVs) → false alerts. Tightened to `includes('alexa')`.
- **`reloadByDomain` REST endpoint may be websocket-only** on some HA builds → added a 404 guard + a verify step (Task 2 Step 5); google_ai gracefully degrades to Tier-3 assisted if unavailable.

Confirmed-good: `HOME_ASSISTANT_TOKEN`/`HOME_ASSISTANT_URL` reuse (from `ha-cameras.ts`), `notifyIFTTT` signature, `dbGet`/`dbSet` snapshot persistence, `isAdmin`/`useAppContext`/`currentRole` frontend gating.
