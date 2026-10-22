# SECURITY FIXES — Agent execution handoff

**Repo:** `bear-house-classic` (FamilyOS)  
**Branch baseline:** `master`  
**Audience:** implementing agent (do not expand scope)  
**Constraint:** surgical diffs, existing patterns, tests required, no Tailwind 4 force-upgrade  

Related plan id (Warp): security audit fix handoff. Implement only after human approval of that plan.

---

## 0. Rules for the executor

1. Read this file fully before editing.
2. Work **one work package (WP) at a time**. Run the listed tests after each WP.
3. Prefer **delegation / denylist / small helpers** over rewriting call sites.
4. Do **not** commit unless the human asks. If committing: end message with `Co-Authored-By: Warp <agent@warp.dev>`.
5. Do **not** print or commit secrets from `.env.local` / `.env.production.local`.
6. Do **not** run `npm audit fix --force` (breaks Tailwind 3).
7. Match Edge runtime style: pure `fetch`, no Node-only APIs unless file already uses them.
8. Reuse `timingSafeEqual` / `sha256Hex` from `api/_googleHome.ts` **or** move them to a tiny shared `api/_secureCompare.ts` if importing `_googleHome` would pull unwanted deps — keep it minimal.
9. After all WPs: `npm test` and `npm run typecheck`.

### Validation commands

```bash
npm test -- api/data-write.test.ts api/_db.test.ts api/_familyAuth.test.ts
npm test -- api/webhook.test.ts api/ha-webhook.test.ts api/voice-trigger.test.ts api/voice-triggers.test.ts api/weather.ts 2>nul
# Prefer existing test files; add tests where missing rather than skipping.
npm run typecheck
npm audit --omit=dev
```

---

## 1. Current architecture (do not re-derive incorrectly)

| Layer | Fact |
|--------|------|
| Frontend | Vite/React; Supabase session JWT via `Authorization: Bearer` |
| Writes | `api/data-write.ts` + `SUPABASE_SERVICE_KEY`; client must not supply trusted `householdId` |
| Tenant isolation | Application-enforced `household_id` after token → membership resolve |
| Dual resolvers | `_db.resolveHouseholdId` = first row; `_familyAuth.resolveHouseholdId` = family-aware |
| Rate limit | `family_data` key `ratelimit_${endpoint}` via `api/_rateLimit.ts` |
| Webhook auth | Plaintext `households.webhook_token`; header **or** body `token` |
| Voice webhook | Plaintext `households.voice_trigger_token`; rotate in `api/voice-triggers.ts` |
| Google Home | Already hashed tokens + `timingSafeEqual` in `api/_googleHome.ts` |
| CORS | `middleware.ts` matcher `/api/:path*` |
| CSP/HSTS | `vercel.json` headers for non-API static only |

---

## 2. Work packages (priority order)

---

### WP0 — Block client writes to server-managed `family_data` keys (P0)

**Why:** Authenticated clients can overwrite `ratelimit_*` via `data-write`, neutralizing cost controls.

**Files**
- `api/data-write.ts`
- `api/data-write.test.ts`

**Change**
1. Extend `SERVER_MANAGED_KEY_PREFIXES` (or rename to denylist) to include at least:
   - `ratelimit_`
   - Consider also blocking accidental clobbers of: `system_health`, `health_alert_state` if those are only server-written (confirm only server writers in `api/health-check.ts` before blocking; if UI never writes them, block).
2. Keep existing prefixes:
   - `simplefin_access_`
   - `familyos_expenses_`
   - `familyos_bills_`
   - `merchant_category_cache_`
3. Rejection remains **403** with existing message style.

**Tests** (add to `data-write.test.ts`)
- `ratelimit_chat` → 403, no `fetch` write.
- Existing simplefin test still passes.

**Out of scope for WP0:** moving rate limits off Postgres (nice later, not required).

---

### WP1 — Single household resolver path (P0)

**Why:** Coparent / multi-membership users hit first-row-wins on almost every route importing `_db`.

**Files**
- `api/_db.ts` — `resolveHouseholdId`, `resolveCallerMember` only
- `api/_db.test.ts`
- `api/_familyAuth.ts` / `api/_familyAuth.test.ts` (only if behavior bugs found)
- Do **not** mass-edit every route import.

