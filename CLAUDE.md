# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bear House Classic ("FamilyOS") is a household-management web app: chores, pantry, quality time, presence tracking, an AI "Hermes" assistant, and billing, built for a single family but designed multi-tenant so multiple households can share one deployment with data isolation. React/Vite SPA + Vercel serverless API + Supabase Postgres. Also ships as an Android app via Capacitor. Live at `hotmessexpress.lol`.

## Commands

```bash
npm run dev       # vite dev server
npm run build     # vite build -> dist/
npm run lint      # eslint .
npm test          # vitest run (single run, not watch)
npx vitest        # watch mode
npx vitest run path/to/file.test.ts   # single test file
```

Tests live next to source as `*.test.ts` in both `src/lib/` and `api/`, and are picked up by `vitest.config.ts`'s `include` glob. `vitest.config.ts` stubs `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` so `src/lib/sync.ts` (which creates a Supabase client at import time) can load without a live connection — fine for tests that never actually hit Supabase.

No dedicated typecheck script; `tsc` runs implicitly via `vite build`.

## Architecture

### Two runtimes, one repo

- `src/` — the React SPA (Vite, TypeScript, Tailwind, Radix UI primitives under `src/components/ui`, TanStack Query, React Router). Feature components live in `src/components/familyos/`.
- `api/` — Vercel serverless functions, one file per route (`api/chat.ts` → `/api/chat`). Files prefixed with `_` (`api/_db.ts`, `api/_schemas.ts`, `api/_stripe.ts`, etc.) are shared server-only helpers, never routes — Vercel doesn't expose underscore-prefixed files.
- `supabase/migrations/` — the source of truth for schema. Apply new schema changes as new timestamped migration files, never by hand-editing the DB.
- `android/` — Capacitor-wrapped native shell; `capacitor.config.json` points it at the web build.

### Data layer & trust boundary

- Supabase Postgres with two tables doing most of the work: `household_members` (roles: `superadmin`, `admin`, `child`, `pet`) and `family_data`, a household-scoped JSON key-value store used for most feature data (pantry, chores, memories, etc.). `household_memory` holds structured entries for AI context.
- **All API code talks to Supabase via raw REST fetch in `api/_db.ts`, not the JS SDK**, using the `service_role` key — this bypasses RLS entirely, so `household_id` scoping is enforced in application code, not the database, for anything going through `api/`.
- Browser code uses the Supabase JS client (`src/lib/sync.ts`) with the `anon` key for reads only; RLS policies (see `supabase/migrations/*rls*` and `docs/fix-family-data-rls.sql`) are what protect those reads. The anon key cannot write — all writes are proxied through `api/` Edge Functions.
- **Never trust a client-supplied `household_id`.** Every authenticated API route resolves it server-side via `resolveHouseholdId(accessToken)` in `api/_db.ts`, which verifies the Supabase access token against `/auth/v1/user` and looks up the caller's `household_members` row. That resolved id is the only thing enforcing tenant isolation once service_role is in play — treat it as the security boundary when adding or touching any API route.
- Background jobs (crons, webhooks) have no per-request session; they use a separate helper that assumes a single household exists and throws loudly rather than guessing — see the comment in `api/_db.ts` before extending this to multi-household.

### Auth flow

Google OAuth via Supabase Auth. Web: full-page redirect. Native (Capacitor): opens the OAuth URL in an in-app browser tab (`@capacitor/browser`) and completes the flow through a custom URL scheme deep link (`com.bearhouse.app://auth-callback`) caught by an `appUrlOpen` listener in `src/lib/householdAuth.ts` — a plain WebView can't complete Google OAuth or receive an http(s) redirect back into a native app. Access tokens are kept in sessionStorage, never localStorage.

`src/contexts/AppContext.tsx` is the top-level session state: on mount it loads the household session and roster (`src/lib/householdAuth.ts`) and exposes `currentUser`, `currentRole`, `householdMembers`, `householdId`, `subscriptionStatus`, and `bypassBilling` app-wide.

### Billing

Stripe-backed subscriptions gated per household, with a `bypassBilling` escape hatch (see `add_bypass_billing` migration and `AppContext`). Billing routes: `api/billing-checkout.ts`, `api/billing-portal.ts`, `api/billing-seats.ts`, `api/stripe-webhook.ts`, backed by `api/_billingAuth.ts`, `api/_stripe.ts`, `api/_subscriptions.ts`.

### AI / integrations surface

`api/chat.ts`, `api/secretary.ts`, `api/briefing.ts`, `api/gmail-suggestions.ts`, `api/vision.ts` call out to Claude/Gemini. `api/ha-cameras.ts` / `api/ha-webhook.ts` / `api/ha-fix.ts` talk to a self-hosted Home Assistant instance. `api/finance-sync.ts` / `api/finance.ts` integrate SimpleFin. `api/walmart.ts` handles receipt scanning. `api/weather.ts` and `api/calendar-sync.ts` round out the integrations. Rate limiting for these lives in `api/_rateLimit.ts`; request validation schemas in `api/_schemas.ts`.

Crons are declared in `vercel.json`: `health-check` daily, `preempt-refresh` monthly, `finance-sync` daily.

### Roles

`superadmin` > `admin` > `child` / `pet` (see `HouseholdRole` in `src/lib/householdAuth.ts`). Some UI (GitHub PAT config, integrations tab, system dashboards) is restricted to `superadmin` and excluded from the DOM entirely for other roles rather than just hidden — follow that pattern for any new admin-only surface, don't rely on CSS to hide sensitive controls.

## Notes from prior audits (AUDIT.md / PLAN.md)

These documents in the repo root capture a point-in-time security/quality review and a prioritized remediation plan — read them for known gaps (service_role overuse on reads, inconsistent API error shapes, etc.) before assuming an area is unaudited. Don't treat them as up to date without checking current code; they describe planned work, not necessarily completed work.
