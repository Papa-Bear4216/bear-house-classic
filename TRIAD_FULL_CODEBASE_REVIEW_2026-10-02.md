# Triad Full-Codebase Review — 2026-10-02

**Repository:** `Papa-Bear4216/bear-house-classic`  
**Active path:** `C:\Users\micha\projects\bear-house-classic`  
**Branch:** `master` at commit `9410bef`  
**Production Domain:** `hotmessexpress.lol` (Vercel Edge + Supabase Postgres)  
**Evaluator:** Autonomous Multi-Agent Triad (Antigravity Primary Executive Engine + Advisory Council)  

---

## Executive Summary

| Verification Area | Target / Tool | Result | Details |
|---|---|---|---|
| **Type Safety** | `tsc` (app, node, api) | **0 Errors (PASS)** | Clean across `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.api.json`. |
| **Unit & Integration Suite** | `vitest run` | **859 / 859 Passed (100%)** | 84 test suites passing in 17.16s. |
| **Edge API Bundle Guard** | `check:api` (esbuild) | **Clean (PASS)** | All serverless Edge routes bundle with zero syntax or external import errors. |
| **Production Vite Build** | `vite build` | **Clean (PASS)** | 2,756 modules transformed, dist generated in 25.48s. |
| **2026-09-27 Review Remediation** | P0 & P1 backlog | **All 4 P0s & 11 P1s Fixed** | Re-verified against live code on disk. |

---

## 1. Status of Previous Findings (from 2026-09-27 Review)

All 4 P0 vulnerabilities and the major P1 data-corruption races identified in the initial full-codebase review have been **fully resolved and verified**:

1. **`api/data-write.ts` unauthenticated cross-household R/W (Was P0):**  
   - **Status:** **VERIFIED FIXED** (`commit 65be63d`, `6791713`).  
   - Household identity is resolved server-side from bearer token (`resolveHouseholdId(accessToken)`).  
   - Sensitive financial keys (`simplefin_access_`, `familyos_expenses_`, `familyos_bills_`, `merchant_category_cache_`) are rejected by `SERVER_MANAGED_KEY_PREFIXES`.
2. **`api/finance-sync.ts` & `api/preempt-refresh.ts` unauthenticated (Was P0):**  
   - **Status:** **VERIFIED FIXED** (`commit 00f8cae`).  
   - Enforces `Authorization: Bearer <CRON_SECRET>` and rejects non-GET methods.
3. **Gmail OAuth `state` parameter forgery (Was P0):**  
   - **Status:** **VERIFIED FIXED** (`commit 1550265`).  
   - State parameter is HMAC-signed using `GMAIL_STATE_SECRET` (`verifyGmailState`), binding the callback to the initiating household and member session.
4. **Physical device control role gating (Was P0):**  
   - **Status:** **VERIFIED FIXED** (`commit b288b35`).  
   - `can_control_devices` boolean enforced across `ha-control.ts`, `devices-control.ts`, `voice-alexa.ts`, and `voice-google.ts`.  
   - Default-deny for `child` and `pet`. Setting or toggling permissions is strictly gated to `admin`/`superadmin` (`api/setup.ts`). Role transitions reset the grant to `false`.
5. **Data corruption races (Was P1):**  
   - **Status:** **VERIFIED FIXED** (`commit 6431b3d`, `4e91bb3`, `395db36`, `6476673`, `f922b99`).  
   - Calendar sync, Google Classroom dedup, daily-brain sequential writes, SimpleFIN disconnect-resurrection, and reward double-charging are hardened.
6. **Telemetry & Push Token Scoping (Was P1):**  
   - **Status:** **VERIFIED FIXED** (`commit 4b346ed`, `9d8c751`).  
   - `register-push-token.ts` strictly verifies `personId === caller.memberId`. `triad-telemetry.ts` requires authenticated admin/superadmin and household allowlisting.
7. **Categorization 401 Caching (Was P1):**  
   - **Status:** **VERIFIED FIXED** (`commit 4b346ed`).  
   - `api/_categorize.ts` calls `fetchAi` directly; failed classifications return `null` and are never cached as `'Other'`.

---

## 2. Newly Shipped Feature Audits (Sprints 1–7)

### A. Co-Parenting Multi-Household Isolation (`PR #52-#54`)
* **Dual-Consent Merge (`api/coparent-merge-consent.ts`):** Both households must authenticate as admin/superadmin and independently submit the explicit confirmation phrase (`"Make my family whole again"`).
* **Address Confidentiality (`api/coparent-address.ts`):** When `address_confidential: true` is toggled by one household, the server masks all street, city, state, zip, and phone fields, returning only `{ confidential: true, complete: false }`. Role-gated to parents only (children cannot view addresses).
* **Statutory Disclosure Reference:** All 51 jurisdictions seeded with `statute_citation` and summary; includes prominent legal disclaimer stating this is automated reference information and not legal advice.

### B. Child Rooms & Sealed Private Journal (`Sprint 7`)
* **Room Customization (`src/lib/kidRoom.ts`):** Public room profiles (theme, avatar, mood, status) sync cleanly via `familyos_kid_rooms`. Theme purchases debit `household_points` for that specific child with spendable-point balance checks.
* **Sealed Journal Isolation:**
  * Stored exclusively in browser/device storage under `familyos_kid_journal_${memberId}`.
  * Completely excluded from `KEYS` in `src/lib/familyos.ts` and `sync.ts` — **zero journal data is ever transmitted to Supabase or Vercel Edge functions**.
  * Parents see a locked door; the child only sees their journal while signed in.
  * Local cache wipes on sign-out via `purgeLocalHouseholdData()`.

