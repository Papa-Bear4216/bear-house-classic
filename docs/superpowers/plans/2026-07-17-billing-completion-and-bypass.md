# Billing Completion + Creator Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit the already-built Stripe billing feature, wire `/setup` to redirect new households straight into Checkout instead of dead-ending at a lockout screen, and add a creator-only `bypass_billing` flag that exempts specific households from the paywall.

**Architecture:** The billing backend (Checkout, webhook, seat sync, portal, auth guard) and gating UI (`BillingPanel`, `BillingLockedPage`, the `App.tsx` subscription gate) already exist in the working tree, untracked. This plan commits that work unmodified, then adds two small deltas: a post-signup Checkout redirect, and a `bypass_billing` boolean column that OR's into the existing gate condition.

**Tech Stack:** Stripe (`stripe` npm package, already installed), Vercel Edge Functions (`api/*.ts`), Supabase (Postgres + Auth), React Router.

## Global Constraints

- No free tier: any household with `subscription_status` not `'active'` AND `bypass_billing` not `true` is blocked from the dashboard — per `docs/superpowers/specs/2026-07-17-billing-completion-and-bypass-design.md`.
- `bypass_billing` must have **no client-writable path** — no API endpoint sets it, ever. It is set only via direct SQL/Supabase dashboard by the app creator. Do not add an endpoint for it in this plan, even a role-gated one.
- Grandfathered household #1 (`subscription_status = 'active'` set directly in SQL) must remain unaffected by every change here — the bypass is an additional OR condition, never a replacement.
- A bypassed household sees **zero** billing UI — `BillingPanel` must return `null` for it, same as it already does for non-admin roles.
- This app has no test runner configured. Verification is via `npx vite build`, the per-file strict `tsc --noEmit` invocation already used elsewhere in this repo for `api/*.ts` files, and manual browser/curl verification.
- Stripe test-mode Price IDs (already created, reuse verbatim): base `price_1Tthsz5zqyWwiYPrycN9pJNb` ($9.99/mo), seat `price_1Ttht15zqyWwiYPrsCz4OXZI` ($2.99/mo).

---

### Task 1: Commit the existing billing feature as-is

**Files:**
- Add (untracked → tracked, no content changes): `api/_stripe.ts`, `api/_billingAuth.ts`, `api/billing-checkout.ts`, `api/billing-portal.ts`, `api/billing-seats.ts`, `api/stripe-webhook.ts`, `src/components/familyos/BillingPanel.tsx`, `src/pages/BillingLocked.tsx`
- Commit (already modified in working tree, no content changes): `src/App.tsx`, `src/contexts/AppContext.tsx`, `src/lib/householdAuth.ts`, `src/components/familyos/SettingsModal.tsx`, `src/pages/Index.tsx`, `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `getStripeClient(): Stripe` (`api/_stripe.ts`); `requireBillingRole(req, householdId): Promise<{ok:true}|{ok:false,status,error}>` (`api/_billingAuth.ts`); `POST /api/billing-checkout` accepting `{householdId}` returning `{url}`; `POST /api/billing-portal` accepting `{householdId}` returning `{url}`; `POST /api/billing-seats` accepting `{householdId}` returning `{seats, extraSeats}`; `POST /api/stripe-webhook` (Stripe-signed); `<BillingPanel />` component; `<BillingLockedPage />` component; `useAppContext().subscriptionStatus: string | null`.

This task does not write new code — it verifies the existing untracked/modified files are correct as understood, then commits them verbatim. If any step below finds a defect, fix it minimally before committing (do not silently accept a known bug).

- [ ] **Step 1: Confirm the files match expectations**

Run:
```bash
git status --porcelain --untracked-files=all
```
Expected: the eight untracked billing files plus `package.json`/`package-lock.json`/`src/App.tsx`/`src/components/familyos/SettingsModal.tsx`/`src/contexts/AppContext.tsx`/`src/lib/householdAuth.ts`/`src/pages/Index.tsx` as modified, and no unrelated changes mixed in (aside from any legitimate scratch files like `nul`/`free-claude-code/`, which this task does not touch).

- [ ] **Step 2: Typecheck the billing API routes**

Run:
```bash
npx tsc --noEmit --target ES2022 --lib ES2023,DOM --module ESNext --moduleResolution bundler --allowImportingTsExtensions --isolatedModules --moduleDetection force --strict --skipLibCheck api/_stripe.ts api/_billingAuth.ts api/billing-checkout.ts api/billing-portal.ts api/billing-seats.ts api/stripe-webhook.ts
```
Expected: no output (clean pass). If errors appear, fix them before proceeding — do not commit code that fails strict typecheck.

- [ ] **Step 3: Build the full app**

Run: `npx vite build`
Expected: succeeds (same warning-only output pattern as prior builds in this repo — chunk-size warning is pre-existing and fine, no new errors).

- [ ] **Step 4: Commit**

```bash
git add api/_stripe.ts api/_billingAuth.ts api/billing-checkout.ts api/billing-portal.ts api/billing-seats.ts api/stripe-webhook.ts src/components/familyos/BillingPanel.tsx src/pages/BillingLocked.tsx src/App.tsx src/contexts/AppContext.tsx src/lib/householdAuth.ts src/components/familyos/SettingsModal.tsx src/pages/Index.tsx package.json package-lock.json
git commit -m "feat(billing): add Stripe subscription billing

