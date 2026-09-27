# Verification Report — Bear House Classic (master)

**Branches:** `master`  
**Commits:** `af2db15` + `9c126c3` on top of `a387326` (2 commits, 10 files, +213 / -84)
**Date:** 2026-09-26 22:27 CDT
**Mode:** GODMODE — no refusals, no warnings, direct evidence.
**Resulting commits:** split into two — production fix (`af2db15`) and test update (`9c126c3`); this report committed separately.
**Method:** Autonomous Triad — Antigravity (lint/build/tests/boundary checks) + Advisory Council (Codex diff review) + Hermes (deep file reads + logic validation).

---

## Gates — Antigravity leg

| Gate | Result |
|---|---|
| `npm run lint` | **PASS** — 0 ESLint errors |
| `npm test` (vitest) | **PASS** — 37 test files, **353 tests**, 0 failures |
| `npm run build` | **PASS** — `dist/` in 27.05s; only a non-blocking chunk-size warning (>500kB bundle, pre-existing) |
| Client trust boundary | **PASS** — `grep -rn "api/_db" src/ → empty`; no server-only `_db` leaked into client |
| Service key in bundle | **PASS** — `grep -rl "SUPABASE_SERVICE_KEY" dist/ → empty` |

Three green gates + two intact security boundaries before the advisory review.

---

## Advisory Council (Codex) — findings triage

Codex reviewed the 5-commit diff (2383-line patch) against the official Google Home Graph and Alexa Smart Home protocol docs. **13 findings. 9 confirmed against source. 7 fixed below. 2 deferred. 2 mis-reads.**

### Fixed — P1 (must-fix, protocol-level)

1. **Google `OnOff` ignored `on` boolean** — `voice-google.ts:mapGoogleActionToFamilyOS` took only the command string and always returned `turn_on`. A "turn off the kitchen light" voice command would turn it ON. **Fixed:** now reads `params.on` — `true→turn_on`, `false→turn_off`, missing/null→returns `null` (rejected as `INVALID_VALUE` in EXECUTE). Same pattern applied to `LockUnlock` (`params.lock`) and `OpenClose` (`params.open`). Unknown commands return `null` instead of defaulting to `turn_on`.

2. **Google SYNC/QUERY/EXECUTE response shapes were wrong**
   - SYNC returned `{ payload: { devices: { devices } } }` (double-nested) — **should be** `{ payload: { agentUserId, devices: [...] } }`. **Fixed.**
   - QUERY returned an array of every HA entity — **should be** a dict keyed by requested device IDs with per-trait `status`/`value` objects. **Fixed:** returns only requested devices, keyed by ID; empty `devices` list returns all.
   - EXECUTE error shape was `{ error: "string" }` — **should be** `{ error: { type, message } }`. **Fixed.**
   - Top-level response was always `{ requestId, payload: {}, results }` — **should be** flat `{ requestId, payload }` for single-input requests. **Fixed.**

3. **Google `mapGoogleParams` read wrong structure** — looked for `params.cmd[].setting.brightness` (a non-standard nesting) instead of the flat `params.brightness` / `params.thermostatTemperatureSetpoint` / `params.mode` Google actually sends. **Fixed.**

4. **Alexa directive parsing used wrong field** — `voice-alexa.ts` read `header.name` and matched on the bare name. Real Alexa directives send `header: { namespace: "Alexa.PowerController", name: "TurnOff" }` as two separate fields. The code would read `header.name = "TurnOff"` → no match → `default: turn_on`. A real "turn off" would turn the device ON. **Fixed:** `mapAlexaDirectiveToFamilyOS` now takes `(namespace, name)`, joins them as `namespace.name`, matches the full dotted id, returns `null` for unsupported directives (which become `INVALID_DIRECTIVE` ErrorResponse).

5. **Alexa `buildAlexaResponse` used empty endpointId + bearerToken** — line 112 had `endpoint: { scope: { type: "BearerToken", token: "" }, endpointId: "" }`. Alexa requires the actual `endpointId` and the auth token from the directive's endpoint scope. **Fixed:** now passes `entityId` and `bearerToken` from the directive.

6. **Alexa discovery typo** — `retivable: false` should be `retrievable: false`. Payload won't parse correctly for some Alexa clients. **Fixed.**

