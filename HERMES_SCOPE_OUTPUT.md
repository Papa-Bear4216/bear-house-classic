# HERMES SCOPE OUTPUT — Phase 0 "Seamlessness" (bear-house-classic)

Date: 2026-08-05 · Author: Hermes (scoping only — no implementation code written)
Source: `HERMES_TASK_seamlessness.md` + plan `~/.claude/plans/distributed-growing-mountain.md` + design spec on branch `feat/native-push-notifications` (`docs/superpowers/specs/2026-07-22-native-push-notifications-design.md`).

All statements below were verified against the current `master` working tree, not assumed.

---

## 0. Executive summary

| Phase 0 item | Plan estimate | Reality on `master` | Work needed |
|---|---|---|---|
| 1. Push notifications (FCM) | ~1 day | **Nothing exists** — 0 of ~11 pieces present | **Build everything** (biggest item) |
| 2. Smart notification bundling | fold into #1 | N/A | Built into #1's design, no separate work |
| 3. Offline queue (`sync.ts`) | ~0.5 day | **Already implemented** (`src/lib/sync.ts:24–103`, tested in `sync.test.ts`) | **None** — verify only |
| 4. Optimistic UI | ~1 day | **~85% already true by construction** (`saveJSON` → state+localStorage+background `pushToCloud`) | Small: wire `useWriteQueued` into remaining write sections, add 409-conflict toast |

The plan's item 1 scoping is accurate. Items 3–4 have **already landed** since the plan was written — do not re-implement them.

---

## 1. Phase 0 item 1 — Push notifications (FCM)

### 1.1 Verified starting state (evidence, not guesses)

- `@capacitor/push-notifications` **not** in `package.json` (only `@capacitor/{android,app,browser,core,cli}` v8.x). → `@capacitor/core` is **8.3.1**, so the plugin must be **v8.x** to match.
- `android/app/build.gradle:56–61` — google-services Gradle plugin block **already present and conditional** on `google-services.json` existing; `android/build.gradle:11` has `com.google.gms:google-services:4.4.4` on the classpath. **No Gradle edits needed.**
- `android/app/google-services.json` — **absent** (human step, see open questions).
- `AndroidManifest.xml` — has INTERNET/CAMERA/COARSE_LOCATION only. **No `POST_NOTIFICATIONS`.**
- `api/_notify.ts` — only `notifyIFTTT` exists. No `notifyPush`.
- `api/register-push-token.ts` — **absent**.
- `src/lib/push.ts` — **absent**.
- `api/_db.ts` — has `resolveHouseholdId` (:26), `dbGet`/`dbSet`/`dbPrepend` (:99–129), the `headers(serviceKey)` fetch pattern. **No `device_tokens` helpers.**
- `supabase/migrations/` — latest is `20260805000000_add_gmail_server_oauth.sql`. **No `device_tokens` migration.** New one must be timestamped after that.
- 4 `notifyIFTTT` call sites confirmed: `api/webhook.ts:96`, `api/ha-webhook.ts:60` (package_delivered) + `:67` (door_left_open), `api/health-check.ts:89`.
- `api/finance-sync.ts:21` calls `runDailyBrainChecks(householdId)` per-household; `api/daily-brain.ts:194–209` returns `{ shoppingAdded, tasksAdded, carMaintenanceAdded, gmailTasksAdded, emotionsFlagged }` (arrays) or `{ error }`.
- All 4 webhook routes + `finance-sync.ts` run under `export const config = { runtime: 'edge' }` → **Web Crypto (`crypto.subtle`) is available**; `firebase-admin` is correctly out of the question. Spec's approach is right.
- `.gitignore` only excludes `.env*` — `google-services.json` is currently **not** ignored (see open question Q2).
- Call-site for registration: `src/contexts/AppContext.tsx` `useEffect` (:50) sets `householdId` at :74, roster at :80–88. `getAccessToken()` is exported from `src/lib/householdAuth.ts` (used by `src/lib/familyos.ts:267`). That effect is the anchor for `registerForPush()`.
- **Branching warning:** the design spec lives on `feat/native-push-notifications`, which was created ~2026-07-22; `master` has since moved (incl. `20260805` gmail-oauth migration). **Do not branch implementation off the stale feature branch** — branch off `master` (or a fresh feature branch off master) and carry the spec doc across.

### 1.2 Complete file list (11 changes)

