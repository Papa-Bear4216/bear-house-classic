# Native Push Notifications (FCM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native Android push notifications via Firebase Cloud Messaging, broadcast household-wide, triggered from the 4 existing server events that currently only fire `notifyIFTTT`.

**Architecture:** Client registers an FCM token on login and POSTs it to a new Supabase-backed endpoint. Server-side, a new `notifyPush(householdId, title, body)` helper in `api/_notify.ts` loads that household's tokens and sends via the FCM HTTP v1 REST API — using a hand-rolled Web Crypto JWT + OAuth2 exchange instead of `firebase-admin`, because every API route here runs on Vercel Edge Runtime, which cannot load Node SDKs. `notifyPush` is called alongside (never instead of) each existing `notifyIFTTT` call.

**Tech Stack:** Capacitor 8 (`@capacitor/push-notifications`), Vercel Edge Functions (TypeScript, Web Crypto API, no npm SDKs for the send path), Supabase REST (fetch-based, `service_role` key), Firebase project `prime-mechanic-463314-m8` ("Dysfunction Junction").

## Global Constraints

- Runs alongside `notifyIFTTT`, never replaces or removes it.
- Household-wide broadcast only — no per-user/per-device targeting or exclusion.
- Android only, no iOS.
- Uses the existing Firebase project `prime-mechanic-463314-m8`; registers a **new** Android app under `com.bearhouse.app` (the real, current package id — do not use `com.bearhouse.familyos`, which is a stale/mismatched entry already in that project).
- No `firebase-admin` or any Node-only SDK in `api/*.ts` — those files run under `export const config = { runtime: 'edge' }` and only support Web APIs (`fetch`, `crypto.subtle`, etc).
- No HermesChat trigger (out of scope — see spec's "Out of scope" section for why).
- Every send path fails soft: a missing env var or a send error must never throw out of `notifyPush` and must never block the caller's actual data write (same contract as `notifyIFTTT`).

---

## Task 1: Firebase Android app + `google-services.json`

**Files:**
- Create: `android/app/google-services.json`
- Modify: `capacitor.config.ts` — no change expected (already `com.bearhouse.app`), verify only.

**Interfaces:**
- Produces: `android/app/google-services.json` present on disk, matched to package `com.bearhouse.app` in Firebase project `prime-mechanic-463314-m8`. `android/app/build.gradle`'s existing conditional block (lines ~56-61) picks this up automatically — no gradle edits.

- [ ] **Step 1: Register a new Android app in the Firebase project**

Using the Firebase MCP tool `firebase_create_app` (or the Firebase console if the tool requires an interactive flow it can't complete), create an Android app in project `prime-mechanic-463314-m8` with package name `com.bearhouse.app`. Do not touch or delete the existing `com.bearhouse.familyos` app entry — leave it as-is.

- [ ] **Step 2: Fetch the SDK config and write `google-services.json`**

Call `firebase_get_sdk_config` with `platform: "android"` (or the new app's `app_id`) to retrieve the config. Vercel/Firebase MCP returns a JSON config object — write it verbatim as `android/app/google-services.json` in the standard Firebase-downloaded format (it must include `project_info`, `client` array with `package_name: "com.bearhouse.app"`, `api_key`, etc — this is what Google Play Services parses at app startup).

- [ ] **Step 3: Verify Gradle picks it up**

Run:
```
cd android && ./gradlew :app:assembleDebug --dry-run
```
Expected: no errors about the google-services plugin; if you want a stronger signal, run a full `./gradlew :app:assembleDebug` and confirm no `google-services.json` warning appears in the log (the existing `logger.info(...)` line in `android/app/build.gradle` only fires when the file is absent).

- [ ] **Step 4: Commit**

```bash
git add android/app/google-services.json
git commit -m "chore: add google-services.json for com.bearhouse.app FCM"
```

---

## Task 2: `device_tokens` Supabase table

**Files:**
- Create: `docs/sql/create-device-tokens.sql` (tracked copy of the migration, matching this repo's existing convention of keeping applied SQL files in `docs/` — see `docs/fix-family-data-rls.sql` referenced in `api/_db.ts`'s comments)

**Interfaces:**
- Produces: table `device_tokens(id uuid, household_id uuid, token text unique, platform text, created_at timestamptz, updated_at timestamptz)` in the live Supabase project, no public RLS policy (writes only via `service_role`).

- [ ] **Step 1: Write the migration SQL**

```sql
-- docs/sql/create-device-tokens.sql
create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table device_tokens enable row level security;
-- No policies defined: RLS enabled with zero policies means anon/authenticated
-- roles get zero rows and zero writes by default. Only the service_role key
-- (which bypasses RLS entirely) can read/write this table — matching the
-- family_data / household_members write-path pattern used elsewhere.
```

- [ ] **Step 2: Apply it to the live Supabase project**

Run this SQL against the Supabase project at `https://zjialvdolbkccduuwsck.supabase.co` (the URL hardcoded in `api/_db.ts`/`api/setup.ts`) via the Supabase SQL editor or CLI. There is no local/test Supabase instance in this repo, so this step is applied directly to the real project, consistent with how `docs/fix-family-data-rls.sql` was applied previously.

- [ ] **Step 3: Verify the table exists and RLS blocks anon**

```bash
curl -s "https://zjialvdolbkccduuwsck.supabase.co/rest/v1/device_tokens?select=id&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY"
```
Expected: `[]` (empty array, 200 OK) or a permission-denied-shaped response — NOT a "relation does not exist" error, and NOT actual row data (there shouldn't be any yet either way, but confirm no unexpected 500).

- [ ] **Step 4: Commit**

```bash
git add docs/sql/create-device-tokens.sql
git commit -m "feat: add device_tokens table for push notification registration"
```

---

## Task 3: `dbGetPushTokensByHouseholdId` and token upsert/delete helpers in `api/_db.ts`

**Files:**
- Modify: `api/_db.ts`

**Interfaces:**
- Consumes: existing `headers(key: string)` helper (api/_db.ts:12-18), `SUPABASE_URL` constant (api/_db.ts:10), `process.env.SUPABASE_SERVICE_KEY`.
- Produces:
  - `export async function dbGetPushTokensByHouseholdId(householdId: string): Promise<string[]>`
  - `export async function dbUpsertPushToken(householdId: string, token: string, platform: string): Promise<void>`
  - `export async function dbDeletePushToken(token: string): Promise<void>`

- [ ] **Step 1: Add the three functions to `api/_db.ts`**

Append to the end of `api/_db.ts` (after `dbCreateHouseholdMember`):

```typescript
/** All FCM device tokens registered for a household (for push broadcast). */
export async function dbGetPushTokensByHouseholdId(householdId: string): Promise<string[]> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/device_tokens?household_id=eq.${encodeURIComponent(householdId)}&select=token`,
    { headers: headers(serviceKey) }
  );
  if (!res.ok) return [];
  const rows = await res.json() as any[];
  return rows.map((r) => r.token);
}

/** Register or refresh a device's push token for a household (upsert on token). */
export async function dbUpsertPushToken(householdId: string, token: string, platform: string): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/device_tokens`, {
    method: 'POST',
    headers: { ...headers(serviceKey), 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ household_id: householdId, token, platform, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`dbUpsertPushToken failed: ${res.status} ${detail}`);
  }
}

/** Remove a device token — called when FCM reports it as unregistered/invalid. */
export async function dbDeletePushToken(token: string): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!;
  await fetch(`${SUPABASE_URL}/rest/v1/device_tokens?token=eq.${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: headers(serviceKey),
  });
}
```

- [ ] **Step 2: Type-check**

Run:
```
npx tsc --noEmit -p .
```
Expected: no new type errors introduced (pre-existing errors, if any, are unrelated — only confirm nothing new appears referencing `_db.ts`).

- [ ] **Step 3: Commit**

```bash
git add api/_db.ts
git commit -m "feat: add device_tokens read/upsert/delete helpers to api/_db.ts"
```

---

## Task 4: FCM sender (`notifyPush`) in `api/_notify.ts`

**Files:**
- Modify: `api/_notify.ts`

**Interfaces:**
- Consumes: `dbGetPushTokensByHouseholdId`, `dbDeletePushToken` from `./_db.js` (Task 3); `process.env.FIREBASE_SERVICE_ACCOUNT`.
- Produces: `export async function notifyPush(householdId: string, title: string, body: string): Promise<void>`

- [ ] **Step 1: Add the JWT-signing + OAuth2 token exchange + FCM send logic**

Append to `api/_notify.ts`:

```typescript
import { dbGetPushTokensByHouseholdId, dbDeletePushToken } from './_db.js';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) return cachedAccessToken.token;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const unsigned = `${header}.${claimSet}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`FCM OAuth2 token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