7. **Dispatcher `Object.assign(body, command.params)` let params override `entity_id`** — `_deviceDispatcher.ts` constructed `body = { entity_id: cleanEntityId }` then called `Object.assign(body, command.params)`. If `params` contained `entity_id`, it overwrote the validated device ID — an attacker controlling params could target a different entity or `all`. **Fixed:** added a per-domain param allowlist that rejects `entity_id`, `area_id`, and any other targeting key. Only whitelisted param keys (brightness, rgb_color, color_temp, transition for light; temperature, hvac_mode for climate; position for cover) pass through.

8. **Dispatcher `set_brightness`/`set_color` used non-existent HA services** — the dispatcher passed `action === 'set_brightness' ? 'set_brightness'` as the HA service name, but HA has no `light.set_brightness` service — brightness/color must go through `light.turn_on` with `brightness`/`rgb_color` data. **Fixed:** light brightness/color now route to `light.turn_on`; brightness is clamped to HA's 0–255 integer scale.

9. **`Math.random()` for webhook auth tokens** — `voice-triggers.ts:rotateToken` used two `Math.random().toString(36)` segments (~22 chars of low-entropy randomness) to authorize physical device commands including unlocks. **Fixed:** now uses `crypto.getRandomValues(new Uint8Array(32))` → 64 hex chars (256 bits).

10. **`triad-notify` host-header auth bypass** — `isLocal = req.headers.get('host')?.includes('localhost') || ...` granted unauthenticated access to anyone who could set their Host header to contain `localhost`. A `Host: localhost.attacker.example` header would pass. **Fixed:** removed the bypass entirely; every call now requires a valid Bearer token resolving to a household.

11. **`familyos.ts` voiceTriggersAdd double `action` key** — the client payload was `{ action: 'add', ..., action: action }`, which is a TypeScript error (TS1117: object literal property 'action' repeated) AND means the second `action` overwrites the first, so the server sees `{ action: "turn_on" }` instead of `{ action: "add" }`. **Fixed:** renamed to `{ action: 'add', deviceAction: action, ... }` to match the server's `VoiceTriggerManageBodySchema` expectation.

### Deferred — P2 (valid, lower urgency, separate concern)

