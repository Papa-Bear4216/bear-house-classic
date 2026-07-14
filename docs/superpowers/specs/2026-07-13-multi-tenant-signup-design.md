# Multi-Tenant Signup, Household Roles & Landing Page — Design Spec

Date: 2026-07-13

> **Status update (2026-07-14):** The auth + data-scoping portion of this spec
> (Data model, Auth, Roles, RLS, and the `household_id` migration/rollout
> notes) has been implemented and shipped to production — see
> `docs/superpowers/plans/2026-07-13-multi-tenant-foundation.md` and its
> progress ledger. **Signup, Billing, and the `/welcome` landing page below
> are still unbuilt** — only `/login` exists today; there is no `/setup`,
> no Stripe integration, and no landing page. See "Deviations from this spec"
> at the bottom before planning that work.

## Problem

FamilyOS ("bear-house-classic") is currently a hardcoded single-family app:

- Four users (`Daddy`, `Mommy`/`gwen`, `Abriana`, `Julia`) and a pet (`Lucy`) are hardcoded directly in `src/lib/familyos.ts`, matched by literal email address.
- "Auth" is a decoded-but-unverified Google ID token (`src/lib/auth.ts`) matched against that hardcoded array, with session state in `sessionStorage`. One user (Abriana) falls back to a plaintext PIN in `localStorage`.
- All household data lives in one global `family_data` key-value table in Supabase, scoped by nothing — there is no `household_id`/tenant column anywhere.
- There is no signup, no onboarding, and no landing page. The only two routes are `/` (the full dashboard, gated by a client-side session check) and a 404 catch-all.
- Roles (`superadmin`/`admin`/`child`) exist as a hardcoded attribute per hardcoded user, not as household-scoped, assignable data.

This spec covers un-hardcoding the family, introducing real multi-tenant auth and data scoping, adding a signup/setup flow, and building a landing page — while preserving the existing `superadmin` / `admin` / `child` / `pet` role model.

## Goals

1. Support arbitrary new families signing up and using their own isolated household data.
2. Replace unverified client-side JWT decoding with real Supabase Auth sessions.
3. Preserve the current role hierarchy and its existing gating behavior (child restrictions in `AppLayout.tsx`, etc.), now driven by data instead of hardcoded arrays.
4. Migrate the current hardcoded family into the new system as "household #1" with no data loss.
5. Ship a playful, energetic landing page describing real, working features (Hermes AI assistant, Chore Scanner, Finance Hub, Home Assistant cameras, Household Memory) — framed around helping overwhelmed/ADHD-style household management, without inventing unbuilt features.
6. Charge for the product: every household requires an active subscription (no free tier), with the base plan covering up to 3 authenticating members and per-seat overage pricing beyond that.

## Non-goals

- Building a net-new "ADHD assistant" feature (out of scope for this spec; existing features are reframed in copy only).
- Household-to-household sharing or cross-household visibility.
- Annual billing, trials, or promotional/discount codes (can be added later on top of the Stripe integration).

## Data model

New tables (replacing the single hardcoded roster):

### `households`
| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| name | text | e.g. "The Hebert House" |
| stripe_customer_id | text, nullable | set once checkout starts |
| stripe_subscription_id | text, nullable | set once subscription is created |
| subscription_status | text | mirrors Stripe status: `active`, `past_due`, `canceled`, etc. |
| created_at | timestamptz | |

### `household_members`
| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| household_id | uuid, fk → households | |
| auth_user_id | uuid, fk → auth.users, nullable | null for pets |
| name | text | |
| email | text, nullable | null for pets / PIN-only members |
| role | text | `superadmin` \| `admin` \| `child` \| `pet` |
| color | text | preserves existing per-user color theming |
| pin_hash | text, nullable | for members who authenticate via PIN instead of Google/email |
| created_at | timestamptz | |

