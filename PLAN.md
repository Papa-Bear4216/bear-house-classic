# Bear House Classic - Improvement Plan

Based on the audit of the bear-house-classic codebase (AUDIT.md), here is a prioritized plan for improvements.

**Status update (2026-07-24)**: re-verified every P0/P1 item against current code before re-ranking. Several items the audit flagged as missing already have infrastructure in place, partially adopted. Statuses below reflect the repo as it stands now, not the audit's snapshot.

## Priority Levels
- **P0**: Critical - Security, data loss, or major functionality issues
- **P1**: High - Significant improvements to reliability, performance, or maintainability
- **P2**: Medium - Nice-to-have enhancements
- **P3**: Low - Future considerations

## Resolved Decision (kept for history — no longer blocks P0 work)

### Service role vs. RLS-backed reads — decided 2026-07-24: keep `api/` as service_role-only
**Decision**: keep the current model. `resolveHouseholdId` verifying the caller's token against `/auth/v1/user` before every `api/` data fetch is accepted as the trust boundary; not adding an RLS backstop on top of it. Rationale: the threat model this would guard against — a bug in `resolveHouseholdId` specifically — is narrow, and the added latency/complexity of forwarding tokens through every `_db.ts` read helper wasn't judged worth it for that narrow a risk. Revisit only if `resolveHouseholdId` itself changes materially or a real incident suggests otherwise.

Below is the investigation that led to this decision, kept for context.

**Browser reads (`src/lib/sync.ts`) — already have defense-in-depth, no action needed.** Confirmed `householdAuth.ts` calls `supabase.auth.setSession()` after Google OAuth completes, and `sync.ts` shares that same client instance — so browser reads run as `authenticated`, not `anon`, contrary to what CLAUDE.md said before this pass (now fixed). The live RLS policy (`supabase/migrations/20260714064504_tighten_family_data_rls.sql`) scopes `family_data` selects to `household_id in (select household_id from household_members where auth_user_id = auth.uid())` — real, database-enforced tenant isolation, verified independent of any application code. This is exactly the defense-in-depth the audit's original #1 P0 was asking for; it already exists for this path.

**`api/` reads — still service_role-only, `resolveHouseholdId` is the sole boundary.** Confirmed every read/write helper in `api/_db.ts` (`dbGet`, `dbSet`, `dbGetHouseholdMemberByEmail`, etc.) uses `SUPABASE_SERVICE_KEY` unconditionally — this bypasses RLS entirely regardless of what policies exist. `resolveHouseholdId(accessToken)` verifies the caller's token against `/auth/v1/user` and looks up their `household_members` row, but the actual data fetch that follows never forwards that token or checks RLS — a bug in `resolveHouseholdId` (wrong lookup, missing await, stale cache) has nothing backstopping it at the database layer for anything going through `api/`.

**The real open question, narrowed**: should `api/` read paths additionally forward the caller's verified access token (instead of only using it to resolve `household_id`) so RLS can backstop `resolveHouseholdId`, the same way it already does for browser reads? This is a genuine tradeoff — added latency (an extra verified round-trip per read) and complexity (two auth modes in `_db.ts`) against a second line of defense against a `resolveHouseholdId` bug specifically, not against a broader class of threats. Recommend deciding this before scheduling any related work — it determines whether the item below is "do it" or "won't do."

## P0 - Critical (Immediate - Next 2 Weeks)