| # | File | Action |
|---|---|---|
| 1 | `supabase/migrations/<next-timestamp>_add_device_tokens.sql` | **NEW** — table + index |
| 2 | `api/_db.ts` | **MODIFY** — 3 new helpers |
| 3 | `api/register-push-token.ts` | **NEW** — route |
| 4 | `api/_notify.ts` | **MODIFY** — add `notifyPush()` (+ FCM plumbing) |
| 5 | `api/webhook.ts` | **MODIFY** — :96 pair |
| 6 | `api/ha-webhook.ts` | **MODIFY** — :60, :67 pair |
| 7 | `api/health-check.ts` | **MODIFY** — :89 pair |
| 8 | `api/finance-sync.ts` | **MODIFY** — daily-brain summary push (the plan's delta) |
| 9 | `src/lib/push.ts` | **NEW** — client registration |
| 10 | `src/contexts/AppContext.tsx` | **MODIFY** — 1 call after session resolves |
| 11 | `android/app/src/main/AndroidManifest.xml` | **MODIFY** — permission |

Plus: `package.json` (+`@capacitor/push-notifications@^8`), `android/app/google-services.json` (NEW, human-supplied), Vercel env var `FIREBASE_SERVICE_ACCOUNT` (human-supplied). Optionally `api/_schemas.ts` for body validation (see 1.3 item 3).

### 1.3 File-by-file diff outline (not code)

**1. Migration `…_add_device_tokens.sql`**
- `create table public.device_tokens (id uuid pk default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade, token text not null unique, platform text not null default 'android', created_at timestamptz default now(), updated_at timestamptz default now())` — mirrors spec.
- `create index device_tokens_household_id_idx on public.device_tokens(household_id);`
- `alter table … enable row level security;` and **no policies** — service_role (used by `api/`) bypasses RLS; browser never reads/writes this table. Add a comment explaining why (contrast with `household_memory` which has a select policy because the Settings UI reads it).

**2. `api/_db.ts` — 3 helpers** (all using the existing `headers(serviceKey)` + raw fetch pattern, matching :99–129):
- `dbUpsertPushToken(householdId, token, platform)` → `POST /rest/v1/device_tokens` with `Prefer: resolution=merge-duplicates` (same header as `dbSet` :115). Because `token` is unique, re-registration ON CONFLICT DO UPDATEs `household_id`/`platform`/`updated_at` — handles device re-installs and account switches per spec.
- `dbGetPushTokensByHouseholdId(householdId)` → `GET /rest/v1/device_tokens?household_id=eq.<id>&select=token` → `string[]`.
- `dbDeletePushToken(token)` → `DELETE /rest/v1/device_tokens?token=eq.<token>` (token is unique; used by prune path).

**3. `api/register-push-token.ts` (NEW, edge runtime)**
- `export const config = { runtime: 'edge' };` (required — edge routes that call `_notify.ts` need the runtime line; verify none of the new helpers pull in Node-only code).
- POST only. `resolveHouseholdId(accessToken)` from `Authorization: Bearer` → 401 on null (matches `api/setup.ts` convention per spec).
- Minimal body check: `token` non-empty string, `platform` optional defaulting to `'android'` (optionally via a small schema added to `api/_schemas.ts` for consistency with `parseBody`; the spec doesn't require it — keep light).
- Calls `dbUpsertPushToken`. Returns `{ ok: true }` / 401 / 400.

**4. `api/_notify.ts` — add `notifyPush(householdId, title, body)`**
- Guard: `const sa = process.env.FIREBASE_SERVICE_ACCOUNT; if (!sa) return;` (mirrors `notifyIFTTT`'s `if (!key) return;` :12). Whole body in try/catch-swallow.
- Parse SA JSON once (module scope): `client_email`, `private_key`, `project_id`.
- OAuth2 JWT via **Web Crypto** (edge-safe): `crypto.subtle.importKey('pkcs8', …)` on the PEM-decoded private key, RS256 sign `{iss, sub: client_email, aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/firebase.messaging', iat, exp: iat+3600}`. Exchange: `POST https://oauth2.googleapis.com/token` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>`.
- Cache the OAuth access token in module scope with an expiry timestamp (~3600s, refresh ~5 min early) — avoids re-signing per send in a warm instance.
- For each token: `POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`, `Authorization: Bearer <access>`, body `{ message: { token, notification: { title, body } } }`.
- **Prune pitfall (add to spec knowledge):** FCM v1 returns errors as JSON in the response body — `{ "error": { "status": "NOT_FOUND" | "UNREGISTERED", … } }` — **not** HTTP 404 alone (404s can also carry body status). Prune must parse `res.status === 404 || body?.error?.status === 'NOT_FOUND' || body?.error?.status === 'UNREGISTERED'` → `dbDeletePushToken(token)`. Do not treat HTTP 400 as a prune.
- Use `Promise.allSettled` over tokens so one bad token doesn't abort the rest.

**5–7. Call sites** (all already have `householdId` in scope — verified):
- `api/webhook.ts:96` — after `notifyIFTTT`, `await notifyPush(householdId, 'New item', text)`.
- `api/ha-webhook.ts:60` — `notifyPush(householdId, 'Package delivered', 'Front door')` inside the same `if (!r.skipped)`.
- `api/ha-webhook.ts:67` — `notifyPush(householdId, 'Door left open', area)` in the same guard.
- `api/health-check.ts:89` — `notifyPush(householdId, `${fix.label} needs attention`, …)` inside the same `needsHuman && cooldown` guard (cooldown inherited automatically — good, no duplicate-spam risk).

**8. `api/finance-sync.ts` — the plan's delta (daily-brain summary push, = item 2's bundling)**
- Inside the existing `householdIds.map(async …)` (:18–23), after `runDailyBrainChecks(householdId)`:
  - If result is `{ error }` → skip (no push).
  - Sum counts from the 5 arrays. If total === 0 → **no push** (silent day, matching "watchdog stays quiet" semantics).
  - Else one `notifyPush(householdId, 'Bear House — N things need attention', <one-line summary>)`.
- **Bundling is achieved by construction:** exactly one push per household per daily run, never one-per-finding. No aggregation API exists on FCM (bundling is client-side via channel grouping) — not needed for v1 because we never send >1 push per run.

**9. `src/lib/push.ts` (NEW)**
- `import { PushNotifications } from '@capacitor/push-notifications'` + `Capacitor` from `@capacitor/core`.
- `registerForPush()`: guard `if (!Capacitor.isNativePlatform()) return;` → `PushNotifications.requestPermissions()` (Android 13+ system dialog) → `PushNotifications.register()` → `addListener('registration', …)` POSTs `{ token, platform: 'android' }` to `apiUrl('/api/register-push-token')` with `Authorization: Bearer ${getAccessToken()}` → also `addListener('registrationError', …)` logs and swallows.
- Keep idempotent (re-registering on each login just refreshes `updated_at` server-side; plugin `register()` is a no-op if already registered).
- No deep-link/tap handling in scope (per spec — default Capacitor behavior is fine).

**10. `src/contexts/AppContext.tsx`**
- One line in the mount `useEffect` (:50), immediately after `setHouseholdId(session.householdId)` (:74): `registerForPush()` (fire-and-forget, `void`). Not gated behind a Settings toggle (per spec). Call it only on native — the guard lives inside `push.ts`.

**11. `AndroidManifest.xml`**
- Add `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` to the permissions block (:52–57).

**Config/human:** `package.json` add `@capacitor/push-notifications@^8` (must match core 8.3.1); run `npm i` then `npx cap sync android`. Add `FIREBASE_SERVICE_ACCOUNT` to Vercel env. Drop `google-services.json` into `android/app/`.

### 1.4 Open questions — RESOLVED (2026-08-05, decisions recorded)

| # | Question | Decision |
|---|---|---|
| Q1 | Firebase console access | **Micha has console access; Hermes will perform the console steps** (register Android app `com.bearhouse.app`, download `google-services.json`, create service-account key) once logged in. Cloud Messaging API enablement checked at the same time. |
| Q2 | `google-services.json` in git? | **Commit it** (Hermes recommendation, user deferred to default). It is client-safe per Firebase docs (contains an API key, not a secret), and committing is required for reproducible builds/CI. Reversible via `.gitignore` later if ever needed. |
| Q3 | Self-notification | **Accepted** — household-wide broadcast incl. actor's device is fine for v1. |
| Q4 | `emotionsFlagged` in daily push | **Excluded from the push entirely** (option a). `emotionsFlagged` writes to `household_memory` for Hermes — its job is Hermes knowing, not family-device pinging. The push summary counts **only** `shoppingAdded + tasksAdded + carMaintenanceAdded + gmailTasksAdded`. |
| Q5 | daily-brain push timing | **Accepted as-is** — 06:00 UTC overnight notification is fine. No `vercel.json` change. |
| Q6 | Android build/test | **Galaxy Book 3 360 has Android Studio** — `npx cap sync android` + build/install via Android Studio (device or emulator). |
| Q7 | Implementation branch | **Fresh branch off `master`** (carries all newer migrations); the design-spec doc is cherry-picked onto it for reference. Do **not** branch off `feat/native-push-notifications`.

---

## 2. Phase 0 item 2 — Smart notification bundling

**No separate work.** Verified: the only "many findings in one run" producer is daily-brain; the summary push (§1.3 item 8) emits exactly one notification per household per run. The 4 webhook call sites are single-event pushes, already inherently bundled. If multi-push scenarios ever appear, Android-side grouping (notification channel + `setGroup`/summary) is the future mechanism — explicitly deferred, not needed for v1.

---

## 3. Phase 0 item 3 — Offline queue — **ALREADY IMPLEMENTED**

Evidence from `master`:
- `src/lib/sync.ts:24–69` — `offlineQueue` (whole-value blobs, per-key supersede), `loadOfflineQueue`/`persistQueue` from `localStorage['sync_offline_queue']`, `enqueueOfflineWrite`, `isWriteQueued`.
- `src/lib/sync.ts:81–99` — `flushOfflineQueue()` replays on `window 'online'` event and on `load` if online; failure keeps item at queue head for next retry.
- `src/lib/sync.ts:133–204` — `pushToCloud` per-key serialization; on retryable failure → `enqueueOfflineWrite`; on **409 conflict** → adopts cloud value (correct: never replays a losing edit), notifies listeners so UI reconciles.
- `src/lib/sync.test.ts` — tests for queue behavior exist (`isWriteQueued` assertions at :140, :147, :158, :164).
- `src/lib/useWriteQueued.ts` — React hook exposing queued state; wired into `Shopping.tsx:91` and `Pantry.tsx` (pending "Offline — will sync" pill).

**Remaining work for item 3: none.** Only verification: devtools offline toggle + reload-while-offline + reconnect, per the plan's own verification section. (Nice-to-have: also test on-device in Capacitor, where the webview fires the same `online` event.)

---

## 4. Phase 0 item 4 — Optimistic UI — **~85% already true by construction**

Evidence from `master`:
- `src/lib/familyos.ts:293–296` — `saveJSON(key, value)` = `localStorage.setItem` **then** `pushToCloud(key, value)` (fire-and-forget). Every section writes through `saveJSON`, so **local state updates are already immediate** — the cloud round-trip never blocks the UI.
- Components subscribe via `onSyncUpdate` (`Shopping.tsx:43–48`) and re-read `loadJSON` when a remote change or 409-adoption lands → reconciliation exists.
- Offline → writes queue (§3) → flush on reconnect → `notifyListeners('*')` re-renders sections.

**Actual remaining gaps (small):**
1. `useWriteQueued` pending indicator is wired only into **Shopping + Pantry**. Extend to the other write-heavy sections: tasks/FamilyHub, MealPlanner, QualityTime/Promises (same 3-line pattern as `Shopping.tsx:91,97`).
2. **Silent 409:** when a conflict resolves in the cloud's favor (`sync.ts:184–191`), the user's edit is replaced with no feedback. Add a one-time toast ("Updated from another device") — reuses the existing `onSyncUpdate(key)` notify path; no new infra.
3. Verify per-section that no write path bypasses `saveJSON` (grep for direct `localStorage.setItem` mutations of the same keys) — worth a quick audit pass during implementation, not pre-scoped.

**Do not** build a new sync layer or a separate optimistic-state layer — the plan's own warning; it would duplicate what `sync.ts` already does.

---

## 5. Recommended implementation order (for Claude Code, one pass)

1. Branch off `master` (see Q7). Copy the spec doc into the branch if not already there.
2. `device_tokens` migration → `_db.ts` helpers → `register-push-token.ts` (server half).
3. `_notify.ts` `notifyPush` + FCM plumbing (Web Crypto JWT — unit-testable in isolation with a fake SA JSON).
4. Wire the 4 webhook call sites + `finance-sync.ts` daily summary (this completes items 1+2 together).
5. Client: `src/lib/push.ts` + `AppContext` anchor + `AndroidManifest.xml` + `package.json` + `npx cap sync android`.
6. Human block: Firebase console setup (Q1/Q2) + `FIREBASE_SERVICE_ACCOUNT` env + device build.
7. Items 3–4: only the two small gaps in §4, then the verification matrix below.

## 6. Verification matrix (per plan's Phase 0 section)

- Push: debug APK with `google-services.json` present → login → permission prompt → `device_tokens` row appears → trigger each of the 4 webhook paths (or mock POSTs) → notification within seconds. Also verify prune: uninstall/reinstall changes token, old token row cleaned on next send error.
- Daily summary: force `finance-sync` (or call `runDailyBrainChecks` with a mock) → exactly 1 notification per household when counts > 0, none when all empty.
- Offline: devtools offline → make edits → reload → back online → queue flushes, no lost writes, no stale-clobber.
- Optimistic: toggle an item → UI flips instantly; simulate 409 → UI adopts cloud value (+ toast if gap 2 shipped).
- Regression: `npm run lint && npm test && npm run build`.
