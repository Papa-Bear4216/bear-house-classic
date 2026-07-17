# Billing Completion + Creator Bypass — Design Spec

Date: 2026-07-17

## Context

A prior, uncommitted session built the full Stripe billing feature from
`docs/superpowers/plans/2026-07-13-stripe-billing.md`: `api/_stripe.ts`,
`api/billing-checkout.ts`, `api/billing-portal.ts`, `api/billing-seats.ts`,
`api/stripe-webhook.ts`, `api/_billingAuth.ts`, `BillingPanel.tsx`,
`BillingLocked.tsx`, and the `App.tsx`/`AppContext.tsx`/`householdAuth.ts`
wiring that gates the dashboard on `subscription_status`. All of it matches
the plan, is security-correct (every billing-mutating endpoint verifies the
caller's Supabase token server-side and requires `superadmin`/`admin` role
via `requireBillingRole`), and is sitting in the working tree, untracked.

The two Stripe Prices it depends on already exist in the connected test-mode
sandbox account:
- Base plan (3 seats included): `price_1Tthsz5zqyWwiYPrycN9pJNb` — $9.99/mo
- Additional seat: `price_1Ttht15zqyWwiYPrsCz4OXZI` — $2.99/mo

This spec covers only what's still missing:

1. **Setup → Checkout wiring.** `Setup.tsx` creates the household and calls
   `onHouseholdCreated()` immediately — it never redirects into Stripe
   Checkout. Today a new household lands, then gets bounced to
   `BillingLockedPage` on the very next load with no context for why.
2. **Creator-only billing bypass.** New requirement: the app's creator can
   mark specific households as exempt from the paywall at their sole
   discretion, with no self-service path for anyone else to grant it.
3. **Committing and deploying the already-built billing feature**, since
   none of it is in git yet.

## Non-goals

- Rebuilding or redesigning any already-working billing code (checkout,
  webhook, seat sync, portal, `BillingPanel`, `BillingLocked`) — audited and
  confirmed correct, reused as-is.
- Member-invite UI / `/welcome` landing page — separate, deferred pieces of
  the original multi-tenant signup spec, not part of this pass.
- A bypass admin UI — this ships as a direct-DB-write mechanism only (see
  Bypass mechanism below); a UI is a possible future addition, not required
  now.

## 1. Setup → Checkout wiring

**Current flow:** `Setup.tsx` submits `{action: 'createHousehold', ...}` to
`/api/setup`, then calls `onHouseholdCreated()` on success, which flips
`App.tsx`'s `authState` back to `'loading'` and re-runs `loadSession()`.
Since the new household's `subscription_status` defaults to `'none'`
(migration default), the very next render hits `AuthedApp`'s gate and shows
`BillingLockedPage` — functionally correct, but jarring: the user just
finished a "Create household" form and lands on an unrelated "Subscription
needed" screen with no acknowledgment that account creation worked.

**Change:** After `/api/setup` succeeds, `Setup.tsx` calls
`/api/billing-checkout` directly (using the same pattern `BillingLocked.tsx`
already uses) and redirects the browser to the returned Stripe Checkout URL,
instead of calling `onHouseholdCreated()` immediately. `onHouseholdCreated()`
still fires — but only via the existing `success_url` roundtrip
(`/setup?billing=success`), which `App.tsx` must detect and use to trigger
`loadSession()` once the user is back from Stripe.

Concretely:
- `Setup.tsx`: after household creation succeeds, immediately call
  `/api/billing-checkout` with the new `householdId` (returned from
  `/api/setup`'s response — confirm this is already in the response shape,
  add it if not) and `window.location.href = data.url`.