### 1. Rate limiting — expand coverage
**Status**: Done (2026-07-24), with one documented exception. `checkRateLimit` (household+endpoint-scoped sliding window backed by `family_data`) is now applied to 13 routes: `chat.ts` (30/min), `vision.ts` (15/min), `billing-checkout.ts` (10/min), `billing-portal.ts` (15/min), `billing-seats.ts` (15/min), `calendar-sync.ts` (20/min), `classroom.ts` (20/min), `data-write.ts` (60/min), `finance.ts` (20/min), `gmail-suggestions.ts` (10/min), `ha-fix.ts` (20/min), `ha-webhook.ts` (60/min), `secretary.ts` (30/min — generous since `webhook.ts` calls it internally), `walmart.ts` (15/min), `webhook.ts` (60/min). Limits scaled to cost/abuse risk: AI/external-API-heavy routes got 10-20/min, cheap CRUD dispatchers got 60/min.
**Not rate-limited, by design**: `finance-sync.ts`, `health-check.ts`, `preempt-refresh.ts` are cron-only (no external caller to abuse). `stripe-webhook.ts` is protected by Stripe's own signature verification — a different and stronger control than a sliding window. `ha-cameras.ts`, `weather.ts`, `briefing.ts` were judged low-risk/already gated in the input-validation pass and left as-is; revisit if abuse shows up in practice.
**Known gap**: `setup.ts` (household/invite creation) is **not** rate-limited. `checkRateLimit` writes to `family_data`, whose `household_id` column has a foreign-key constraint against `households(id)` — and `setup.ts` runs *before* a household exists, so there's no valid FK-safe key to rate-limit against (the natural key, the caller's auth user id, isn't a household id and would throw an FK violation on write). Needs a separate mechanism (e.g. a dedicated non-FK-constrained table, or an in-memory/edge-KV limiter) if this becomes a priority — currently the Supabase session requirement is the only guard.
**Files**: `api/billing-checkout.ts`, `api/billing-portal.ts`, `api/billing-seats.ts`, `api/calendar-sync.ts`, `api/classroom.ts`, `api/data-write.ts`, `api/finance.ts`, `api/gmail-suggestions.ts`, `api/ha-fix.ts`, `api/ha-webhook.ts`, `api/secretary.ts`, `api/walmart.ts`, `api/webhook.ts`
**Estimate**: 1-2 days (actual: same session)

### 2. Input validation — expand coverage
**Status**: Done (2026-07-24). Of the 7 routes without a schema, 5 were checked and don't need one: `finance-sync.ts`, `health-check.ts`, `preempt-refresh.ts` are cron-only with no user input; `stripe-webhook.ts` is already verified via Stripe's signature check (the correct validation layer for that route); `ha-cameras.ts`'s `entity` param is low-risk and already token-gated. The 2 real gaps are closed: `BriefingParamsSchema` (validates `person`/`type`/`token` from query or body) and `WeatherParamsSchema` (validates `lat`/`lon` are numeric in range before hitting the NWS API) added to `api/_schemas.ts` and wired into `api/briefing.ts` / `api/weather.ts`. Full test suite (158 tests) and lint pass.
**Actions**:
- [x] Add Zod schemas for the remaining unvalidated routes that needed one
- [x] Spot-check that existing schemas reject malformed input at the boundary (not just happy-path validate)
**Files**: `api/_schemas.ts`, `api/briefing.ts`, `api/weather.ts`
**Estimate**: 1 day (actual: same session)