### C. Hermes AI & Guardrails (`api/chat.ts`, `api/_hermesTools.ts`)
* **Hard Safety Rules:** Persona explicitly forbids medical, dosing, legal, or court-related advice, and prohibits diagnosing or speculating on intent.
* **Caller Privilege Enforcement:**
  * In `api/chat.ts`, caller identity is resolved via `resolveCallerMember` and fails closed to `role: 'child'` if database resolution errors.
  * Device control tools (`controlDevice`, `discoverSmartHome`) are stripped from the tool catalog unless `canControlDevices` is true.
  * Member management and billing tools (`manageMember`, `notifyPerson`, `addBill`, `markBillPaid`, `clearWeekMeals`) are stripped unless `isAdmin` is true.
* **Neutral Co-Parent Mode (BIFF):** Authenticated prompt injection enforcing Brief, Informative, Friendly, Firm communication standards, stripping emotional accusations and marital grievances.

### D. Medication Double-Dose Safety (`HealthHub.tsx`)
* Real-time dose logging with exact timestamps, dose counts, and caregiver identity.
* 60-minute double-dose prompt alerting if another parent or caregiver already logged a dose of the same medication within the hour.
* Soft-delete tombstone synchronization preventing resurrection of deleted regimens.

---

## 3. New & Residual Findings (Ranked by Severity)

### P1 — SSRF & Redirect Bypass in SimpleFIN Claim (`api/_simplefin.ts`)
* **Location:** `api/_simplefin.ts:19`
* **Finding:** `claimAccessUrl` executes `await fetch(claimUrl, { method: 'POST' })` without `redirect: 'manual'`. While `assertSimplefinHost` checks `u.hostname.endsWith('.simplefin.org')`, it does not enforce `https:` and will follow HTTP 301/302 redirects. If a SimpleFIN endpoint redirects to an internal/metadata address, Edge fetch will follow it.
* **Remediation:** Add `redirect: 'manual'`, enforce `u.protocol === 'https:'`, and disallow credentials in `claimUrl`.

### P1 — Postgres RLS Row-Level Over-Exposure on `public.households`
* **Location:** `supabase/migrations/20260714061846_fix_household_members_rls_recursion.sql`
* **Finding:** The RLS policy `members read own household` allows any authenticated member of the household to run `SELECT * FROM public.households`. While the frontend UI never does this (all reads use service-role API routes that select safe columns), an authenticated `child` account opening browser DevTools could directly read `voice_trigger_token`, `byo_anthropic_key_encrypted`, and `contact_phone`.
* **Remediation:** Split sensitive household credentials into a private table or define a restricted Postgres VIEW for client-side authenticated access.

### P2 — COPPA Parental Consent & Beta Age-Gating
* **Location:** `docs/legal/hot-mess-express/data-flow.md` §8
* **Finding:** Children with `role: 'child'` who use chat have their messages and emotion context sent to cloud AI providers (Anthropic / Google). Under COPPA, beta testing with children under 13 requires verifiable parental consent (VPC). Standard clickwrap TOS does not meet FTC VPC criteria.
* **Remediation:** For the initial 50-family beta, either gate child accounts to 13+ or disable cloud AI calls for under-13 child accounts until a Stripe credit card authorization/verification step is implemented.

### P2 — Wellbeing Nudge Pipeline Privacy & Duty of Care
* **Location:** Planned feature (`data-flow.md` §9)
* **Finding:** Generating automated parent-facing nudges derived from private child journal entries risks violating the "sealed private journal" promise. Furthermore, automated mood detection risks creating an assumed duty of care for crisis situations (self-harm/abuse) that an LLM cannot reliably fulfill.
* **Remediation:** 
  1. Keep nudges **child-initiated** (Hermes prompts the child: *"Would you like me to ask Mom to plan a call?"*).
  2. If emergency signals (self-harm) occur, display 988/Crisis resources directly on the child's screen; do not auto-notify guardians in abuse scenarios where a guardian may be the perpetrator.

### P3 — Vite Dynamic Import Warning & Chunk Splitting
* **Location:** `src/components/AppLayout.tsx` & `src/components/familyos/Dashboard.tsx`
* **Finding:** `HouseholdBrain.tsx` is dynamically imported in `AppLayout.tsx` but statically imported in `Dashboard.tsx`. This causes Rollup to inline the component into the main bundle (`index-z6s-hobQ.js` at 1,024 kB).
* **Remediation:** Standardize on static or dynamic imports across both components to allow Rollup to separate `HouseholdBrain` into an independent chunk.

---

## 4. Verification Check Commands

To re-run the full Triad verification suite at any time:

```powershell
# 1. Typecheck across all targets
npm run typecheck

# 2. Vitest unit and integration suite
npm test

# 3. API serverless bundle check
npm run check:api

# 4. Vite production build
npm run build

# 5. Triad Advisory Council Consultation
python -m triad doctor
python -m triad consult "Review topic" --context-file docs/legal/hot-mess-express/data-flow.md
```