**Change (preferred surgical approach)**
1. In `api/_db.ts`, make `resolveHouseholdId` and `resolveCallerMember` **delegate** to the implementations in `api/_familyAuth.ts` (re-export or thin wrappers with the same signatures).
2. Preserve `_db` export names so existing `import { resolveHouseholdId } from './_db.js'` keeps working.
3. Avoid circular imports: `_familyAuth.ts` must **not** import `_db.ts`. Today it does not — keep it that way. `_db.ts` may import `_familyAuth.ts`.
4. Optional second arg `preferredHouseholdId?: string` should flow through wrappers for future header support; existing one-arg callers unchanged.
5. Fix single-mode edge in `_familyAuth` if needed: for `mode === 'single'`, prefer the only household; if multiple memberships without family links, keep current null-safe behavior.
6. **Do not** delete `soleHouseholdId` in this WP unless you confirm zero production callers (definition + tests only today). Leave deprecated.

**Tests**
- Update `_db.test.ts` mocks: either mock `_familyAuth` or integration-style mock `fetch` sequences matching family-aware path.
- Ensure `_familyAuth.test.ts` still green.
- Add/adjust one case: two membership rows → returns **primary** (via `household_family_link.role_in_family`), not arbitrary first row.

**Follow-up (same WP only if trivial):** document optional `x-household-id` header for preferred household — implement only if a client already sends it; otherwise leave a short code comment on the wrapper, no new protocol.

---

### WP2 — CORS allowlist tightening (P1)

**Files**
- `middleware.ts`
- Add `middleware.test.ts` **only if** the repo already tests middleware easily; else manual checklist in PR notes.

**Change**
1. Keep exact origins:
   - `https://hotmessexpress.lol`
   - `https://www.hotmessexpress.lol`
   - `https://localhost` (Capacitor)
2. **Remove** blanket `hostname.endsWith('.vercel.app')`.
3. Replace with one of:
   - **Preferred:** `process.env.CORS_ALLOWED_ORIGINS` comma-separated extra origins (preview URLs), merged into the Set at runtime; empty = no extras.
   - **Or** allow only a specific known preview host pattern you can confirm from project docs (do not guess team-wide Vercel).
4. Preserve `Vary: Origin` and preflight header list (`Authorization`, `x-webhook-token`, `x-write-secret`).

**Ops note (document in handoff comment / PR body, not secrets):** set `CORS_ALLOWED_ORIGINS` on Vercel previews that must call production API.

---

### WP3 — Webhook / voice token transport hardening (P1, before hash migration)

**Files**
- `api/webhook.ts`
- `api/ha-webhook.ts`
- `api/secretary.ts`
- `api/weather.ts` (query `token`)
- Any other route taking `rawBody?.token` **or** `x-webhook-token` for household webhook auth (search: `x-webhook-token`, `resolveHouseholdIdByWebhookToken`). Known: `briefing.ts`, `calendar-sync.ts`, `finance.ts`, `health-check.ts` (special), etc. Fix **household webhook** callers consistently.
- Matching `*.test.ts`

**Change**
1. **Accept webhook token only from `x-webhook-token` header** (not JSON body, not query string).
2. `weather.ts`: remove `token` query param path; require Bearer **or** `x-webhook-token` only.
3. Update schemas in `api/_schemas.ts` if they require body `token` for webhook-authenticated routes — make `token` optional/removed; auth from header only.
4. Update tests that posted `token` in body.
5. `health-check.ts`: leave cron `CRON_SECRET` behavior; if it compares global `WEBHOOK_TOKEN` env, keep that path but do not reintroduce query tokens. Prefer header-only for webhook caller branch.

**Settings copy**
- `src/components/familyos/SettingsModal.tsx` (~681): stop saying env `WEBHOOK_TOKEN`; say household webhook token via `x-webhook-token` header (token value comes from admin rotate UI in WP4).

---

### WP4 — Hash webhook + voice tokens at rest (P1, phased)

Model after `api/_googleHome.ts` (`sha256Hex`, store hash, compare hash).

#### 4a. Migration

**New file:** `supabase/migrations/YYYYMMDDHHMMSS_hash_integration_tokens.sql` (timestamp after latest migration).

```sql
-- Pseudocode intent (write real SQL carefully):
alter table public.households
  add column if not exists webhook_token_hash text unique,
  add column if not exists voice_trigger_token_hash text unique;

-- Backfill hashes from existing plaintext where present (pg crypto or app-side backfill).
-- Prefer app/edge one-shot only if SQL sha256 is awkward; document one-time script.
-- After deploy of dual-read code and verified traffic:
--   update households set webhook_token = null, voice_trigger_token = null;
-- revoke select (webhook_token) on public.households from anon, authenticated;
-- grant select (webhook_token) ... service_role only;  -- mirror voice_trigger_token migration 20261002120000
-- Optionally drop plaintext columns in a LATER migration after rotate-all.
```