### 3. Standardized error handling
**Status**: Done (2026-07-24). Created `api/_responseHelpers.ts` with `json`, `success`, `error`, `unauthorized`, `forbidden`, `notFound`, `methodNotAllowed`, `rateLimitExceeded`, `serverError` — all producing the `{ error: string }` / raw-data shape already in use everywhere, rather than introducing a new `{ success, data }` envelope. Deliberately kept the existing wire format: changing it would be a breaking change for every caller of these routes (frontend fetches, Tasker/IFTTT webhooks, voice-assistant integrations), and the audit's actual complaint — 21 near-duplicate local `j()` helpers that could silently drift — is what this fixes, not the shape itself.
**What was found**: 20 of 22 routes had an identical local `const j = (d, s=200) => new Response(...)` helper (already a de facto standard); `briefing.ts` had no helper at all and inlined `new Response(...)` directly, with one call site missing the `Content-Type: application/json` header entirely — a real drift the centralization caught and fixed. All 20 routes migrated to import the shared `json` (aliased `j`) helper; `briefing.ts` now uses `error`/`serverError` for its JSON error paths (its success path stays `text/plain` — Tasker/voice assistants speak that response directly, a legitimate divergence, not a bug). `weather.ts` keeps its own local `j` because it needs CORS headers (`Access-Control-Allow-Origin: *`) the shared helper doesn't set — also a legitimate divergence.
**Actions**:
- [x] Create `/api/_responseHelpers.ts` with standardized functions (11 tests in `_responseHelpers.test.ts`)
- [x] Update all API endpoints to use these helpers (20 migrated; 2 documented exceptions: `weather.ts` for CORS, `briefing.ts`'s success path for `text/plain`)
**Files**: `api/_responseHelpers.ts` (new), `api/_responseHelpers.test.ts` (new), and 20 of 22 `/api/*.ts` route files
**Estimate**: 2 days (actual: same session)

### 4. Dependency vulnerabilities
**Status**: 2026-07-24 pass done (react-router 6→7). New CVE disclosed 2026-07-24 against react-router 7.x required a follow-up pass (2026-07-26): react-router 7→8 + React 18→19.
**2026-07-24**: 3 vulnerabilities: 1 low (esbuild, dev-only via `tsx`), 2 moderate (react-router: open redirect via backslash in `<Link>`/`useNavigate`, arbitrary constructor injection in SSR hydration deserialization).
**Actions**:
- [ ] esbuild: **re-checked 2026-07-27, scope grew.** Now surfaces as GHSA-67mh-4wv8-2f99 (moderate, CWE-346 — a malicious website can send requests to the *dev server* and read responses; requires `npm run dev` actively running plus the attacker's page open in a browser at the same time — no production impact) via `vite@5.4.21`'s bundled `esbuild@<=0.24.2`, not the `tsx` dev-dep originally assumed. `npm audit`'s only fix path is `vite@8.1.5` — a 3-major-version jump (5→8) touching build config, `@vitejs/plugin-react-swc` compat, and vitest's Vite-dependent setup repo-wide. Deliberately not attempted this pass: severity/blast-radius (dev-only, requires two conditions to line up) doesn't justify a migration this size done reflexively; needs its own dedicated pass the way react-router's v7→v8 follow-up did, not a "quick audit fix."
- [x] react-router: upgraded `react-router-dom` from `^6.26.2` to `^7.18.1` (2026-07-24). **Turned out to be low-risk**: researched the app's actual usage first and found it's minimal — only `BrowserRouter`/`Routes`/`Route` (two static routes, no nesting) in `src/App.tsx` and `useLocation()` in `src/pages/NotFound.tsx`. No `<Link>`, `useNavigate`, data routers, loaders/actions, or `React.lazy` — so none of v7's usual breaking-change surface (data APIs, relative-splat-path resolution, `useTransition` interaction with `React.lazy`) applies. `npm audit` no longer lists react-router after the upgrade. `npm run build`, `npm test` (169 tests), and `npm run lint` all pass. **Verification gap**: could not smoke-test in an actual browser this session (Chrome extension wasn't connected) — confirmed via `curl` that the dev server serves the SPA shell for both `/` and an unmatched route, but did not visually confirm client-side render. Recommend a quick manual click-through (home page loads, hit a bad URL and see the 404 page, any deep-linked route Tasker/NFC integrations use) before considering this fully verified in production.
- [x] **react-router follow-up (2026-07-26)**: GHSA-qwww-vcr4-c8h2 (RSC Mode CSRF bypass, high severity per npm/GitHub CVSS but the advisory itself notes it only affects apps using unstable RSC APIs, which this app doesn't) disclosed against react-router 7.12.0-8.2.0, i.e. the just-upgraded 7.18.1 was newly affected. npm's suggested "fix" was a downgrade to 7.11.0 — not accepted, since downgrading isn't a real fix and would just reopen the original CVE this file already tracked. Real fix required react-router 8.3.0, which itself requires React 19.2.7+, so did the full React 18→19 upgrade alongside it rather than leaving this unfixed. Found and resolved two React-19 peer-dep blockers not previously flagged: `vaul` (0.9.9→1.1.2) and `next-themes` (0.3.0→0.4.6, also required an import-path fix in `theme-provider.tsx` since `ThemeProviderProps` moved from `next-themes/dist/types` to the package root). `react-router-dom` package is gone in v8 — its 3 import sites (`App.tsx`, `NotFound.tsx`) now import directly from `react-router` (the v8 changelog implies `BrowserRouter` moved to `react-router/dom`; empirically it did not — confirmed via `node -e "console.log(Object.keys(require(...)))"` before committing to an import path, not by trusting the changelog prose). Verified: `npm run build`, `npm test` (179 tests), `npm run lint`, and a standalone `tsc -p tsconfig.app.json` pass (identical 4 pre-existing errors, zero new ones) all pass. `npm audit` confirms react-router is no longer listed at all. **Same verification gap as before**: no in-browser click-through this session either — recommend one before calling this fully production-verified, especially given the React 18→19 jump touches every rendered component, not just the router.
**Files**: `package.json`, `package-lock.json`, `src/App.tsx`, `src/pages/NotFound.tsx`, `src/components/theme-provider.tsx`
**Estimate**: esbuild fix: <1 hour (not done). react-router v6→v7 migration: 2-3 days estimated; actual: same session, turned out much smaller than estimated because usage was minimal. react-router v7→v8 + React 18→19 follow-up: unplanned/unscoped, actual: same session.

## P1 - High (Next 6-8 Weeks)

### 5. Database Optimization
**Status**: Indexing verification done (2026-07-24); usage analysis done (2026-07-27) — table-splitting decision made: **not worth doing at current scale**.
**Indexing findings**:
- `household_memory` **is not a separate table** — the audit's premise was wrong. It's just a `key` value (`MEMORY_KEY = 'household_memory'` in `src/lib/householdMemory.ts`) stored inside `family_data` like every other feature, so it already benefits from the `family_data_composite_key` migration's `(key, household_id)` primary key. No standalone `household_memory(household_id)` index is needed because no such table exists.
- `household_members` already has both `household_id` and `auth_user_id` indexed (`20260713183556_multi_tenant_foundation.sql`, lines 24-25) — as **two separate single-column indexes**, not a composite `(household_id, auth_user_id)` index as the audit suggested. Checked every actual query against this table in `api/_db.ts`: each one filters on exactly one of those columns, never both together in the same WHERE clause. A composite index wouldn't help any real query pattern here — the existing two single-column indexes already cover everything. No change needed.
**Issue (unchanged)**: `family_data` still stores all feature types as undifferentiated JSONB — the schema-less design concern from the audit stands even though the indexing gap is closed and was found to be smaller than assumed.
**Usage analysis findings (2026-07-27)**: Queried the live production `family_data` table directly (read-only, metadata columns only — `key`/`household_id`/`updated_at`, no row contents) via the existing `SUPABASE_SERVICE_KEY`. Real numbers: **54 total rows across 4 households.** Distribution by key: `weather_cache` (4 rows) and `emotion_logs`/`presence_zones`/`nfc_tag_map`/`household_tasks`/`familyos_settings`/`family_promises` (3 rows each) are the "busiest" keys; everything else — `familyos_shopping`, `presence_log`, `four_pillars`, `quality_activities`, `familyos_ask_parents`, `household_memory`, `familyos_meals`, `familyos_bills`, `simplefin_access`, `familyos_expenses`, `familyos_games`, `familyos_allowance`, `familyos_bucket_list`, `familyos_medications`, `familyos_appointments`, plus the `ratelimit_*` keys checkRateLimit writes — sit at 1-2 rows. Recency: every real feature key was touched within the last 14 days (most within 2-7), so nothing here is dead/abandoned data skewing the count low.
**Decision: table-splitting is not worth doing.** The original P1 framing assumed usage patterns might justify splitting `family_data` into dedicated tables (pantry, tasks, preferences, settings, presence, quality time, finance). At 54 rows total — not 54 rows *per key*, 54 rows *across the entire table* — there is no query-performance, contention, or schema-clarity problem splitting would solve; a single JSONB key-value table comfortably handles this scale, and `family_data_composite_key`'s `(key, household_id)` primary key (confirmed in the indexing pass above) already makes every lookup a direct index hit regardless of how many distinct keys exist. Revisit only if household count or per-household data volume grows by roughly two orders of magnitude — not a near-term concern for a 4-household household-management app.
**Actions**:
- [x] Verify indexes on `household_members` and `household_memory` — done, no gap found (see findings above)
- [x] Analyze current usage of `family_data` table — done (see findings above); 54 rows / 4 households, no key remotely close to needing its own table
- [x] Decide on splitting given usage patterns — **decided: don't split.** Scale doesn't justify the migration cost or the added `_db.ts`/API complexity of two auth modes across dedicated tables.
**Files**: None — no migration needed, this was a read-only analysis that closed out the decision.
**Estimate**: Indexing verification: done. Usage analysis: done (same session). Table-splitting: not proceeding — the 5-day estimate no longer applies since the work isn't happening.

### 6. State Management Refinement
**Status**: Targeted version-guard fix done (2026-07-24); full unified data layer explicitly not pursued (see below).
**Findings, corrected from the audit's framing**: "Hybrid localStorage + Supabase risks inconsistencies" overstated the problem as originally scoped. Realtime subscriptions (`subscribeToRealtime` in `sync.ts`) already self-heal *divergence* — any server write propagates to other devices and overwrites their local copy. The actual gap is narrower: `saveJSON` writes the whole value to localStorage, then `pushToCloud` sends the whole value to `family_data` as a blob upsert (no delta, no merge) — so two writes to the *same key* within the same round-trip race, and whichever lands second at the server silently wins, dropping the other's edit with no indication anything was lost.
**First attempt (reverted)**: tried a union-by-id merge in `pushToCloud` for array-shaped data — fetch the cloud's current value before pushing, add back any item present in cloud but not locally. This is wrong: it can't distinguish "cloud has an item I never saw" from "cloud has an item I just deleted," so it resurfaces every deleted item on the very next sync. Reverted before landing; a correct merge needs tombstones/delete-tracking, which is out of scope for a targeted fix (see "Full data layer" below).
**What was done instead — optimistic concurrency (version guard)**: `api/data-write.ts` now accepts an optional `expectedUpdatedAt`; if the row's actual `updated_at` no longer matches, it rejects with 409 and returns the current cloud value instead of overwriting it. `sync.ts` tracks each key's last-known `updated_at` (from pull, realtime events, and its own successful pushes) and sends it on every push. On 409, the client adopts the cloud's value into localStorage rather than clobbering it, and logs a warning. Pushes to the same key are also now serialized/coalesced per key (`pending`/`queuedValue` maps in `sync.ts`) — without this, `saveJSON`'s fire-and-forget push meant two rapid edits to one key (e.g. fast typing, quick checkbox toggles) would both read the same stale version and the second would 409 against its *own* device's in-flight write, which is strictly worse than doing nothing. Caught this via a second advisor pass before committing; added `src/lib/sync.test.ts` (3 tests) covering the coalescing behavior and the 409 adopt-cloud-value path.
**What this does and doesn't fix**: same-device rapid writes to one key are now fully serialized — no self-conflict, each carries the correct version. Cross-device concurrent writes are *detected*, not merged — the loser gets 409 and takes the winner's value instead of silently overwriting it, which is strictly better than before, but the two edits are never combined (only whole-value blobs exist, not deltas), so the loser's edit is still gone, just now visibly so instead of silently. The server's read-then-write check also has a small TOCTOU window (two requests can both read "no conflict" before either writes) — narrows the race, doesn't fully close it.
**Full data layer (IndexedDB, unified `/src/lib/data.ts` abstraction, item-level merge/tombstones)**: explicitly not pursued this pass — scoped down from the original 5-day estimate after confirming with the user that the actual failure mode (occasional same-second concurrent edits to one list) didn't justify the bigger rewrite. Revisit if lost cross-device edits become a reported problem in practice.
**Files**: `api/_schemas.ts` (`DataWriteBodySchema.expectedUpdatedAt`), `api/data-write.ts` (409 check + `updatedAt` in response), `src/lib/sync.ts` (version tracking, per-key serialization), `src/lib/sync.test.ts` (new)
**Estimate**: 5 days estimated for the full scope; actual for the targeted version-guard fix: same session.

### 7. Testing Expansion
**Status**: CI added and one hook partially tested (2026-07-24); remaining hook coverage needs an infra decision (see below).
**Confirmed**: no `.github/` directory existed at all — the "verify CI" question is answered: there wasn't one. Added `.github/workflows/ci.yml` running `npm ci` → `npm test` → `npm run lint` → `npm run build` on push to `master` and on every PR (YAML validated). Node 20, `actions/checkout@v4` + `actions/setup-node@v4` with npm caching.
**Hook testing — partial, and here's why it stopped**: `use-toast.ts` exports a pure `reducer` function with no DOM dependency — added `src/hooks/use-toast.test.ts` (7 tests, all passing) covering ADD/UPDATE/DISMISS/REMOVE_TOAST behavior including the `TOAST_LIMIT=1` cap and the dismiss-all/remove-all (`toastId: undefined`) paths. **`useIsMobile` (`use-mobile.tsx`) could not be tested the same way** — it needs `window.matchMedia` and a real hook-render lifecycle (`React.useEffect`), and this repo's `vitest.config.ts` is set to `environment: 'node'` (no DOM) with `include` scoped to `**/*.test.ts` only (a `.tsx` test file wouldn't even be picked up). Testing it properly means adding `jsdom` or `happy-dom` plus `@testing-library/react` as new dependencies and changing the vitest environment — a real (if standard) infra decision, not a "just write the test" gap. Left this as an explicit open action rather than silently pulling in new dependencies.
**Remaining gaps**:
- `useIsMobile` untested — blocked on the jsdom/testing-library decision above
- The `useToast` hook itself (state/listeners/effect wiring, as opposed to its pure `reducer`) is also untested for the same DOM-environment reason
- No integration/E2E tests for full user flows (auth, task completion, pantry, AI features) — only unit tests on individual modules; still lower priority than the above per the original plan
**Actions**:
- [x] Set up CI pipeline running `npm test`, `npm run lint`, and `npm run build` on PRs
- [x] Add tests for `src/hooks/use-toast.ts` (reducer only — pure logic, no new dependencies needed)
- [ ] Decide whether to add jsdom/happy-dom + @testing-library/react to test `use-mobile.tsx` and the full `useToast` hook lifecycle, or accept the gap
- [ ] Consider integration tests for critical flows (auth, billing) — full E2E (Playwright/Cypress) is lower priority than closing the unit-test gaps above
**Files**: New test files, CI config if missing
**Estimate**: 2 days for remaining unit gaps + CI verification; E2E scoped separately if pursued

### 8. Performance Optimization
**Status**: Code-splitting done (2026-07-24); image optimization and dependency audit not started.
**Findings, corrected from the audit's guess**: The "likely candidates" list was wrong on two of three. `react-day-picker` (`calendar.tsx`) and `embla-carousel-react` (`carousel.tsx`) are shadcn/ui scaffold components that **no app code imports at all** — confirmed via repo-wide grep. Vite/Rollup already tree-shakes unreferenced modules, so neither was ever actually in the bundle; nothing to split there. `recharts` (via `Trends.tsx`) was the real offender, plus a much bigger one the audit missed entirely: **all 16 of `AppLayout.tsx`'s switch-rendered modules** (`HouseholdBrain`, `Shopping`, `MealPlanner`, `SettingsModal`, `FinanceHub`, etc. — ~7,000 lines total) were statically imported even though the app only ever renders one at a time based on user navigation.
**What was done**: Converted `Trends` (Dashboard's chart tab) and all 16 `AppLayout.tsx` modules/modals to `React.lazy()` with `Suspense` boundaries (`Dashboard` stays eager since it's the default landing view — lazy-loading it would add a loading flash on every app open). Two follow-on fixes were needed because a shared constant/type import was pulling a whole lazy component back into the eager bundle: extracted `CARS_STORAGE_KEY` out of `CarMaintenance.tsx` into `carMaintenanceKeys.ts`, and `DAYS`/`MEALS`/`WeekPlan`/`defaultPlan`/`applyMealCooked` out of `MealPlanner.tsx` into `mealPlannerShared.ts`, since `HermesChat.tsx` and `hermesActions.ts` needed those without forcing the whole component in. `SettingsModal`/`HistoryModal` are now conditionally rendered (`{open && <Modal/>}`) inside their `Suspense` boundary rather than always-mounted-but-hidden — the latter would have fetched both chunks on every app load regardless of whether the user ever opens them, defeating the point of lazy-loading them. **Result: main chunk 1,375.32 kB → 688.52 kB gzipped 376.40 kB → 205.18 kB — a 50% reduction**, plus `Trends` now loads as its own 419 kB chunk only when that tab is opened. Verified via `npx tsc --noEmit -p tsconfig.app.json` (confirmed the 3 pre-existing type errors it surfaces — `HealthHub.tsx`/`MealPlanner.tsx` `UserRole`/`'pet'` comparisons and a `SuggestionResult.error` access — predate this session's changes, same errors present on a clean stash), `npm run build`, `npm test` (176 tests), `npm run lint` (couldn't do a full browser click-through — no browser extension connected this session).
**Remaining gap noted, not fixed**: `src/lib/householdMemory.ts` still triggers a vite build warning (dynamically imported by `familyos.ts` to break a circular dependency, but also statically imported by `HermesChat.tsx` and `HouseholdMemory.tsx`) — investigated and left alone because both static importers are themselves either already-lazy (`HouseholdMemory.tsx`, handled above) or eager by necessity (`HermesChat.tsx`, always mounted), so splitting this one file wouldn't shrink anything further. Not a real gap, just a residual harmless warning.
**Actions**:
- [x] Identify largest dependencies — recharts confirmed as real; react-day-picker/embla-carousel-react confirmed unused (audit's guess was wrong)
- [x] Implement code splitting for heavy/conditionally-rendered components — recharts (Trends) + all 16 AppLayout modules, well beyond the audit's narrower "charts/calendar/carousel" scope
- [ ] Optimize image assets (not investigated this pass)
- [x] Audit and remove unused dependencies — `react-day-picker` and `embla-carousel-react` removed entirely (2026-07-26), along with their now-orphaned scaffold components `src/components/ui/calendar.tsx`/`carousel.tsx`. Re-confirmed zero app-code imports before removing. `npm run build`, `npm test` (179 tests), `npm run lint` all pass after removal.
**Files**: `src/components/AppLayout.tsx`, `src/components/familyos/Dashboard.tsx`, new `src/components/familyos/sections/carMaintenanceKeys.ts` and `mealPlannerShared.ts`, plus `CarMaintenance.tsx`/`MealPlanner.tsx`/`HermesChat.tsx`/`hermesActions.ts` updated to use them
**Estimate**: 3 days estimated; actual: same session for the code-splitting piece. Image optimization and unused-dependency removal still open.

## P2 - Medium (Next Quarter)

### 9. Observability & Monitoring
**Status**: Structured logging + Speed Insights done (2026-07-24). Sentry-style error tracking, admin dashboard, and metrics collection scoped out — see below.
**What was done**: Added `api/_log.ts` (`logError(route, err, context?)` — emits a structured JSON line via `console.error`, which Vercel's function log viewer captures automatically; no external service needed). Wired it into `serverError()` in `api/_responseHelpers.ts` (now `serverError(message, route?, err?)` — logs when `route` is passed) and updated every one of the 26 previously-silent 500-error sites across 16 route files to pass their route name and caught exception through. Before this, a caught exception's message went to the client but the exception itself — and any server-side trace of the failure — was discarded; a production 500 left zero trace in Vercel's logs. `weather.ts` (which intentionally keeps its own local response helper for custom CORS headers, per earlier session history) got an equivalent inline `console.error` at its one 500 site rather than importing `serverError`, to preserve that deliberate divergence. Also installed `@vercel/speed-insights@2.0.0` and called `injectSpeedInsights()` in `src/main.tsx` — a first-party, no-account-needed performance monitoring script (the app is already Vercel-deployed).
**Not done, scoped out this pass**: Sentry/LogRocket error tracking needs a new external account (DSN, org signup) the user would have to create — asked, user chose logging + Speed Insights only, no new account. Admin health dashboard and metrics collection (API/DB response times) also not pursued — bigger, separate pieces of work not covered by the "structured logging + Speed Insights" scope the user approved.
**Verified**: `npm test` (179 tests), `npm run lint`, `npm run build` all pass. No tsconfig in this repo actually covers `api/` (`tsconfig.app.json`'s `include` is `["src"]` only; `vite build` only compiles `src/`; the vitest suite covers only `_`-prefixed helpers, zero route files) — so the 26 new `serverError(message, route, err)` call sites have no type-checked or test-covered verification. Ran a standalone `tsc` pass over `api/*.ts` outside this repo's config to sanity-check anyway; it surfaced the same systemic `parsed.ok`-narrowing false positives documented earlier in this file for `weather.ts`/`briefing.ts` (an isolated-tsc-invocation artifact, not a real bug — same discriminated-union pattern used successfully elsewhere), across nearly every route, not just the ones touched here. Given that noise floor, verified correctness by hand instead: read every one of the 26 `serverError(...)` call sites and confirmed each second argument is a route-name string literal and each third argument (where present) is the actual caught exception or error-detail value, not swapped or malformed.
**Speed Insights caveat**: `injectSpeedInsights()` only injects the collection script — actual data collection additionally requires Speed Insights being enabled for this project in the Vercel dashboard, which wasn't verified or enabled from here. Code is wired and will start collecting once you flip that on (Project → Speed Insights → Enable).
**Actions**:
- [x] Implement structured logging in API endpoints — all 26 previously-silent 500 sites across 16 files, plus `weather.ts`'s equivalent local pattern
- [x] Add performance monitoring (Vercel Speed Insights) — code wired; requires enabling Speed Insights in the Vercel project dashboard to actually collect data
- [ ] Add error tracking (Sentry, LogRocket) — needs a new external account; deferred
- [ ] Create admin dashboard for monitoring system health — separate scope
- [ ] Add metrics collection for key operations (API response times, DB query times, etc.) — separate scope
**Files**: `api/_log.ts` (new), `api/_responseHelpers.ts`, `api/billing-checkout.ts`, `api/briefing.ts`, `api/calendar-sync.ts`, `api/chat.ts`, `api/classroom.ts`, `api/data-write.ts`, `api/finance.ts`, `api/gmail-suggestions.ts`, `api/ha-cameras.ts`, `api/ha-webhook.ts`, `api/health-check.ts`, `api/setup.ts`, `api/stripe-webhook.ts`, `api/vision.ts`, `api/walmart.ts`, `api/weather.ts`, `src/main.tsx`, `package.json`/`package-lock.json` (`@vercel/speed-insights`)
**Estimate**: 3 days estimated; actual: same session for the logging + Speed Insights slice.

### 10. Documentation & Knowledge Transfer
**Actions**:
- [ ] Create architectural decision records (ADRs) for key choices
- [ ] Document API contracts and data flow
- [ ] Create contributor guide with setup instructions
- [ ] Document deployment process and environment variables
- [ ] Create runbook for common operations (database migrations, backups, etc.)
**Estimate**: 2 days

### 11. Feature Flagging System
**Actions**:
- [ ] Implement simple feature flag system (LaunchDarkly open source alternative or custom)
- [ ] Allow toggling features per household or globally
- [ ] Use for safe rollouts of new features
- [ ] Integrate with analytics to measure feature usage
**Estimate**: 2 days

## P3 - Low (Future Considerations)

### 12. Offline-First Capabilities
**Actions**:
- [ ] Investigate Service Workers for caching static assets
- [ ] Implement local database (IndexedDB) for queuing writes when offline
- [ ] Add background sync when connection restored
- [ ] Create offline indicator UI
**Estimate**: 5 days

### 13. Modular Architecture
**Actions**:
- [ ] Consider splitting monorepo into packages:
  - `@bearhouse/ui` (shared components)
  - `@bearhouse/hooks` (shared custom hooks)
  - `@bearhouse/lib` (shared utilities)
  - `@bearhouse/api` (API route definitions)
- [ ] This would enable independent versioning and reuse
**Estimate**: 5 days (larger refactor)

### 14. Internationalization (i18n)
**Actions**:
- [ ] Add i18n framework (react-i18next or similar)
- [ ] Externalize all UI strings
- [ ] Create translation workflow
**Estimate**: 3 days

## Success Metrics
Track these to measure improvement:

### Security
- [ ] Percentage of API read operations using anon key (target: >80%)
- [ ] Number of security vulnerabilities in dependencies (target: 0 critical/high)
- [ ] Regular security audit completion (target: quarterly)

### Reliability
- [ ] API error rate (target: <0.1%)
- [ ] Client-side error rate (target: <1% of sessions)
- [ ] Mean time to recovery from incidents (target: <1 hour)

### Performance
- [ ] Page load times (target: <3s on 3G)
- [ ] Bundle size (target: <2MB gzipped)
- [ ] API response time (target: <200ms p95)

### Developer Experience
- [ ] Test coverage (target: 80%+ on critical paths)
- [ ] Onboarding time for new developers (target: <1 day to first commit)
- [ ] Deployment frequency (target: >= weekly)

## Implementation Approach
1. **Start with P0 items** - These address foundational security and reliability issues
2. **Work in small batches** - 1-2 items per sprint to maintain velocity
3. **Maintain a changelog** - Document all changes for transparency
4. **Regular retrospectives** - Adjust plan based on learnings and changing priorities
5. **Verify in staging** - Use Vercel preview deployments for testing before production

---
*Plan created: 2026-07-22*
*Priorities re-verified against code and updated: 2026-07-24*
*Based on audit: AUDIT.md*
*Version: Based on master branch as of af702f4*