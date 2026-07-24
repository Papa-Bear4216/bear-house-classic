# Bear House Classic - Improvement Plan

Based on the audit of the bear-house-classic codebase (AUDIT.md), here is a prioritized plan for improvements.

**Status update (2026-07-24)**: re-verified every P0/P1 item against current code before re-ranking. Several items the audit flagged as missing already have infrastructure in place, partially adopted. Statuses below reflect the repo as it stands now, not the audit's snapshot.

## Priority Levels
- **P0**: Critical - Security, data loss, or major functionality issues
- **P1**: High - Significant improvements to reliability, performance, or maintainability
- **P2**: Medium - Nice-to-have enhancements
- **P3**: Low - Future considerations

## Open Decision (not a task — needs a call before any P0 work proceeds)

### Service role vs. anon-key reads
The audit's original #1 P0 was "stop using service_role for reads, use anon key instead." Since then, RLS was deliberately locked down (`docs/fix-family-data-rls.sql`) specifically so the **anon key can no longer write** — reads are now proxied entirely through Edge Functions using service_role, and `household_id` scoping is enforced in application code (`resolveHouseholdId` in `api/_db.ts`), not the database. That's a considered design, not an oversight.

So the original recommendation is largely **moot as stated** — the architecture went the opposite direction on purpose. The real open question is narrower: **should anon-key + RLS-backed reads be added as defense-in-depth**, so that a bug in `resolveHouseholdId` (e.g. a missing await, a wrong household_id lookup) can't leak cross-tenant data even if application logic fails? That's a judgment call on how much you trust the app-layer boundary vs. wanting DB-enforced isolation as a second line of defense. Recommend the user decide this before scheduling any related work — it determines whether item below is "do it" or "won't do."

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
**Status**: New finding from re-running `npm audit` during this update (not in the original audit). 3 vulnerabilities: 1 low (esbuild, dev-only via `tsx`), 2 moderate (react-router: open redirect via backslash in `<Link>`/`useNavigate`, arbitrary constructor injection in SSR hydration deserialization).
**Actions**:
- [ ] esbuild: dev-dependency only (via `tsx`), low severity — still open, `npm audit fix` should resolve it without a breaking change (not done this pass — deprioritized in favor of the react-router fix, which was the actual CVE-bearing item)
- [x] react-router: upgraded `react-router-dom` from `^6.26.2` to `^7.18.1` (2026-07-24). **Turned out to be low-risk**: researched the app's actual usage first and found it's minimal — only `BrowserRouter`/`Routes`/`Route` (two static routes, no nesting) in `src/App.tsx` and `useLocation()` in `src/pages/NotFound.tsx`. No `<Link>`, `useNavigate`, data routers, loaders/actions, or `React.lazy` — so none of v7's usual breaking-change surface (data APIs, relative-splat-path resolution, `useTransition` interaction with `React.lazy`) applies. `npm audit` no longer lists react-router after the upgrade. `npm run build`, `npm test` (169 tests), and `npm run lint` all pass. **Verification gap**: could not smoke-test in an actual browser this session (Chrome extension wasn't connected) — confirmed via `curl` that the dev server serves the SPA shell for both `/` and an unmatched route, but did not visually confirm client-side render. Recommend a quick manual click-through (home page loads, hit a bad URL and see the 404 page, any deep-linked route Tasker/NFC integrations use) before considering this fully verified in production.
**Files**: `package.json`, `package-lock.json` (react-router only — no source file changes needed)
**Estimate**: esbuild fix: <1 hour (not done). react-router v6→v7 migration: 2-3 days estimated; actual: same session, turned out much smaller than estimated because usage was minimal.

## P1 - High (Next 6-8 Weeks)

### 5. Database Optimization
**Status**: Indexing verification done (2026-07-24); table-splitting deferred (unchanged recommendation).
**Indexing findings**:
- `household_memory` **is not a separate table** — the audit's premise was wrong. It's just a `key` value (`MEMORY_KEY = 'household_memory'` in `src/lib/householdMemory.ts`) stored inside `family_data` like every other feature, so it already benefits from the `family_data_composite_key` migration's `(key, household_id)` primary key. No standalone `household_memory(household_id)` index is needed because no such table exists.
- `household_members` already has both `household_id` and `auth_user_id` indexed (`20260713183556_multi_tenant_foundation.sql`, lines 24-25) — as **two separate single-column indexes**, not a composite `(household_id, auth_user_id)` index as the audit suggested. Checked every actual query against this table in `api/_db.ts`: each one filters on exactly one of those columns, never both together in the same WHERE clause. A composite index wouldn't help any real query pattern here — the existing two single-column indexes already cover everything. No change needed.
**Issue (unchanged)**: `family_data` still stores all feature types as undifferentiated JSONB — the schema-less design concern from the audit stands even though the indexing gap is closed and was found to be smaller than assumed.
**Actions**:
- [x] Verify indexes on `household_members` and `household_memory` — done, no gap found (see findings above)
- [ ] Analyze current usage of `family_data` table (what keys are stored, frequency) before deciding whether splitting into dedicated tables is worth the migration cost
- [ ] If usage patterns justify it, identify candidates for splitting (pantry, tasks, preferences, settings, presence, quality time, finance) — otherwise this may not be worth doing given `family_data` is already correctly keyed and working
**Files**: New migration files if splitting proceeds, update `/api/_db.ts`, update relevant API endpoints
**Estimate**: Indexing verification: done. Table-splitting: 5 days if it proceeds (still recommend deferring until usage data justifies it — no new evidence found this pass that changes that recommendation).

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
- [ ] Audit and remove unused dependencies — `react-day-picker` and `embla-carousel-react` are candidates for removal entirely (zero usage found), not just splitting; flagging as a follow-up rather than removing packages unprompted
**Files**: `src/components/AppLayout.tsx`, `src/components/familyos/Dashboard.tsx`, new `src/components/familyos/sections/carMaintenanceKeys.ts` and `mealPlannerShared.ts`, plus `CarMaintenance.tsx`/`MealPlanner.tsx`/`HermesChat.tsx`/`hermesActions.ts` updated to use them
**Estimate**: 3 days estimated; actual: same session for the code-splitting piece. Image optimization and unused-dependency removal still open.

## P2 - Medium (Next Quarter)

### 9. Observability & Monitoring
**Actions**:
- [ ] Add error tracking (Sentry, LogRocket, or Vercel's built-in error tracking)
- [ ] Implement structured logging in API endpoints
- [ ] Add performance monitoring (Vercel Speed Insights or custom)
- [ ] Create admin dashboard for monitoring system health
- [ ] Add metrics collection for key operations (API response times, DB query times, etc.)
**Estimate**: 3 days

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