/**
 * Native FCM push, broadcast to every device registered for a household.
 * Best-effort — never let a notification failure break the caller.
 */
export async function notifyPush(householdId: string, title: string, body: string): Promise<void> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return;

  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    const tokens = await dbGetPushTokensByHouseholdId(householdId);
    if (tokens.length === 0) return;

    const accessToken = await getFcmAccessToken(sa);

    await Promise.all(tokens.map(async (token) => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ message: { token, notification: { title, body } } }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          if (detail.includes('UNREGISTERED') || detail.includes('NOT_FOUND')) {
            await dbDeletePushToken(token);
          }
        }
      } catch {
        // best-effort per-token — one bad token must not stop the others
      }
    }));
  } catch {
    // best-effort — never let a notification failure break the caller
  }
}
```

- [ ] **Step 2: Type-check**

Run:
```
npx tsc --noEmit -p .
```
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add api/_notify.ts
git commit -m "feat: add notifyPush FCM sender (Edge-compatible, no firebase-admin)"
```

---

## Task 5: `api/register-push-token.ts` endpoint

**Files:**
- Create: `api/register-push-token.ts`

**Interfaces:**
- Consumes: `resolveHouseholdId(accessToken: string): Promise<string | null>` from `./_db.js` (existing), `dbUpsertPushToken(householdId, token, platform)` from `./_db.js` (Task 3).
- Produces: `POST /api/register-push-token` — body `{ token: string, platform?: string }`, header `Authorization: Bearer <supabase access token>`. Returns `{ ok: true }` on success, `{ error: string }` with 401/400 on failure.

