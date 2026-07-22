# Native Push Notifications (FCM) — Design

Date: 2026-07-22

## Problem

The Bear House Android app (Capacitor) has no native push notification path. The only
notification mechanism today is `notifyIFTTT` (`api/_notify.ts`), an out-of-band webhook
to IFTTT Maker Webhooks — not an in-app push, and dependent on an IFTTT applet + the
user's separate phone automation. `AndroidManifest.xml` has no `POST_NOTIFICATIONS`
permission and no FCM/`@capacitor/push-notifications` integration exists, though
`android/app/build.gradle` already has a conditional `google-services` plugin block
waiting for a `google-services.json` that was never added.

## Scope

**In scope:**
- Native Android push via Firebase Cloud Messaging (FCM), reusing the existing Firebase
  project ("Dysfunction Junction", `prime-mechanic-463314-m8`).
- Household-wide broadcast (no per-user targeting) — every device registered by any
  member of a household receives every push sent to that household.
- Triggers: the 4 existing `notifyIFTTT` call sites (shopping/chore item notify flag,
  package delivered, door left open, health-check alerts) plus a new trigger on
  HermesChat message send.
- Runs **alongside** `notifyIFTTT`, not replacing it.

**Out of scope (explicitly deferred):**
- Per-user/per-device targeting or exclusion (e.g. not pinging the sender's own device).
- iOS push.
- The separate "rename app to FamilyOS" project — this spec uses the current real
  Android package id, `com.bearhouse.app`.
- Removing or changing `notifyIFTTT`.

## Firebase / Android setup

- Reuse Firebase project `prime-mechanic-463314-m8`. It already has an Android app
  registered, but under package name `com.bearhouse.familyos`, which does not match
  this app's actual `capacitor.config.json` appId (`com.bearhouse.app`).
- Register a **new** Android app in the same Firebase project under `com.bearhouse.app`.
  Download its `google-services.json` into `android/app/google-services.json`.
  `android/app/build.gradle` already applies the `google-services` Gradle plugin
  conditionally when that file exists — no Gradle changes needed.
- Add `@capacitor/push-notifications` to `package.json` and run `npx cap sync android`.
- Add `POST_NOTIFICATIONS` permission to `AndroidManifest.xml` (required on Android 13+).

## Client-side flow

- New `src/lib/push.ts`:
  - `registerForPush()`: requests notification permission via
    `@capacitor/push-notifications`, obtains the FCM token via the plugin's
    `registration` event, and POSTs `{ token, platform: 'android' }` to
    `api/register-push-token.ts` with the user's Supabase access token
    (`Authorization: Bearer <token>`).
  - Call `registerForPush()` once, right after a successful login lands the user on
    the dashboard (same point where `AppContext` resolves the household session) —
    not gated behind a Settings toggle.
  - No foreground-notification-tap deep-linking in this scope — a received push just
    surfaces as a system notification; tapping it opens the app to its default screen
    (Capacitor's default behavior needs no extra code for this).
- HermesChat's send-message path gets a new call to trigger a server-side push (see
  below) after a message is successfully persisted.

## Server-side

### `api/register-push-token.ts` (new)
- POST only. Reads `Authorization: Bearer <token>`, resolves `household_id` via the
  existing `resolveHouseholdId(accessToken)` in `api/_db.ts` (401 if it returns null).
- Upserts `(household_id, token, platform, updated_at)` into `device_tokens` via the
  `service_role` key, matching the fetch-based REST pattern used throughout `api/_db.ts`
  (no Supabase SDK, works under the Edge runtime). Conflict target: `token` (a token
  string is unique per device install; re-registering just refreshes `updated_at` and
  reassigns `household_id` if it changed, e.g. after a Supabase account switch).

### `api/_notify.ts` — add `notifyPush`
```
export async function notifyPush(householdId: string, title: string, body: string): Promise<void>
```
- Loads all `device_tokens` rows for `householdId` via a new `_db.ts` helper
  `dbGetPushTokensByHouseholdId(householdId)`.
- Sends via `firebase-admin`'s FCM HTTP v1 messaging API (`getMessaging().sendEachForMulticast`
  or per-token `send`, whichever the admin SDK version bundled supports — implementer's
  call at build time). Initializes `firebase-admin` once from `FIREBASE_SERVICE_ACCOUNT`
  (a JSON string env var, `JSON.parse`d, passed to `cert()`).
- On a send result reporting `messaging/registration-token-not-registered` (or
  equivalent invalid-token error) for a given token, delete that row from
  `device_tokens` — self-cleaning, no separate cron needed.
- Wrapped in the same try/catch-and-swallow pattern as `notifyIFTTT`: a push failure
  must never break the caller's actual data write. Runs independently of and in
  addition to any `notifyIFTTT` call at the same call site (not a replacement).

### Call sites (mirrors existing `notifyIFTTT` calls)
- `api/webhook.ts:85` — after `notifyIFTTT` when `body?.notify`, also call
  `notifyPush(householdId, 'New item', text)`.
- `api/ha-webhook.ts:49` (package_delivered) and `:55` (door_left_open) — same pairing.
- `api/health-check.ts:91` — same pairing.
- New: HermesChat's message-send server path — after a chat message is persisted,
  call `notifyPush(householdId, senderName, messageText)`. Since broadcast is
  household-wide, this pings every registered device including the sender's own
  other devices (no exclusion logic in scope).

### New Supabase table: `device_tokens`
```sql
create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
- No public RLS policy (reads/writes only via `service_role`, consistent with
  `family_data` and other write-path tables per `[[familyos-auth-is-client-side]]` /
  the multi-tenant RLS pattern already in place).

### New env var
- `FIREBASE_SERVICE_ACCOUNT` — the Firebase service account JSON (as a string) for
  project `prime-mechanic-463314-m8`, added to Vercel env vars alongside
  `IFTTT_WEBHOOKS_KEY` and `SUPABASE_SERVICE_KEY`.

## Error handling

- Every layer fails soft: a missing `FIREBASE_SERVICE_ACCOUNT` env var makes
  `notifyPush` a no-op (mirrors `notifyIFTTT`'s `if (!key) return;` guard); a send
  failure is caught and swallowed; an invalid token is pruned rather than retried.
- `api/register-push-token.ts` returns 401 for an unverified/expired access token,
  matching `api/setup.ts`'s existing convention.

## Testing

- Manual: install a debug build with `google-services.json` present, log in, confirm
  the permission prompt appears and a token gets POSTed to
  `api/register-push-token.ts` (check the `device_tokens` row).
- Manual: trigger each of the 4 existing webhook paths (or a mock POST to
  `api/webhook.ts`/`api/ha-webhook.ts`/`api/health-check.ts`) and confirm a system
  notification arrives on the device within a few seconds.
- Manual: send a HermesChat message from a second logged-in device/session and
  confirm a push arrives.
- No new automated test suite is proposed — this codebase has no existing test
  harness for `api/*.ts` webhook handlers to extend.