- `App.tsx`: on mount, check `window.location.search` for `billing=success`;
  if present, strip the query param and call `loadSession()` (same handler
  already wired to `onHouseholdCreated`). If `billing=cancelled`, show
  `Setup.tsx` again with a small inline notice ("Checkout was cancelled —
  you can try again") rather than silently retrying.
- If `/api/billing-checkout` fails (network error, missing price ID env
  var, etc.), show the error inline on `Setup.tsx` rather than leaving the
  user stuck on a blank redirect.

This keeps `BillingLockedPage` exactly as-is — it remains the correct
fallback for existing households whose subscription lapses later
(`past_due`/`canceled` via webhook), just no longer the *first* screen a
brand-new household sees.

## 2. Creator-only billing bypass

**Mechanism:** a new `bypass_billing boolean not null default false` column
on `households`. Set **only** via direct SQL/Supabase dashboard by the app
creator — no API endpoint, no client-writable path, no UI toggle. This is a
deliberate scope choice per explicit instruction ("at my sole discretion") —
adding any programmatic write path (even role-gated) would let something
other than a manual, out-of-band decision grant free access, which defeats
the purpose of "sole discretion." A future admin-UI toggle can be added
later if wanted, but it wasn't asked for and isn't built now.

**Gate logic change** (`AuthedApp` in `App.tsx`):
```tsx
if (!bypassBilling && subscriptionStatus !== null && subscriptionStatus !== 'active') {
  return <BillingLockedPage />;
}
```
`bypassBilling` is threaded the same way `subscriptionStatus` already is:
`households.bypass_billing` → `getHouseholdSession()` (add to the same
Supabase select that already pulls `subscription_status`) →
`AppContext`'s new `bypassBilling: boolean` field → destructured in
`AuthedApp`.

**UI visibility:** per explicit choice, a bypassed household sees **no**
billing UI at all — `BillingPanel` (rendered in `SettingsModal`) additionally
checks `bypassBilling` and returns `null` if true, on top of its existing
role check. This avoids a confusing "Manage Billing" button that would 404
or error (no `stripe_customer_id` exists for a bypassed household that never
went through Checkout).

**Setup flow interaction:** a bypassed household still goes through
`Setup.tsx`'s "create household" step, but the subsequent checkout redirect
is skipped if `bypass_billing` is already true at creation time — this only
matters if the creator pre-flags a household *before* it's created, which
isn't a supported flow (the row doesn't exist yet). In practice, the bypass
is always granted **after** a household already exists and is stuck at
`BillingLockedPage`: creator manually sets `bypass_billing = true` in
Supabase, the affected user reloads (or the app polls/re-checks on an
interval — out of scope, manual reload is sufficient for v1), and the gate
now passes.

**Grandfathered household #1**, which already has `subscription_status =
'active'` set directly in SQL, is unaffected — the bypass is an *additional*
OR condition, never a replacement for the existing active-subscription
check.

## 3. Commit and deploy the existing billing feature

The already-built files get committed as their own commit (this is
pre-existing, reviewed-as-correct work — not something this pass is
authoring), separate from the new Setup-wiring and bypass-column commits, so
each commit stays reviewable and revertable independently:

1. `feat(billing): add Stripe subscription billing` — all pre-existing
   untracked billing files + the `App.tsx`/`AppContext.tsx`/
   `householdAuth.ts`/`SettingsModal.tsx`/`Index.tsx`/`package.json` diffs,
   as-is.
2. `feat(billing): redirect Setup into Checkout after household creation` —
   the `Setup.tsx` + `App.tsx` query-param handling change from section 1.
3. `feat(billing): add creator-only billing bypass` — the migration +
   `bypass_billing` threading from section 2.

**Before any of this deploys**, the following must be true in Vercel
(production + preview environments) — this spec does not create these, it's
a precondition the user must confirm or set:
- `STRIPE_SECRET_KEY` (test mode `sk_test_...` for now)
- `STRIPE_WEBHOOK_SECRET` (from registering `https://www.hotmessexpress.lol/api/stripe-webhook`
  in the Stripe Dashboard's test-mode webhook settings — this is a fresh
  registration, the secret is endpoint-specific)
- `STRIPE_BASE_PRICE_ID` = `price_1Tthsz5zqyWwiYPrycN9pJNb`
- `STRIPE_SEAT_PRICE_ID` = `price_1Ttht15zqyWwiYPrsCz4OXZI`

## Open items carried into implementation planning

- Exact response shape of `/api/setup` — confirm it already returns the new
  `householdId`, or add it, during planning (needed by `Setup.tsx`'s
  checkout call).
- Whether `App.tsx`'s `billing=success`/`billing=cancelled` query-param
  handling belongs in the top-level `App` component or a new small effect —
  decide during planning, following the existing `loadSession`/`authState`
  patterns already in that file.
- Live-mode cutover (swapping `sk_test_`/price IDs for live equivalents) is
  explicitly out of scope for this pass — test mode only, until the user
  decides to launch.