- [ ] **Step 1: Write the endpoint**

```typescript
// api/register-push-token.ts
export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbUpsertPushToken } from './_db.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({})) as any;
  const token = (body.token || '').trim();
  if (!token) return j({ error: 'Missing token' }, 400);
  const platform = (body.platform || 'android').trim();

  await dbUpsertPushToken(householdId, token, platform);
  return j({ ok: true });
}
```

- [ ] **Step 2: Manual smoke test against the live endpoint (requires a valid Supabase session token)**

```bash
curl -s -X POST "https://<deployment-url>/api/register-push-token" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -d '{"token":"test-token-123","platform":"android"}'
```
Expected: `{"ok":true}`. Then confirm via Supabase REST (service key) that a `device_tokens` row exists with `token = 'test-token-123'`. Delete that test row afterward.

- [ ] **Step 3: Commit**

```bash
git add api/register-push-token.ts
git commit -m "feat: add api/register-push-token endpoint"
```

---

## Task 6: Wire `notifyPush` into the 4 existing `notifyIFTTT` call sites

**Files:**
- Modify: `api/webhook.ts:85`
- Modify: `api/ha-webhook.ts:49`, `api/ha-webhook.ts:55`
- Modify: `api/health-check.ts:91`

**Interfaces:**
- Consumes: `notifyPush(householdId: string, title: string, body: string): Promise<void>` from `./_notify.js` (Task 4).

- [ ] **Step 1: `api/webhook.ts` — add the import and call**

Modify the import line:
```typescript
import { notifyIFTTT, notifyPush } from './_notify.js';
```

Modify line 85 from:
```typescript
  if (body?.notify) await notifyIFTTT(`bearhouse_${type}`, (item as any).text || (item as any).name || 'New item', (item as any).person || '');
```
to:
```typescript
  if (body?.notify) {
    const text = (item as any).text || (item as any).name || 'New item';
    await notifyIFTTT(`bearhouse_${type}`, text, (item as any).person || '');
    await notifyPush(householdId, 'New item', text);
  }
```

- [ ] **Step 2: `api/ha-webhook.ts` — add the import and calls**