### `family_data` (existing table)
- Add `household_id uuid references households(id)`.
- Backfill: create one `households` row for the current family (name "Hebert House", `subscription_status = 'active'` — grandfathered in without Stripe checkout), set `household_id` on every existing `family_data` row to that id, and create five `household_members` rows (`Daddy`/superadmin, `Mommy`/admin, `Abriana`/child, `Julia`/child, `Lucy`/pet) matched from the existing hardcoded `USERS`/`FAMILY` data — so nothing existing is lost.
- **Shipped as built:** `family_data`'s primary key was widened from `(key)` to `(key, household_id)` so two households can't collide on the same key (not called out in this spec's original data model — added during implementation).

### RLS
Every table scoped by `household_id` gets RLS policies of the form:
```sql
using (household_id in (
  select household_id from household_members where auth_user_id = auth.uid()
))
```
following the security checklist (`TO authenticated`, ownership predicate, no `SECURITY DEFINER` shortcuts).

**Shipped as built:** `households` and `household_members` got authenticated,
household-scoped SELECT policies from the start (never had a legacy anon
policy to remove). `family_data` was handled differently on purpose —
RLS was deliberately left unchanged (still anon-readable) through most of
the rollout so `src/lib/sync.ts`'s existing anon-key read/realtime path
wasn't broken mid-migration, then tightened *last*, only after the
authenticated read path was proven working live. The final `family_data`
policy (`"members read own household data"`) matches this section's
sketch, using `(select auth.uid())` for the per-row optimizer hint.
Writes to `family_data` go through a `service_role` server endpoint
(`api/data-write.ts`), which bypasses RLS by design — there is no
authenticated write policy on `family_data`. `household_members` itself
needed a follow-up fix: the initial roster-read policy caused infinite
self-referential recursion, fixed via a `SECURITY DEFINER` helper function
(`current_user_household_ids()`) scoped to `auth.uid()` — a narrow,
justified exception to the "no `SECURITY DEFINER` shortcuts" rule above.

## Auth

- Move from client-decoded Google JWT (`src/lib/auth.ts`) to **Supabase Auth**, using Supabase's Google OAuth provider for the existing "Sign in with Google" UX, plus Supabase email/password for members without Google.
- Members without email (PIN-only, e.g. today's Abriana case) keep a lightweight PIN gate, but the PIN is now hashed server-side and checked against `household_members.pin_hash`, with the underlying session backed by a real Supabase Auth session (e.g. a shared/anonymous auth user scoped to that household) rather than being the sole security boundary.
- `AppContext` resolves `currentUser`/`currentRole` via `auth.uid()` → `household_members` row lookup instead of scanning a hardcoded array.
- Route guarding (see Routes below) replaces the current `App.tsx` "authed = getSession() !== null" gate.

**Shipped as built (2026-07-14):** Google OAuth via Supabase Auth is live —
`src/lib/householdAuth.ts` (`signInWithGoogle`/`signOut`/`getHouseholdSession`/
`getHouseholdRoster`), a page-level `/login` (`src/pages/Login.tsx`), and
`AppContext` resolving `currentUser`/`currentRole`/`members` from
`household_members` exactly as described above. **The PIN-hash /
email-password path was never built** — only Google OAuth exists today;
`pin_hash` remains an unused column. `household_members.auth_user_id` is
linked to real `auth.users` rows via a one-time manual SQL step per member
(not a self-service "claim my row" flow) — a deferred item, not yet
revisited. Old hardcoded auth (`USERS`/`FAMILY`/`getSession`/`setSession`/
`clearSession`, the JWT-decode `Login.tsx`) has been fully removed from
`src/lib/familyos.ts` and the codebase.

## Roles (preserved)

`superadmin` / `admin` / `child` / `pet` remain exactly as they behave today (see `AppLayout.tsx` gating: children lose Health/Finance nav and admin-only household sub-tabs; pets are assignees only, never authenticate). The only change is that role becomes a column on `household_members` rows created during setup, instead of a hardcoded per-person constant.

## Signup / Setup flow

> **Not built as of 2026-07-14.** No `/setup` route, no Stripe integration,
> no member-invite flow exist yet. This section remains a plan, not a
> status report. The current backfilled household (household #1) was
> created directly via SQL migration, bypassing this flow entirely — see
> the status note at the top of this document.

New route: `/setup`. No free tier — a household cannot finish setup without an active subscription.

1. **Create your household** — enter household name, sign up via Google or email/password → this user becomes `superadmin` and a new `households` row + `household_members` row is created.
2. **Start your subscription** — Stripe Checkout for the base plan (covers up to 3 authenticating members). `households.stripe_customer_id`/`stripe_subscription_id`/`subscription_status` are set on success. Setup cannot proceed past this step without an active subscription.
3. **Add family members** — repeatable form: name, email (optional), role (`admin`/`child`/`pet`), color.
   - Members with email get invited (magic link / Supabase invite) to set up their own login.
   - Pet rows are created with no `auth_user_id`/email — purely an assignable label, matching today's behavior, and never count toward seats.
   - Adding the 4th (and each subsequent) **authenticating** member (`superadmin`/`admin`/`child`) updates the Stripe subscription quantity (seat-based line item) *before* the member row is created; if the Stripe update fails, the member is not added and the user sees an error.
4. **Finish** → redirect into the dashboard, now scoped to the new household.

## Billing

> **Not built as of 2026-07-14.** No Stripe integration exists. Household
> #1's `subscription_status = 'active'` is a hardcoded grandfather value
> set by the backfill migration, not the output of a real subscription.

- **Provider**: Stripe.
- **Pricing**: base monthly subscription (placeholder, e.g. $9.99/mo) includes up to 3 authenticating members. Each additional authenticating member is a per-seat monthly add-on (placeholder, e.g. $2.99/mo/seat), modeled as a Stripe subscription quantity/line item. Pets never count toward the seat total or billing.
- **No free tier**: every household must complete Stripe Checkout as part of setup (see flow above) before members can be added or the dashboard can be used.
- **Access**: `superadmin` and `admin` roles can view invoices, update the payment method, and see current seat count/cost from a new **Billing** panel (likely surfaced inside Settings). `child`/`pet` roles have no billing visibility or access.
- **Seat sync**: household seat count is derived by counting `household_members` rows where `role in ('superadmin','admin','child')`; this count is kept in sync with the Stripe subscription's seat-based line item quantity whenever a member is added or removed.
- **Webhooks**: new `api/stripe-webhook.ts` handles subscription lifecycle events (`invoice.payment_failed`, `customer.subscription.updated`/`deleted`, etc.) and updates `households.subscription_status` accordingly.
- **Enforcement on payment failure**: a household whose `subscription_status` becomes `past_due` or `canceled` is locked out of the dashboard (redirected to a "update billing" screen, gated similarly to the `/setup` guard) until `superadmin`/`admin` resolves payment.

## Routes

> **Partially built as of 2026-07-14.** `/` and `/login` exist and work as
> described. `/welcome` and `/setup` do not exist — there is no landing
> page and no signup flow. Today, an unauthenticated visitor lands on
> `/login` directly (not `/welcome`), and there is no guard for "no
> household membership" or "no active subscription" since every current
> user was backfilled with both already in place.

Current: `/` (dashboard, session-gated), `*` (404).

New:
- `/` — the existing dashboard (`AppLayout`), now requiring an authenticated session, an existing `household_members` row, and an active subscription
- `/welcome` — **landing page** (logged-out marketing page; authenticated visitors without a household are redirected past this into `/setup`)
- `/login` — sign in (Google or email/password)
- `/setup` — household creation, required subscription checkout, and member setup (first-run for a new household, or "add a member" later from Settings)
- `*` — 404 (unchanged)

Guard logic: unauthenticated → `/welcome` (with a "Log in" link to `/login`); authenticated but no household membership row → `/setup`; authenticated with membership but no active subscription → `/setup` (billing step); authenticated with membership and active subscription → `/`.

## Landing page

> **Not built as of 2026-07-14.** No `/welcome` route or landing page copy
> exists yet.

Route: `/welcome`. Playful & energetic tone (bright, fun copy, illustration/emoji accents — not enterprise-SaaS, not overly cozy).

Sections:
- **Hero** — bold headline about taming household chaos together; primary CTA "Get Started" → `/setup`; secondary "Log in" → `/login`.
- **Feature grid**, framed honestly around real, shipped features:
  - **Hermes AI Assistant** — ask it anything; it handles tasks, bills, shopping, and remembers so you don't have to hold it all in your head (helpful framing for anyone who gets overwhelmed keeping track of household chaos).
  - **Chore Scanner** — point your camera at a room; AI finds what needs doing, so you never have to stare at a messy room wondering where to start.
  - **Finance Hub** — bank sync via SimpleFIN, auto-categorized spending, recurring bill detection.
  - **Home Assistant Cameras** — check in on the house from the dashboard.
  - **Household Memory** — the app remembers preferences, routines, and context so every family member (and Hermes) stays on the same page.
- **Built for the whole family** — visual showing superadmin/admin/child/pet roles, emphasizing every family member (including pets!) has a place.
- **Footer CTA** — repeat "Get Started" button.

## Migration/rollout notes

**Shipped as built (2026-07-14)** — see `docs/superpowers/plans/2026-07-13-multi-tenant-foundation.md` for the task-by-task execution:

- Existing hardcoded family became household #1 via a one-time backfill migration (data + 5 member rows including the pet), applied before the auth rollout, so the current family's session transitioned seamlessly.
- Hardcoded Supabase URL/anon key moved to env-only reads (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` client-side, `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`service_role` server-side) before RLS tightened.
- `household_id` threading **deviated from "every call site"**: client-side paths (`sync.ts`, `data-write.ts`, `App.tsx`) thread `householdId` as originally planned. Server-side background jobs (crons/webhooks in `api/*.ts`) instead resolve the sole existing household via a `soleHouseholdId()` guard in `api/_db.ts`, which throws loudly if more than one household ever exists — a deliberate scope-reduction (confirmed via review) since there is exactly one household today and speculative multi-household fan-out had no consumer yet. Revisit `soleHouseholdId()` before onboarding a second real household.
- `api/_db.ts`'s `dbGet` moved off the anon key onto `service_role`, since these background-job endpoints have no `auth.uid()` session to satisfy the tightened `family_data` RLS policy.

## Open items carried into implementation planning

- Exact invite mechanism for household members with email (Supabase magic link vs. a custom invite-code flow) — can be decided during planning.
- Exact Stripe product/price configuration (base plan price ID, per-seat price ID, whether seats are a metered item or a quantity-based line item) — can be decided during planning.
- Final pricing numbers (placeholders used in this spec) — to be set before launch.