**Executor rules**
- First deploy: **dual-write** hash + keep plaintext until backfill verified.
- Lookup: `where webhook_token_hash = eq.<sha256(token)>` OR (legacy) plaintext equality if hash null.
- After backfill: stop writing plaintext; null plaintext; revoke SELECT on `webhook_token` like voice.
- Do not break existing IFTTT/HA tokens: hashing is deterministic SHA-256 of the raw token string (UTF-8), same as Google Home.

#### 4b. DB helpers

**Files:** `api/_db.ts`, `api/_db.test.ts`

- `resolveHouseholdIdByWebhookToken(token)` → hash input, query `webhook_token_hash`; legacy fallback plaintext if needed during transition.
- `resolveHouseholdIdByVoiceTriggerToken` → same for voice.
- `dbSetHouseholdVoiceToken` → store **hash only** (or dual-write during transition); never return hash as if it were the raw token.
- Add `dbSetHouseholdWebhookToken` / `dbGetHouseholdWebhookTokenMeta` (`hasToken: boolean` only).

#### 4c. Rotate APIs

**Voice:** `api/voice-triggers.ts` `rotateToken` already generates 32 random bytes hex — keep returning **raw token once** to client; persist hash only.

**Webhook (missing today):** add rotate action on an existing admin settings route **or** small `api/webhook-token.ts`:
- Auth: Bearer + `resolveCallerMember` from family-aware path
- Role: `admin` | `superadmin` only
- Rate limit key e.g. `webhook-token-rotate`
- Returns `{ ok: true, token: "<raw once>" }`; stores hash

Wire Settings UI to call rotate and show token once (Integrations → Webhooks). Replace stale `WEBHOOK_TOKEN` env instructions.

#### 4d. Tests
- Resolver: known raw token → household id; wrong token → null.
- Rotate: raw returned once; subsequent resolve works; DB row has hash not raw (assert mock PATCH body).

---

### WP5 — Voice unlock hardening (P2)

**Files:** `api/voice-unlock.ts`, add/extend tests

**Change**
1. Resolve caller via `resolveCallerMember` (family-aware via WP1 wrappers).
2. Allow redeem only if `role === 'admin' || role === 'superadmin'`.
3. Compare codes with `timingSafeEqual` (pad/length-check carefully — unequal lengths must return false without throwing).
4. Normalize input the same way as stored list (`trim`).
5. **Single-use codes (optional in this WP):** if too large, skip DB table; document as follow-up. Minimum bar: admin-only + timing-safe.

---

### WP6 — Crypto / pin_hash / PII cleanups (P2)

| Item | File | Fix |
|------|------|-----|
| ENCRYPTION_KEY length | `api/_crypto.ts` | After `atob`, require `keyBytes.byteLength === 32` or throw clear error |
| Tests | `api/_crypto.test.ts` | Invalid length throws |
| `pin_hash` | `api/_db.ts` `dbGetHouseholdMemberById` / `ByHouseholdId` | Remove `pin_hash` from `select` and return types **unless** a PIN-verify caller needs it — grep callers first; if needed, add a dedicated `dbGetMemberPinHash(id)` used only there |
| NWS User-Agent | `api/weather.ts` | Replace personal email with generic product contact, e.g. `BearHouseOS/1.0 (https://www.hotmessexpress.lol; support@hotmessexpress.lol)` or similar non-personal address already used publicly |
| Hardcoded Supabase URL | multiple api files | **Optional / low priority:** introduce `const SUPABASE_URL = process.env.SUPABASE_URL \|\| 'https://zjialvdolbkccduuwsck.supabase.co'` in `_db` only and import — only if zero behavior change; do not boil ocean |

---

### WP7 — npm production audit without Tailwind 4 (P2)

**Files:** `package.json` (and lockfile via `npm install`)

**Change**
```json
"overrides": {
  "braces": "^3.0.3",
  "postcss-selector-parser": "^7.1.0"
}
```
(Use versions that actually clear `npm audit --omit=dev` without major upgrades. Re-run audit; adjust pins. **Do not** `audit fix --force`.)

`tailwindcss-animate` (prod) → `tailwindcss` → `braces` is the chain observed.

---

### WP8 — Headers / CSP sanity (P2, minimal)

**Files:** `vercel.json`