Modify the import line:
```typescript
import { notifyIFTTT, notifyPush } from './_notify.js';
```

Modify line 49 from:
```typescript
      if (!r.skipped) await notifyIFTTT('bearhouse_package', 'Package delivered', 'Front door');
```
to:
```typescript
      if (!r.skipped) {
        await notifyIFTTT('bearhouse_package', 'Package delivered', 'Front door');
        await notifyPush(householdId, 'Package delivered', 'Front door');
      }
```

Modify line 55 from:
```typescript
      if (!r.skipped) await notifyIFTTT('bearhouse_door_open', area || 'A door', 'left open');
```
to:
```typescript
      if (!r.skipped) {
        await notifyIFTTT('bearhouse_door_open', area || 'A door', 'left open');
        await notifyPush(householdId, area || 'A door', 'left open');
      }
```

- [ ] **Step 3: `api/health-check.ts` — add the import and call**

Modify the import line:
```typescript
import { notifyIFTTT, notifyPush } from './_notify.js';
```

Modify line 91 from:
```typescript
        await notifyIFTTT('bearhouse_health', `${fix.label} needs attention`, fix.keyUrl || 'Open Home Assistant', reconfig);
```
to:
```typescript
        await notifyIFTTT('bearhouse_health', `${fix.label} needs attention`, fix.keyUrl || 'Open Home Assistant', reconfig);
        await notifyPush(householdId, `${fix.label} needs attention`, fix.keyUrl || 'Open Home Assistant');
```

- [ ] **Step 4: Type-check all four files**

```bash
npx tsc --noEmit -p .
```
Expected: no new type errors. In particular confirm `householdId` is an in-scope variable at each edited call site (it already is in all four files — each resolves `householdId` earlier in the same handler via `resolveHouseholdIdByWebhookToken`).

- [ ] **Step 5: Commit**

```bash
git add api/webhook.ts api/ha-webhook.ts api/health-check.ts
git commit -m "feat: trigger notifyPush alongside notifyIFTTT at all 4 existing call sites"
```

---

## Task 7: Client — `@capacitor/push-notifications`, manifest permission, `src/lib/push.ts`

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `src/lib/push.ts`
- Modify: `src/contexts/AppContext.tsx`

**Interfaces:**
- Consumes: `authedFetch(url, init)` from `@/lib/householdAuth` (existing, `src/lib/householdAuth.ts:74-80`).
- Produces: `export async function registerForPush(): Promise<void>` in `src/lib/push.ts`, called from `AppContext.tsx`'s `loadUserAndHousehold`.

- [ ] **Step 1: Install the plugin**

```bash
npm install @capacitor/push-notifications
npx cap sync android
```

- [ ] **Step 2: Add the manifest permission**

In `android/app/src/main/AndroidManifest.xml`, add after the existing `ACCESS_COARSE_LOCATION` line (line 56):
```xml
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

- [ ] **Step 3: Write `src/lib/push.ts`**

```typescript
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { authedFetch } from './householdAuth';

/** Request permission and register this device's FCM token with the server.
 *  No-ops on web (native-only feature) and swallows all errors — push
 *  registration must never block app usage. Call once per login. */
export async function registerForPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    await PushNotifications.removeAllListeners();
    PushNotifications.addListener('registration', async (token) => {
      try {
        await authedFetch('/api/register-push-token', {
          method: 'POST',
          body: JSON.stringify({ token: token.value, platform: 'android' }),
        });
      } catch {
        // best-effort — a failed registration retries next login
      }
    });

    await PushNotifications.register();
  } catch {
    // best-effort — push setup must never block app usage
  }
}
```

- [ ] **Step 4: Call it from `AppContext.tsx` after household session resolves**

In `src/contexts/AppContext.tsx`, add the import:
```typescript
import { registerForPush } from '@/lib/push';
```

In `loadUserAndHousehold`, after `setHouseholdMembers(users);` (the last line before the function ends, right before its closing brace), add:
```typescript
      registerForPush();
