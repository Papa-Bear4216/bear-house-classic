# FamilyOS — Optimal Setup & Reliability Blueprint

**Date:** 2026-07-12
**Repo:** `bear-house-classic` (aka "family-os") · live at hotmessexpress.lol
**Status:** Design — approved section-by-section, pending final user review

---

## 1. North Star (the idea goal)

**FamilyOS is the single trusted surface a household glances at to know what's going on — and it earns that trust by never lying about what it knows.**

It is a **multi-user family portal**: adults and kids log in with roles; kids see chores/promises, adults see finance/health/home. One shared brain (Home Assistant, calendar, finance, chores, briefings) behind role-tailored views.

**Core loop:** open FamilyOS → see an at-a-glance, *honest* picture (what's live, what's stale, what needs attention) → act (chore, promise, briefing, device control) → the change syncs to everyone.

**Governing principle: honesty over completeness.** A dead camera must look dead; stale data must say it's stale. The app's job is to feel reliable even when the world behind it is flaky — because it will be flaky.

**Surfaces:** wall/personal/kids devices, all one shared brain. Android via Capacitor.

**Security posture (user's explicit choice): "good-enough / family trust."** UI-level role hiding is acceptable; no server-enforced Row-Level Security required. Two caveats that still must be handled (see §4).

---

## 2. Reliability Model — the core reframe

The #1 pain is reliability ("it breaks"). The breakage is **two different problems**, and only one lives in this repo. Conflating them is why it feels unfixable.

### Problem A — HA-instance rot (NOT fixable in this app)
Wyze cameras/tokens (~30-day expiry), Alexa integration auth (~60–90 days), Google AI key. These live on a **separate box** (Nabu Casa remote URL + `192.168.55.135`) and require re-entering Amazon/Wyze/Google credentials through Home Assistant's UI. **No code in this repo prevents them.** They recur on a schedule.

→ Handled as an **operational runbook**, already captured in `ha_audit_plan.md`. Referenced, not re-planned as build work.

### Problem B — App-side reliability (built here)
The app stops being a *victim* of Problem A and becomes the thing that *flags and heals* it:

1. **Graceful degradation** — when HA is unreachable or an entity is `unavailable`/`unknown`, render that honestly. Never paint a dead camera as live.
2. **Staleness & health surfacing** — every HA-backed widget shows last-updated + a health dot; a "System Health" panel summarizes up/down per integration.
3. **Monitoring + macro loop** — a scheduled job polls HA, and for scriptable failures **auto-heals**; for credential failures it sends an **actionable** alert.

**Honest ceiling:** with monthly Wyze token expiry, "stays up on its own forever" is structurally impossible. The realistic and achievable goal: *frequent breaks self-heal invisibly; only rare credential events need ~60 seconds of a tap.* The system trends toward silence.

---

## 3. Health + Macro Architecture (concrete)

All of this **reuses existing infrastructure** — no new auth system. `HOME_ASSISTANT_TOKEN` and `HOME_ASSISTANT_URL` already exist (used by `api/ha-cameras.ts`); `notifyIFTTT()` already exists (`api/_notify.ts`); the webhook-token guard pattern already exists (`api/ha-webhook.ts`).

### New route: `api/health-check.ts` (Vercel Cron, ~every 30 min)
- Calls `${HOME_ASSISTANT_URL}/api/states` with `HOME_ASSISTANT_TOKEN`.
- Computes per-integration health: counts `unavailable`/`unknown` by domain; checks known-fragile integrations (docker-wyze-bridge, alexa, google_ai, cameras).
- Persists a `system_health` snapshot via `dbSet` (existing `_db`).
- **Auto-heals** Tier-1 failures by self-invoking `api/ha-fix` (see below), then notifies *after the fact* ("self-healed docker-wyze-bridge").
- For Tier-2/3 (credential) failures, sends a de-duped **actionable** IFTTT alert (named culprit + fix links). De-dupe prevents repeat pings for the same known-down thing.

### New route: `api/ha-fix.ts` (called by health-check, the alert button, or in-app panel)
Token-guarded (WEBHOOK_TOKEN pattern). Takes `?integration=<id>` and runs the **highest available tier**:

- **Tier 1 — full auto (no human):** call HA service API — `homeassistant.reload_config_entry` for a stuck integration, or Supervisor addon restart for `docker-wyze-bridge`. Covers the *most frequent* breakage. Self-invoked by the cron.
- **Tier 2 — paste-one-secret:** accepts a `key` param (e.g. a fresh Google AI key the user pasted into one app field), pushes it to HA + reloads. User never touches the HA UI.
- **Tier 3 — assisted (rare, by design):** returns two quicklinks — a "get the key" URL (e.g. `https://aistudio.google.com/apikey`) and an HA reconfigure **deep-link** for that integration — with username prefilled. Amazon/Wyze 2FA is deliberately un-scriptable; this is the fastest *assisted* ~60-second fix. **User chose to stop here — no stored passwords, no headless login.**

### New map: `src/lib/integrationFixMap.ts`
Maps integration id → tier + fix metadata. Example:
```
google_ai   → { tier: 2, keyUrl, haReconfig }
wyze_bridge → { tier: 1, action: 'restart_addon' }
alexa       → { tier: 3, keyUrl, haReconfig, prefillUser }
```
Uses the Nabu Casa remote URL so fixes work off-network too. Unknown failures fall back to the generic HA integrations page + a plain alert.

### Pre-emptive refresh cron (monthly)
Wyze token rot is predictable — a monthly cron reloads the integration *before* expiry bites. Prevention, not reaction.

### In-app "System Health" panel (adult/superadmin only)
Reads the latest `system_health` snapshot: green/yellow/red per integration, last-updated, and a **"Fix It" button** per red item hitting `api/ha-fix`. Fixable from the app *or* the phone notification.

---

## 4. Stack Coherence & Data (drift cleanup)

Stack is **Vite SPA + Vercel serverless functions + Supabase** — coherent, keep it. Clean up only what undermines reliability or clarity:

- **Secrets:** move the Supabase URL/anon key out of `src/lib/sync.ts` (currently hardcoded and committed to git) into `VITE_` env vars, and **rotate the anon key**. Consolidate all secrets in `.env.local` (Supabase, HA token, IFTTT, camera token, SimpleFIN).
- **Verify Supabase RLS on `family_data`.** Given "good-enough / family trust," RLS *on* with a permissive policy is fine. RLS *off* + public anon key = table is world-read/write over the internet, which exceeds the intended risk. One-line check:
  `curl "<SUPABASE_URL>/rest/v1/family_data?select=key&limit=1" -H "apikey: <ANON_KEY>"` — if it returns rows unauthenticated, RLS is off.
- **Delete drift:** stray `.next/` folder, `firestore-debug.log`, and the Firestore path (the app is on Supabase — pick one; Supabase wins). Remove the Firestore leftovers.
- **Data-model note (documented, not fixed in v1):** the single `family_data` key/value table with last-write-wins realtime means two devices editing the same key overwrite each other. Acceptable for a trusted family; revisit only if it bites.

---

## 5. Finance — Banking, Budgeting, Subscription Finder

**Decision: replace Plaid with SimpleFIN Bridge** ($15/yr, read-only, daily refresh).

**Why not Plaid:** the existing `api/plaid.ts` + FinanceHub flow is well-built, but Plaid production requires approval and costs at scale — overkill for a read-only family budget.

**Why not Teller** (both compared): Teller is free (100 connections) and richer, but requires **mTLS client certificates** on every real-data request — painful on the current Vercel Edge functions. SimpleFIN is plain HTTP Basic Auth over an access URL and drops into the existing Edge `fetch` pattern with zero cert handling. FamilyOS needs neither write access nor real-time, so SimpleFIN's read-only + daily-refresh constraints are a fit, not a limitation. *Teller only wins later if FamilyOS needs real-time balances or a polished non-technical onboarding widget.*

### Plan (full replace)
- Rewrite `api/plaid.ts` → `api/finance.ts`:
  - `connect` — accept a SimpleFIN setup token, claim the access URL, store it server-side (replaces `plaid_tokens` → `simplefin_access`).
  - `sync` — GET accounts + transactions from the access URL (Basic Auth), reusing the existing dedupe + `dbSet` persistence.
- **Remove:** Plaid SDK dep, Plaid Link.js CDN load in `FinanceHub.tsx`. The budget/expense UI barely changes — only the sync source swaps.
- **Categorization = AI, not a taxonomy.** SimpleFIN returns plain descriptions with no categories. Use the existing Claude routes (`api/chat.ts` / `api/secretary.ts`) to categorize transactions — yields family-specific categories (Kids, Pets) a generic taxonomy wouldn't. Batch-categorize on sync; cache the merchant→category mapping so repeat merchants don't re-hit the model.
- **Subscription finder — upgrade the algorithm.** Replace the naive `detectRecurring()` ("merchant seen ≥2×") with real recurring-stream detection: normalize merchant names, detect cadence (monthly/weekly by interval), and flag price creep. Owned logic, better output than the old heuristic.
- **Budgeting — add history-based suggestions.** Suggest budget amounts from the last 3 months of actual category spend (data already available).
- **Automation.** Daily cron → `api/finance?action=sync` (webhook-token mode already built) → transactions + subscriptions + budgets refresh with no "Sync" button. Same cron pattern as the HA health-check.

---

## 6. Dev & Deploy Workflow

- **One branch truth:** `master` = production (deploys to hotmessexpress.lol via the `bear-house-classic` Vercel project). Feature branches → preview deploys → merge.
- Resolve the `handoff-instructions.md` issue: the `VITE_GOOGLE_CLIENT_ID` was added to the wrong Vercel project (`bearhouse.os`); consolidate on the correct project (`bear-house-classic`).
- `.env.local` for all secrets; nothing hardcoded. `npm run dev` local; Vercel handles `api/*` in preview/prod.

---

## 7. Build Order

1. **`api/health-check` + cron + `system_health` snapshot** — visibility first (honest state).
2. **`api/ha-fix` Tier-1 auto-heal + health-check self-invoke** — frequent breaks vanish.
3. **Monthly pre-emptive token-refresh cron** — kill predictable rot.
4. **Actionable IFTTT alert + in-app System Health panel** — Tier-2/3 assisted fixes.
5. **Finance: SimpleFIN migration** — `api/finance.ts`, AI categorization, upgraded subscription finder, budget suggestions, daily sync cron.
6. **Secrets/drift cleanup** — rotate Supabase key, move to env vars, verify RLS, delete Firestore/`.next`.

---

## Out of Scope (v1)

- Server-enforced RLS / real auth isolation (user chose family-trust).
- Money movement / write banking access (SimpleFIN is read-only by design).
- Headless Amazon/Wyze 2FA automation (un-scriptable; assisted flow only).
- Fixing the `family_data` last-write-wins concurrency edge (documented, deferred).
- Teller/mTLS path (revisit only if real-time or polished onboarding becomes a need).