Checkout (per-seat: $9.99/mo base covers 3 seats, $2.99/mo per
additional authenticating member), a webhook to sync
households.subscription_status, seat-count reconciliation, and a
Stripe-hosted billing portal for admins. Every billing-mutating
endpoint verifies the caller's Supabase session server-side and
requires superadmin/admin role via requireBillingRole(). Dashboard
is gated behind subscription_status === 'active' via a new AuthedApp
wrapper in App.tsx; BillingLockedPage is the fallback screen."
```

---

### Task 2: Add `bypass_billing` column migration

**Files:**
- Create: `supabase/migrations/20260717000000_add_bypass_billing.sql`

**Interfaces:**
- Produces: `households.bypass_billing boolean not null default false`.

- [ ] **Step 1: Write the migration**

```sql
-- 20260717000000_add_bypass_billing.sql
-- Creator-only exemption from the subscription paywall. No API endpoint
-- writes this column — it is set only via direct SQL/Supabase dashboard,
-- by design (see docs/superpowers/specs/2026-07-17-billing-completion-and-bypass-design.md).
alter table households
  add column bypass_billing boolean not null default false;
```

- [ ] **Step 2: Apply the migration**

Run (via whichever mechanism this repo already uses to apply migrations to
the live Supabase project — check `supabase/config.toml` or prior migration
commit messages for the established method; if the Supabase CLI is linked,
`supabase db push`; otherwise paste the SQL directly into the Supabase
Dashboard's SQL editor, matching how the `family_data_composite_key`
migration was applied per its commit history).

- [ ] **Step 3: Verify the column exists**

Run this query in the Supabase SQL editor (or via the CLI) and confirm it
returns a row with `bypass_billing = false` for every existing household:
```sql
select id, name, subscription_status, bypass_billing from households;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260717000000_add_bypass_billing.sql
git commit -m "feat(billing): add households.bypass_billing column

Creator-only exemption from the subscription paywall. Defaults false
for every household, including the grandfathered household #1. No
API endpoint writes this column by design — set only via direct
SQL/Supabase dashboard."
```

---

### Task 3: Thread `bypass_billing` through the session/context and gate

**Files:**
- Modify: `src/lib/householdAuth.ts`
- Modify: `src/contexts/AppContext.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/familyos/BillingPanel.tsx`

**Interfaces:**
- Consumes: `households.bypass_billing` (Task 2).
- Produces: `getHouseholdSession(): Promise<{member, householdId, subscriptionStatus, bypassBilling: boolean} | null>`; `useAppContext().bypassBilling: boolean`.

- [ ] **Step 1: Extend `getHouseholdSession()`'s query and return shape**

In `src/lib/householdAuth.ts`, change the select and return statement:

```typescript
export async function getHouseholdSession(): Promise<{ member: HouseholdMember; householdId: string; subscriptionStatus: string; bypassBilling: boolean } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from('household_members')
    .select('id, household_id, name, email, role, color, households(subscription_status, bypass_billing)')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (error) console.warn('getHouseholdSession: household_members lookup failed:', error.message);
  if (error || !data) return null;

  return {
    householdId: data.household_id,
    subscriptionStatus: (data as any).households?.subscription_status ?? 'none',
    bypassBilling: (data as any).households?.bypass_billing ?? false,
    member: {
      id: data.id,
      householdId: data.household_id,
      name: data.name,
      email: data.email,
      role: data.role as HouseholdRole,
      color: data.color,
    },
  };
}
```

- [ ] **Step 2: Add `bypassBilling` to `AppContext`**

In `src/contexts/AppContext.tsx`:

Add to `AppContextType` (after `subscriptionStatus: string | null;`):
```typescript
  bypassBilling: boolean;
```

Add to `defaultAppContext` (after `subscriptionStatus: null,`):
```typescript
  bypassBilling: false,
```

Add state (after `const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);`):
```typescript
  const [bypassBilling, setBypassBilling] = useState(false);
```

In `loadUserAndHousehold`'s no-session branch (after `setSubscriptionStatus(null);`):
```typescript
        setBypassBilling(false);