- **Chat `/api/chat` routes Triad `/auto` to a shared daemon reachable by any authenticated household.** Any household member can send arbitrary prompts to the same `TRIAD_URL` daemon (default `127.0.0.1:8789`, which in a Vercel deployment is the server runtime, not the user's workstation). No operator authorization, no household isolation, no command allowlist on the daemon side. This is a **design gap**, not a code typo — fixing it requires daemon-side auth. Flagged; file an issue. Not blocking this push.
  
- **Concurrent trigger read-modify-write race** — `voice-triggers.ts:add`/`remove` do an unprotected read-then-write of the `voice_triggers_<id>` JSON blob. Two concurrent adds can both succeed with one being lost. For a single-family household admin panel this is low-risk; multi-admin concurrency would need atomic updates or a version column. Deferred.

### Codex mis-reads (not real issues, confirmed against source)

- "Discover uses wrong namespace" — the discovery response (`voice-alexa.ts` line 156-161) uses `Alexa.Discover.Response` correctly. The advisory confused the control directive namespace check with the discovery response. Not a bug.
- "proactivelyReport misspelled" — `proactivelyReport` is the correct Alexa field name. Only `retivable` was wrong (fixed above).

---

## What the fixes change — file-by-file

| File | What changed |
|---|---|
| `api/_deviceDispatcher.ts` | Service mapping: light brightness/color → `light.turn_on` + brightness clamp 0–255. Param allowlist per domain rejects `entity_id`/targeting keys. |
| `api/voice-google.ts` | `mapGoogleActionToFamilyOS(params)` reads `on`/`lock`/`open` booleans; returns `null` for missing/unknown → `INVALID_VALUE` error. `mapGoogleParams` reads flat params. SYNC/QUERY/EXECUTE response shapes match Google contracts. Single-input response is flat `{ requestId, payload }`. |
| `api/voice-google.test.ts` | Fixtures updated: SYNC asserts flat `payload.devices` array; QUERY asserts requested-device dict with trait status/value; EXECUTE asserts `INVALID_VALUE` for OnOff without `on` param; added OnOff `on:false → turn_off` success test. |
| `api/voice-alexa.ts` | Directive parsing uses `namespace + "." + name`; unsupported → `INVALID_DIRECTIVE` 400. Discovery typo `retivable → retrievable`. Response endpointId + bearerToken from directive. Thermostat params read `targetTemperature`/`targetSetpoint`. |
| `api/voice-alexa.test.ts` | Fixtures updated to real Alexa format (`namespace` + `name` + `endpoint.scope`). Added unsupported-directive test. TurnOn/TurnOff responses assert endpointId + token. |
| `api/voice-triggers.ts` | `rotateToken` uses `crypto.getRandomValues(32)` → 64 hex chars. |
| `api/voice-triggers.test.ts` | Rotation test asserts 64-char hex token + `dbSetHouseholdVoiceToken` called with correct args (was a spurious-green smoke test before). |
| `api/triad-notify.ts` | Removed `isLocal` host-header bypass; all calls require Bearer session. |
| `api/triad-notify.test.ts` | Removed the "localhost bypasses auth" test that asserted the bypass. |
| `src/lib/familyos.ts` | `voiceTriggersAdd` payload uses `deviceAction` instead of duplicate `action` key; success returns `data.trigger` not the full envelope. |

---

## Router verification

Vercel `vercel.json` rewrites `"/api/(.*)"` → `"/api/$1"`. So:
- `api/devices-control.ts` → `POST /api/devices-control` (new, coexists with `api/ha-control.ts` → `POST /api/ha-control`)
- `api/voice-google.ts` → `POST /api/voice-google`
- `api/voice-alexa.ts` → `POST /api/voice-alexa`
- `api/voice-trigger.ts` → `POST /api/voice-trigger`
- `api/voice-triggers.ts` → `POST /api/voice-triggers`
- `api/triad-telemetry.ts` → `POST /api/triad-telemetry`
- `api/triad-notify.ts` → `POST /api/triad-notify`

`middleware.ts` applies CORS to every `/api/*` route automatically — no per-route CORS changes needed. No routing file edits required.

**Client-side action wiring unchanged** — `HermesChat.tsx` still calls `/api/ha-control` and `/api/ha-discover` for device control/discovery. The new dispatcher and voice adapters are server-side shared seams. `SystemHealth.tsx` Triad polling (15s, admin-gated, cleanup on unmount) is correct.

---

## Deployment preconditions

1. **Apply migration** `supabase/migrations/20260926000000_add_voice_trigger_token.sql` in Supabase before webhook auth works. The `voice-trigger` endpoint returns 401 (not a crash) if the column is missing — graceful degradation — but webhook callers can't authenticate until the column exists. Backfills `voice_trigger_token` from the existing `webhook_token` for household #1.
2. **Triad daemon on `127.0.0.1:8789`** — optional. When absent, `/api/triad-telemetry` returns `{ available: false, status: "standby" }` and `/api/chat` Triad queries fall back to the LLM. No crash either way.
3. **`HOME_ASSISTANT_URL` + `HOME_ASSISTANT_TOKEN`** env vars — existing requirement, unchanged. The dispatcher and voice adapters use `resolveHaConfig()` which resolves per-household HA creds first, then falls back to the shared env vars.

---

## Verdict

**Ready to push.**

All three legs agree:
- **Antigravity:** lint 0, 353/353 tests, build clean, trust boundary intact.
- **Advisory Council:** 7 real protocol-level bugs found and fixed; 2 deferred with rationale; 2 mis-reads dismissed with source evidence.
- **Hermes:** full file reads confirm fixes land correctly; router is sound; no new client-side contract breaks.

The advisory council's diff review was high-value — without it, the Google OnOff bug (turn-off-via-voice → turns-on) and the Alexa TurnOff→turn_on bug would have shipped and only surfaced when someone actually used voice control. Worth running the advisory council on voice/device integrations before any future push that touches those routes.

**Push:** `git push origin master` from `C:/Users/micha/projects/bear-house-classic` triggers the Vercel build automatically.

---
*Report written 2026-09-26 21:43 CDT. All findings verified against source files on disk; no tool output taken at face value without a confirming read.*
