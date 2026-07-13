# Multi-Tenant Signup, Household Roles & Landing Page — Design Spec

Date: 2026-07-13

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

## Non-goals

- Building a net-new "ADHD assistant" feature (out of scope for this spec; existing features are reframed in copy only).
- Billing/subscription tiers for multiple households.
- Household-to-household sharing or cross-household visibility.

## Data model

New tables (replacing the single hardcoded roster):

### `households`
| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| name | text | e.g. "The Hebert House" |
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
- Backfill: create one `households` row for the current family, set `household_id` on every existing `family_data` row to that id, and create four `household_members` rows (`Daddy`/superadmin, `Mommy`/admin, `Abriana`/child, `Julia`/child) plus one pet row (`Lucy`) matched from the existing hardcoded `USERS`/`FAMILY` data — so nothing existing is lost.

### RLS
Every table scoped by `household_id` gets RLS policies of the form:
```sql
using (household_id in (
  select household_id from household_members where auth_user_id = auth.uid()
))
```
following the security checklist (`TO authenticated`, ownership predicate, no `SECURITY DEFINER` shortcuts).

## Auth

- Move from client-decoded Google JWT (`src/lib/auth.ts`) to **Supabase Auth**, using Supabase's Google OAuth provider for the existing "Sign in with Google" UX, plus Supabase email/password for members without Google.
- Members without email (PIN-only, e.g. today's Abriana case) keep a lightweight PIN gate, but the PIN is now hashed server-side and checked against `household_members.pin_hash`, with the underlying session backed by a real Supabase Auth session (e.g. a shared/anonymous auth user scoped to that household) rather than being the sole security boundary.
- `AppContext` resolves `currentUser`/`currentRole` via `auth.uid()` → `household_members` row lookup instead of scanning a hardcoded array.
- Route guarding (see Routes below) replaces the current `App.tsx` "authed = getSession() !== null" gate.

## Roles (preserved)

`superadmin` / `admin` / `child` / `pet` remain exactly as they behave today (see `AppLayout.tsx` gating: children lose Health/Finance nav and admin-only household sub-tabs; pets are assignees only, never authenticate). The only change is that role becomes a column on `household_members` rows created during setup, instead of a hardcoded per-person constant.

## Signup / Setup flow

New route: `/setup`

1. **Create your household** — enter household name, sign up via Google or email/password → this user becomes `superadmin` and a new `households` row + `household_members` row is created.
2. **Add family members** — repeatable form: name, email (optional), role (`admin`/`child`/`pet`), color.
   - Members with email get invited (magic link / Supabase invite) to set up their own login.
   - Pet rows are created with no `auth_user_id`/email — purely an assignable label, matching today's behavior.
3. **Finish** → redirect into the dashboard, now scoped to the new household.

## Routes

Current: `/` (dashboard, session-gated), `*` (404).

New:
- `/` — **landing page** (logged-out marketing page)
- `/login` — sign in (Google or email/password)
- `/setup` — household creation + member setup (first-run for a new household, or "add a member" later from Settings)
- `/app` — the existing dashboard (`AppLayout`), now requiring an authenticated session **and** an existing `household_members` row
- `*` — 404 (unchanged)

Guard logic: unauthenticated → `/login`; authenticated but no household membership row → `/setup`; authenticated with membership → `/app`.

## Landing page

Route: `/`. Playful & energetic tone (bright, fun copy, illustration/emoji accents — not enterprise-SaaS, not overly cozy).

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

- Existing hardcoded family becomes household #1 via a one-time backfill script (data + member rows), run before the new auth/setup code goes live, so the current family's session transitions seamlessly to the new system.
- `api/_db.ts`, `src/lib/sync.ts`, and every `dbGet`/`dbSet`/`dbPrepend` call site need `household_id` threaded through — this is the largest mechanical part of the implementation and a good candidate for the parallelized implementation plan.
- Hardcoded Supabase URL/anon key committed in source (`api/_db.ts:5`, `src/lib/sync.ts:3-4`) should move to env-only reads while this work is in flight, since RLS now becomes the real security boundary.

## Open items carried into implementation planning

- Exact invite mechanism for household members with email (Supabase magic link vs. a custom invite-code flow) — can be decided during planning.
- Whether `/app` is the right path name vs. keeping the dashboard at `/` and moving the landing page to `/welcome` — cosmetic, decide during planning.