```

After `setSubscriptionStatus(session.subscriptionStatus);`:
```typescript
      setBypassBilling(session.bypassBilling);
```

In `logout` (after `setSubscriptionStatus(null);`):
```typescript
    setBypassBilling(false);
```

In the `<AppContext.Provider value={{...}}>` object (after `subscriptionStatus,`):
```typescript
        bypassBilling,
```

- [ ] **Step 3: Update the gate in `src/App.tsx`**

Find the existing gate in `AuthedApp`:
```tsx
const { subscriptionStatus } = useAppContext();

if (subscriptionStatus !== null && subscriptionStatus !== 'active') {
  return <BillingLockedPage />;
}
```

Replace with:
```tsx
const { subscriptionStatus, bypassBilling } = useAppContext();

if (!bypassBilling && subscriptionStatus !== null && subscriptionStatus !== 'active') {
  return <BillingLockedPage />;
}
```

- [ ] **Step 4: Hide `BillingPanel` for bypassed households**

In `src/components/familyos/BillingPanel.tsx`, find:
```tsx
const { currentRole, householdId } = useAppContext();
```
and the existing role check:
```tsx
if (currentRole !== 'superadmin' && currentRole !== 'admin') return null;
```

Change to:
```tsx
const { currentRole, householdId, bypassBilling } = useAppContext();
```
```tsx
if (currentRole !== 'superadmin' && currentRole !== 'admin') return null;
if (bypassBilling) return null;
```

- [ ] **Step 5: Typecheck and build**

Run: `npx vite build`
Expected: succeeds with no new errors.

- [ ] **Step 6: Manual verification**

1. In Supabase, confirm household #1 (grandfathered, `subscription_status = 'active'`) still has `bypass_billing = false` — sign in as that household, confirm the dashboard loads normally (proves the bypass isn't required for the existing working path).
2. Pick a test household currently showing `BillingLockedPage` (or create one via `/setup` without completing Checkout — see Task 4 for why this may now redirect; for this test, cancel out of Checkout via the `cancel_url` to land back on a non-active-subscription household). Set `bypass_billing = true` for it directly in Supabase:
   ```sql
   update households set bypass_billing = true where id = '<test-household-uuid>';
   ```
3. Reload the app signed in as that household. Expected: dashboard loads (no `BillingLockedPage`).
4. Open Settings → confirm no Billing section renders for this household.
5. Set `bypass_billing` back to `false` for that same household, reload, confirm `BillingLockedPage` reappears (proves the flag is actually load-bearing, not just accidentally passing due to some other condition).

- [ ] **Step 7: Commit**

```bash
git add src/lib/householdAuth.ts src/contexts/AppContext.tsx src/App.tsx src/components/familyos/BillingPanel.tsx
git commit -m "feat(billing): add creator-only billing bypass to the dashboard gate

households.bypass_billing (set only via direct SQL, no API path) now
OR's into the existing subscription_status gate in App.tsx. Bypassed
households see no billing UI in Settings. Grandfathered household #1
and the existing active-subscription path are unaffected — this is
purely an additional OR condition.

Verified: toggling bypass_billing for a test household with no active
subscription flips dashboard access on/off; BillingPanel disappears
when bypassed."
```

---

### Task 4: Redirect `/setup` into Checkout after household creation

**Files:**
- Modify: `src/pages/Setup.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `POST /api/billing-checkout` (Task 1, existing — accepts `{householdId}`, returns `{url}`); `POST /api/setup` (existing, unmodified — returns `{ok:true, householdId}`); `getAccessToken()` (existing, `src/lib/householdAuth.ts`).
- Produces: `Setup.tsx` redirects the browser to Stripe Checkout instead of calling `onHouseholdCreated()` directly; `App.tsx` detects the `billing=success`/`billing=cancelled` return and reacts accordingly.

- [ ] **Step 1: Update `Setup.tsx`'s submit handler to redirect into Checkout**

Read the current handler first (`src/pages/Setup.tsx`, the `handleSubmit`
function) — it currently does:
```tsx
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      onHouseholdCreated();
```

Replace the success branch with a Checkout redirect:
```tsx
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      const checkoutRes = await fetch('/api/billing-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ householdId: data.householdId }),
      });
      const checkoutData = await checkoutRes.json();

      if (!checkoutRes.ok || !checkoutData.url) {
        setError(checkoutData.error || 'Household created, but starting checkout failed. Please try again.');
        setSubmitting(false);
        return;
      }

      window.location.href = checkoutData.url;
```

(`token` is already in scope from the earlier `getAccessToken()` call in
the same function — reuse it, do not fetch it twice.)

- [ ] **Step 2: Handle the `billing=cancelled` return in `Setup.tsx`**