```
(fire-and-forget — do not `await` it, since it must not delay rendering the dashboard).

- [ ] **Step 5: Build and verify no compile errors**

```bash
npm run build
npx cap sync android
```
Expected: build succeeds with no TypeScript errors referencing `src/lib/push.ts` or `src/contexts/AppContext.tsx`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json android/app/src/main/AndroidManifest.xml src/lib/push.ts src/contexts/AppContext.tsx
git commit -m "feat: register FCM push token on login (Android)"
```

---

## Task 8: `FIREBASE_SERVICE_ACCOUNT` env var + end-to-end manual verification

**Files:**
- None (env var configuration + manual test only — no code changes).

**Interfaces:**
- Consumes: everything from Tasks 1-7.

- [ ] **Step 1: Generate a service account key for the Firebase project**

In the Firebase console (or via Firebase MCP if it exposes this — otherwise Google Cloud Console → IAM & Admin → Service Accounts) for project `prime-mechanic-463314-m8`, create a service account with the "Firebase Cloud Messaging API" role (or use the default Firebase Admin SDK service account, which already has this), and generate a JSON key.

- [ ] **Step 2: Add it to Vercel**

Add `FIREBASE_SERVICE_ACCOUNT` as a Vercel environment variable, value = the full JSON key file contents as a single-line string (matching how `SUPABASE_SERVICE_KEY`/`IFTTT_WEBHOOKS_KEY` are already configured). Redeploy for the env var to take effect.

- [ ] **Step 3: Install a debug build on a real Android device**

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```
Install the resulting APK, log in with a Google account tied to a household member.

- [ ] **Step 4: Confirm token registration**

Check (via Supabase REST with the service key, or the SQL editor) that a `device_tokens` row now exists for that household with a fresh `token`.

```bash
curl -s "https://zjialvdolbkccduuwsck.supabase.co/rest/v1/device_tokens?select=*" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```
Expected: at least one row.

- [ ] **Step 5: Trigger each of the 4 push paths and confirm a notification arrives on-device**

Package delivered / door left open (via `api/ha-webhook.ts`, needs the household's webhook token):
```bash
curl -s -X POST "https://<deployment-url>/api/ha-webhook?token=<household-webhook-token>" \
  -H "Content-Type: application/json" \
  -d '{"event":"package_delivered"}'
```
Expected: Android system notification titled "Package delivered" appears within a few seconds, in addition to whatever the existing IFTTT applet does.

Shopping/chore item notify flag (via `api/webhook.ts`):
```bash
curl -s -X POST "https://<deployment-url>/api/webhook?token=<household-webhook-token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"shopping","text":"Milk","notify":true}'
```
Expected: system notification titled "New item" with body "Milk".

Health-check alert: trigger via whatever existing mechanism calls `api/health-check.ts` (its own cron/manual trigger — check `docs/superpowers/plans/2026-07-12-familyos-reliability.md` for how it's normally invoked) and confirm a matching push arrives.

- [ ] **Step 6: Confirm `notifyIFTTT` still fires (regression check)**

For at least one of the triggers above, confirm the pre-existing IFTTT-driven notification (if you still have that applet active) also still arrives — proving `notifyPush` was added alongside, not instead of, the existing path.

- [ ] **Step 7: No commit for this task** (env var + manual verification only; if any bugs were found and fixed during verification, commit those fixes with a clear message referencing which step surfaced them).

---

## Self-Review Notes

- **Spec coverage:** Firebase/Android setup → Task 1. Client permission + registration → Task 7. `device_tokens` table → Task 2. `notifyPush` + FCM send (Edge-compatible) → Tasks 3-4. `api/register-push-token.ts` → Task 5. All 4 call sites → Task 6. Env var + error-handling contract (fail-soft) → Task 4 (built-in) + Task 8. Testing section of the spec → Task 8. HermesChat trigger is explicitly out of scope per the spec's correction and has no task here.
- **Type consistency:** `notifyPush(householdId: string, title: string, body: string)` matches across Task 4 (definition) and Task 6 (all call sites). `dbGetPushTokensByHouseholdId`/`dbUpsertPushToken`/`dbDeletePushToken` signatures match between Task 3 (definition) and Tasks 4-5 (usage). `registerForPush()` takes no args and returns `Promise<void>` consistently between Task 7's definition and its call site.
- **No placeholders:** every step has literal code, exact file paths/line numbers, and concrete commands with expected output.