**Change only if clearly wrong after reading current CSP**
- Static CSP already sets `frame-ancestors 'none'`, HSTS, etc.
- Confirm app is same-origin to API (`www.hotmessexpress.lol`) so `connect-src 'self'` + Supabase is enough for browser API calls.
- If Google Identity script is loaded from `accounts.google.com` / `apis.google.com` and production relies on it, CSP `script-src 'self'` may already be incomplete — **do not invent domains**; verify `index.html` / script tags first, then add minimal host allowlist.
- Remove or justify static `Access-Control-Allow-Origin: https://www.hotmessexpress.lol` on all non-API assets if it confuses caching; API CORS remains middleware’s job.
- Do **not** attach full CSP to `/api/*` unless you have a concrete need (JSON APIs gain little).

---

### WP9 — Firebase client key ops note (P2, no code required unless easy)

**File:** `android/app/google-services.json` (tracked; expected)

**Action:** In PR notes, remind human to restrict Firebase/Google API key by Android package + SHA in Google Cloud Console. Do not delete the file.

---

## 3. Explicit non-goals

- Replacing service_role with per-request RLS user JWT for all writes.
- Full Redis/Upstash rate limiter platform.
- Making `DATA_WRITE_SECRET` a real secret (it is public via `VITE_DATA_WRITE_SECRET`); optional removal is out of scope unless trivial.
- Rewriting Hermes prompt-injection defenses beyond existing `src/lib/promptSafety.ts`.
- Live production secret rotation (human ops).
- Deleting `marked` / markdown stack that is not present as XSS sink in current grep (`dangerouslySetInnerHTML` only noted in `chart.tsx`).

---

## 4. Suggested commit sequence (if human requests commits)

1. `fix(security): denylist ratelimit keys on data-write`
2. `fix(security): delegate household resolvers to family-aware auth`
3. `fix(security): tighten API CORS allowlist`
4. `fix(security): header-only webhook tokens`
5. `fix(security): hash webhook and voice trigger tokens`
6. `fix(security): harden voice unlock and crypto key checks`
7. `chore(security): npm overrides for audit highs`

---

## 5. Acceptance checklist

- [ ] `data-write` rejects `ratelimit_*` (test)
- [ ] Dual-membership resolve returns primary, not first row (test)
- [ ] CORS rejects random `https://evil.vercel.app` Origin (logic test or documented manual)
- [ ] Webhook body `token` no longer authorizes (test)
- [ ] Weather query `token` no longer authorizes (test)
- [ ] Voice/webhook rotate stores hash; raw shown once
- [ ] `webhook_token` column not selectable by authenticated role (migration)
- [ ] Voice unlock admin-only
- [ ] ENCRYPTION_KEY wrong length fails fast
- [ ] `pin_hash` not on generic member DTOs
- [ ] `npm audit --omit=dev` improved without Tailwind 4
- [ ] `npm test` + `npm run typecheck` clean
- [ ] Settings UI no longer documents env `WEBHOOK_TOKEN` as the household secret

---

## 6. Ops follow-ups (human, not agent)

1. Set Vercel `CORS_ALLOWED_ORIGINS` for needed previews.
2. After hash migration: rotate household webhook tokens in IFTTT/HA/Tasker.
3. Confirm `ENCRYPTION_KEY` is 32 bytes base64.
4. Restrict Firebase Android API key by package/SHA.
5. Apply Supabase migrations to hosted project in order.

---

## 7. Quick file index

| Path | Role |
|------|------|
| `api/data-write.ts` | Client write gateway + key denylist |
| `api/_rateLimit.ts` | `ratelimit_` keys |
| `api/_db.ts` | service_role helpers + legacy resolvers |
| `api/_familyAuth.ts` | family-aware resolvers |
| `middleware.ts` | API CORS |
| `api/webhook.ts` / `ha-webhook.ts` / `secretary.ts` | webhook entry |
| `api/voice-trigger.ts` / `voice-triggers.ts` | voice token consume/rotate |
| `api/_googleHome.ts` | reference crypto patterns |
| `api/_crypto.ts` | AES-GCM BYO keys |
| `api/voice-unlock.ts` | premium voice codes |
| `api/weather.ts` | NWS + auth |
| `src/components/familyos/SettingsModal.tsx` | integrations docs/UI |
| `vercel.json` | CSP/HSTS |
| `supabase/migrations/*` | RLS + columns |
| `package.json` | overrides |

---

*End of handoff. Implement WP0 → WP7 in order unless human reprioritizes.*