Add near the top of the `Setup` component, alongside the existing `useState`
declarations:
```tsx
const [cancelledNotice, setCancelledNotice] = useState(
  () => new URLSearchParams(window.location.search).get('billing') === 'cancelled'
);
```

In the JSX, render it just above the existing `{error && ...}` line:
```tsx
{cancelledNotice && (
  <p className="text-amber-400 text-sm">Checkout was cancelled — you can try again below.</p>
)}
```

- [ ] **Step 3: Handle the `billing=success` return in `App.tsx`**

Read the current `App` component's `useEffect`s first. Add a new `useEffect`
that runs once on mount, before the existing session-loading effect, to
detect and consume the `billing=success` query param:

```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('billing') === 'success') {
    params.delete('billing');
    const newSearch = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));
  }
}, []);
```

This strips the query param so a page refresh doesn't re-trigger any
success-specific UI later; no further action is needed here because the
existing `loadSession()` effect already runs on mount and will pick up the
now-`active` `subscription_status` from Supabase once the webhook (Task 1,
already built) has processed the completed Checkout session. If the webhook
hasn't processed yet (race condition: user redirected back before Stripe's
webhook fires), `AuthedApp`'s existing gate correctly shows
`BillingLockedPage` until the next reload/webhook completion — this is
existing, acceptable behavior, not a regression introduced by this task.

- [ ] **Step 4: Build**

Run: `npx vite build`
Expected: succeeds with no new errors.

- [ ] **Step 5: Manual verification**

1. Start a fresh `/setup` flow (new Google account or a test household not
   yet created) — fill in household name + your name, submit.
2. Expected: instead of landing on `BillingLockedPage`, the browser
   redirects to a Stripe-hosted Checkout page (`checkout.stripe.com`).
3. Complete checkout with Stripe's test card `4242 4242 4242 4242`, any
   future expiry, any CVC.
4. Expected: redirected back to `/setup?billing=success`, then (once the
   webhook has updated `subscription_status`) the dashboard loads — not
   `BillingLockedPage`. If it briefly shows `BillingLockedPage` before the
   webhook lands, reload once and confirm it clears.
5. Repeat step 1, but click Stripe's "back" link on the Checkout page
   instead of completing payment. Expected: redirected to
   `/setup?billing=cancelled`, sees the amber "Checkout was cancelled"
   notice, and can resubmit the form.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Setup.tsx src/App.tsx
git commit -m "feat(billing): redirect /setup into Stripe Checkout after household creation

Previously a new household landed directly on BillingLockedPage with
no context after finishing signup. Now /setup redirects straight into
Checkout; a cancelled checkout returns to /setup with an inline notice
instead of silently retrying. billing=success is detected and stripped
from the URL in App.tsx; the existing session-reload effect and
webhook (already built) pick up the resulting active subscription.

Verified: fresh household creation redirects to Stripe test-mode
Checkout; completing it with the 4242 test card lands on the
dashboard; cancelling returns to /setup with a visible notice."
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (Setup → Checkout wiring) → Task 4. Section 2
  (creator bypass) → Tasks 2–3. Section 3 (commit + deploy precondition) →
  Task 1 plus the env-var precondition called out below (not a task, since
  it requires the user's Vercel access — see "Before deploying").
- **No client-writable bypass path:** confirmed no task adds an API
  endpoint or UI control that writes `bypass_billing` — Task 2's migration
  comment and Task 3's design both state this explicitly.
- **Grandfathered household #1 unaffected:** Task 3 Step 6.1 explicitly
  verifies this before testing the new bypass behavior.
- **Type consistency:** `bypassBilling` (camelCase) is the client-side
  field name throughout (`getHouseholdSession`, `AppContext`,
  `BillingPanel`); `bypass_billing` (snake_case) is used only for the raw
  Supabase column/query, matching the existing `subscription_status` /
  `subscriptionStatus` naming split already present in this codebase.

## Before deploying (user action required, not part of this plan)

The following Vercel environment variables (production + preview) must be
set before Task 1's commit is deployed, or Checkout/webhook/portal calls
will fail at runtime with a "not configured" error:
- `STRIPE_SECRET_KEY` — test-mode secret key (`sk_test_...`) from the
  connected Stripe sandbox account.
- `STRIPE_WEBHOOK_SECRET` — from registering
  `https://www.hotmessexpress.lol/api/stripe-webhook` in the Stripe
  Dashboard's test-mode webhook settings (Developers → Webhooks → Add
  endpoint; events: `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`).
- `STRIPE_BASE_PRICE_ID` = `price_1Tthsz5zqyWwiYPrycN9pJNb`
- `STRIPE_SEAT_PRICE_ID` = `price_1Ttht15zqyWwiYPrsCz4OXZI`
