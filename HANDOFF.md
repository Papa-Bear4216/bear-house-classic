## FULL-SYSTEM AUDIT — Claude Code Handoff Brief

**Owner:** Michael Hebert (Papa-Bear4216 / michael711hebert@gmail.com)  
**Generated:** Fri Jul 24, 2026 ~11:15 PM CDT *(regenerated — original ~11:08 PM body was only header-captured)*  
**Sources:** Pieces LTM + live GCE SSH inventory (tonight) + browser/calendar + prior session architecture  
**Purpose:** Full-stack context for any Claude Code session. **Do not start greenfield. Prefer finishing half-built loops.**

---

### How to use this brief

1. Open workspace: `C:\Users\micha\OneDrive\Desktop\projects\bear-house-classic`
2. Read `CLAUDE.md` first, then `PLAN.md` status section — treat as living truth over older AUDIT framing
3. Do **not** open a new "security audit from scratch"; tonight already did GH Security/Dependabot/CodeQL walkthrough + hermes-host SSH inventory
4. Pick **one** half-built loop from the Open loops list below and finish it

---

### Active surfaces (tonight)

| Surface | State | Path / URL |
|---|---|---|
| **bear-house-classic** | Primary app + security review in progress | [github.com/Papa-Bear4216/bear-house-classic](https://github.com/Papa-Bear4216/bear-house-classic) · local `C:\Users\micha\OneDrive\Desktop\projects\bear-house-classic` |
| **hermes-host GCE** | Running, mid-deploy audit | zone `us-east1-b`, instance ID `6792460686818384918`, external IP `34.73.193.94`, internal `10.142.0.2` · project `project-8246392f-185f-42f8-abe` |
| **Claude Code** | v2.1.219, Pieces MCP connected (69 tools) + many other MCPs | WindowsTerminal "Coordinate with recent chat using MCP" |
| **Production web** | Live | `hotmessexpress.lol` / Vercel prod (~9h prior for observability ship) |
| **Docs** | Source of truth for agent sessions | `CLAUDE.md`, `PLAN.md` (updated today), `AUDIT.md` (point-in-time, partially superseded) |

Calendar tonight: only history was **Michael Hebert's Zoom Meeting** 9:00–10:00 AM CDT — no blocking evening events.

---

### Architecture snapshot (do not re-derive)

**Bear House Classic / FamilyOS** — household OS: chores, pantry, quality time, presence, Hermes AI, billing. Multi-tenant isolation by `household_id`.

- **Frontend:** React 18 + Vite + Tailwind + Radix + TanStack Query + React Router → `src/`
- **API:** Vercel serverless, one file per route under `api/`; `_`-prefixed helpers are shared, not routes
- **DB:** Supabase Postgres — `households`, `household_members` (roles: superadmin/admin/child/pet), `family_data` (JSON KV), memory lives as a `family_data` key (not a separate table)
- **Auth:** Google OAuth via Supabase. Tokens in **sessionStorage only** (never localStorage). Native Capacitor path uses in-app browser + `com.bearhouse.app://auth-callback`
- **Trust boundary:** Every authenticated API route must resolve household via `resolveHouseholdId(accessToken)` in `api/_db.ts`. **Never trust client-supplied `household_id`.** API always uses `service_role` (bypasses RLS). Browser reads use authenticated session + live RLS on `family_data`.
- **Billing:** Stripe + `bypassBilling` hatch
- **Integrations:** Claude/Gemini, Gmail, HA cameras/webhooks/state, SimpleFin, Walmart receipts, weather, calendar-sync
- **Android:** Capacitor under `android/`
- **Commands:** `npm run dev` · `npm run build` · `npm run lint` · `npm test`

---

### Decisions already made (do not reopen without cause)

1. **`api/` stays service_role-only** (2026-07-24). `resolveHouseholdId` is the accepted trust boundary. No RLS backstop on API reads. Rationale: threat model is a bug in `resolveHouseholdId` only; dual-auth complexity not worth it. Revisit only if that function changes or a real incident happens. Recorded in `PLAN.md` + commit *"docs: record the api/ service role decision as resolved"*.
2. **CLAUDE.md corrected** — browser path is *not* anon; `householdAuth.ts` calls `setSession()` so RLS applies. Commit *"docs: correct stale RLS/auth claims, narrow the service_role open decision"*.
3. **P0/P1 PLAN items 1–8 treated complete** earlier today (rate limit expansion, input validation, standardized `_responseHelpers`, react-router v7, indexes verified, targeted state-management guard, structured logging + Speed Insights, etc.). Do not re-implement these.
4. **13 Dependabot alerts dismissed as stale** (~1:30 PM session) via GH API — then **fresh High alerts reappeared tonight** after later lockfile/security rescans. Treat tonight's open set as live until re-verified against current lockfile.

---

### Tonight's workstream A — bear-house-classic GitHub Security (≈10:45–11:05 PM CDT)

You walked Security & Settings end-to-end on [Papa-Bear4216/bear-house-classic](https://github.com/Papa-Bear4216/bear-house-classic):

**Dependabot — 16 open** (notably High):
- vite — `server.fs.deny` bypass on Windows alternate paths
- minimatch — ReDoS via multiple non-adjacent GLOBSTAR
- js-yaml — YAML merge-key chains quadratic CPU
- react-router — RSC Mode CSRF Bypass *(worth recheck: you already upgraded to `react-router-dom@^7.18.1` this afternoon; may be stale/new advisories)*
- undici — several Moderate (insufficiently random values, request smuggling, Set-Cookie header injection)
- esbuild / undici Low

**CodeQL — 4 findings:**
1. Clear-text storage of sensitive information — `src/lib/familyos.ts:293`
2. Clear-text storage of sensitive information — `src/lib/presenceTracker.ts`
3. Clear-text storage of sensitive information — `src/components/familyos/SettingsModal.tsx:194`
4. Workflow missing `permissions:` — `.github/workflows/ci.yml`

**Secret scanning:** 2 alerts  

**Repo posture notes from walkthrough:**
- Public repo, **0 collaborators**, only you have push
- Default branch was switched / managed (`master` vs `main` present)
- No rulesets, no Codespaces prebuilds
- Security policy disabled; private vulnerability reporting disabled; secret scanning showed disabled on overview earlier in the pass (alerts still surfaced — reconcile state)
- CodeQL default setup active (JS/TS + Actions), Copilot Autofix on
- Recent commits: `feat(observability): structured error logging + Speed Insights`, android branding/geolocation, ESLint/Supabase-cache gitignore, CI + use-toast tests
- Tabs also open: "New chat — Claude", `CLAUDE.md` showing the RLS/service_role docs commit

**Half-built next action (this loop):** triage CodeQL clear-text findings first (most concrete), then pin/bump Dependabot Highs, then add `permissions:` to `ci.yml`. Claude Code session already offered to start with `familyos.ts` / `presenceTracker.ts` / `SettingsModal.tsx`.

---

### Tonight's workstream B — hermes-host / hermes-bridge GCE (≈10:20–10:41 PM CDT)

**VM:** `hermes-host` · Running since Jun 15, 2026 · Ubuntu 24.04.4 LTS · kernel `6.17.0-1018-gcp`  
**SSH user observed:** `bearappdev6969@hermes-host`  
**Stack dirs:** `/home/micha/hermes-bridge`, `/opt/hermes`, `/home/bearappdev6969/.hermes`  
**Containers:** `hermes-bridge-caddy-1` (caddy:2), `hermes-bridge-hermes-bridge-1`  
**Also:** host `caddy.service` running (pid 567) with `/etc/caddy/Caddyfile` since Jul 6  
**Disk:** ~29% of 47.39 GB · **24 updates pending · `*** System restart required ***`** · 2 zombie processes  
**Listen (partial):** 8080/tcp, 127.0.0.1:2019 (Caddy admin); host :80 story unclear

**Five findings locked in (Grok Extra Thinking + SSH inventory):**
1. **Broken origin** — Caddy points somewhere but **PM2 is empty** / target not in `ss`; public site may 502 or only serve leftover paths
2. **Two Caddy configs** — host `/etc/caddy/Caddyfile` vs compose `/home/micha/hermes-bridge/Caddyfile` — pick one story
3. **Two OS users / three deploy eras** — `/opt/hermes` vs compose under `/home/micha` vs PM2 logs; freeze one
4. **Secrets in container env** (expected) — never paste values; rotate if leaked
5. **Ubuntu restart pending**

**Concrete errors seen:**
- `FirebaseAppError: Failed to parse service account json` — `ENOENT: /home/bearappdev6969/service-key.json`
- `EACCES: permission denied on 0.0.0.0:80` (path conflict between host Caddy and container Caddy)
- `punycode` DeprecationWarning

**Diagnostic pack already written (run on VM, secrets redacted):**
```bash
# 1) What's listening
sudo ss -lntup

# 2) Both Caddyfiles
echo '=== HOST ===' && sudo cat /etc/caddy/Caddyfile
echo '=== COMPOSE ===' && sudo cat /home/micha/hermes-bridge/Caddyfile

# 3) Compose topology (values redacted)
sudo sed -E 's/(KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION)=.*/\1=***REDACTED***/Ig' \
  /home/micha/hermes-bridge/docker-compose.yml

# 4) Dir inventory
sudo ls -la /home/micha/hermes-bridge /opt/hermes /home/bearappdev6969/.hermes 2>/dev/null
head -n 40 /home/micha/hermes-bridge/hermes.js 2>/dev/null

# 5) Origins / health
curl -o /dev/null -s -w '%{http_code}\n' --connect-timeout 2 http://127.0.0.1:3000/
curl -o /dev/null -s -w '%{http_code}\n' --connect-timeout 2 http://127.0.0.1:8080/
sudo pm2 list
```
SSH-in-browser:
`https://ssh.cloud.google.com/v2/ssh/projects/project-8246392f-185f-42f8-abe/zones/us-east1-b/instances/hermes-host?authuser=1&hl=en_US&projectNumber=535099736178&useAdminProxy=true`

**Half-built next action:** paste diagnostic outputs back into the audit thread; freeze to **compose-under-`/home/micha`** (or explicitly choose otherwise); fix missing `service-key.json` path; resolve host-vs-container :80 ownership; schedule the Ubuntu reboot window.

---

### Related / adjacent half-built (do not greenfield)

| Item | Status | Notes |
|---|---|---|
| FCC (`free-claude-code`) local proxy docs | Earlier this week | README section + planned PR on [Papa-Bear4216/free-claude-code](https://github.com/Papa-Bear4216/bear-house-classic) — confirm if PR opened |
| ESLint flat-config / walkthrough TS error | Likely resolved earlier | Was `eslint.config.js` `recommended` undefined + `app/walkthrough/page.tsx:541` — verify still green with `npm run lint` / `npm test` |
| PLAN P2/P3 | Open, non-blocking | observability extras, docs, feature flags, offline-first, i18n, `family_data` split analysis, image opt / unused-deps |
| Rate-limit gap | Documented | `setup.ts` cannot use household-scoped limiter (no household yet) — needs separate mechanism |
| esbuild low via tsx | Still open from PLAN | dev-only; `npm audit fix` candidate |
| react-router v7 | Code done; browser smoke incomplete | Manual click-through still recommended before calling prod-verified |
| Pieces ↔ Claude Code MCP | Live tonight | 20 MCP servers listed; Pieces skill loaded for "coordinate with recent chat" |

---

### Open loops (priority order for next Claude Code session)

1. ~~**CodeQL clear-text storage**~~ — **done (2026-07-25).** `familyos.ts:293` and `presenceTracker.ts` were false positives (no secrets pass through them — pantry/settings/presence-zone JSON and timestamps/location logs only). `SettingsModal.tsx:194` was real: `apiKey`, `geminiApiKey`, `cameraToken` moved from `localStorage` → `sessionStorage` across all 11 call sites in 5 files (`familyos.ts`, `CameraViewer.tsx`, `WelcomeBackModal.tsx`, `SettingsModal.tsx`, `MealPlanner.tsx`). Tests (179) and build verified green.
   - **⚠️ STILL OPEN — bigger fix, not done:** `geminiApiKey` is a real third-party Gemini API key shipped to and used directly in client-side JS (`MealPlanner.tsx` calls `generativelanguage.googleapis.com` straight from the browser with it, `WelcomeBackModal.tsx` too). Moving it to `sessionStorage` only fixes *where* it sits at rest — it's still readable via devtools/XSS/compromised dependency the moment it's in memory, and it's still your Gemini quota/billing exposed to anyone with browser access. Real fix is routing those Gemini calls through `api/` (like `chat.ts` already does for Claude) instead of calling Google's API directly from the client. This is a genuine feature-shaped change (touches `MealPlanner.tsx`'s whole-week-suggestion path + `WelcomeBackModal.tsx`), not a one-line patch — scope it separately.
2. **Dependabot Highs** — **investigated (2026-07-25), left unpatched by design, not neglect.** `npm audit` shows 20 advisories (17 high/3 moderate) but all trace back to only 4 direct deps: `react-router-dom`, `vite`, `eslint`, `@vercel/node`. Real risk assessment, not just severity labels:
   - **`react-router` CSRF (GHSA-qwww-vcr4-c8h2, CWE-352, range 7.12.0–8.2.0, installed 7.18.1 is in-range)** — the only one of the 4 that's a runtime dependency shipped to users. The vulnerable code path is **RSC (React Server Components) mode action execution** — confirmed via grep that this codebase has zero RSC usage (`BrowserRouter`/`Routes`/`Route` SPA pattern only). **Not exploitable in this app as built.** Real fix requires upgrading to react-router 8.3.0+, a major-version migration (7→8) — real work, don't rush it since the risk isn't live.
   - **`vite`, `eslint`, `@vercel/node`** — all three are **devDependencies**, confirmed via `package.json` — none of them ship to `hotmessexpress.lol` production. Their advisories (vite path traversal in dev-server optimized-deps `.map` handling, launch-editor NTLMv2 hash disclosure on Windows, `server.fs.deny` bypass, minimatch ReDoS inside eslint/ts-morph internals) only matter if `npm run dev`/`vite build` runs against untrusted input on an untrusted network — not a concern for normal local/CI use.
   - `npm audit`'s auto-suggested "fixes" are unreliable here: it suggested *downgrading* `react-router-dom` to 7.11.0 (older than installed, and still doesn't clear the vulnerable range) and *downgrading* `@vercel/node` from 5.8.26 to 4.0.0 — classic sign the naive fixAvailable resolver picked the wrong direction. Don't run `npm audit fix --force` blindly; every real fix here is a semver-major bump across a different tool, worth doing deliberately in its own pass, not reactively.
   - **Bottom line: no code changes made, none of the 20 are live risks to production today.** Revisit react-router 7→8 migration when there's bandwidth for a real major-version upgrade, not as a security emergency.
3. ~~**`ci.yml` permissions:** block~~ — **done (2026-07-25).** Added `permissions: contents: read` at workflow level; job only checks out/builds/tests, needed nothing broader.
4. ~~**Secret scanning** 2 alerts~~ — **done (2026-07-25).** Both were Firebase Web API keys (`AIzaSy...`) for the same `prime-mechanic-463314-m8` project already flagged in the Downloads credential sweep — `public/firebase-messaging-sw.js` and `firebase-applet-config.json`, both only present in one old commit (`8122558`) on `origin/main`, not in the live `master` branch that deploys to production. Verified these are Firebase *Web* API keys (client-side `firebaseConfig.apiKey`), which are public-by-design per Firebase's own security model — the real boundary is Firestore/Storage security rules, not this key (unlike the Admin SDK service-account key found in Downloads, which IS a real secret and still needs rotating). Dismissed both via `gh api` as `false_positive` with resolution comments explaining why — visible at `github.com/Papa-Bear4216/bear-house-classic/security/secret-scanning`.
5. ~~**Hermes origin freeze**~~ — **done (2026-07-25). Site was actually down; now confirmed live.** Root cause found via live SSH (gcloud CLI installed + `gcloud compute ssh hermes-host` this session): the **host-level `caddy.service`** (systemd, enabled at boot, `/etc/caddy/Caddyfile`) was winning the boot race for ports 80/443 over the docker-compose Caddy — but the host Caddy's config proxied to `localhost:3000`, which had **nothing listening** (PM2 confirmed empty, 0 processes). Meanwhile the compose stack (`hermes-bridge-caddy-1` + `hermes-bridge-hermes-bridge-1`, correct config proxying to `hermes-bridge:8080`) had been silently running with **zero actual host port bindings** (`docker inspect` showed `{}`) despite `ports: ["80:80","443:443"]` being declared in `docker-compose.yml` — Docker didn't error, it just lost the port race and never mentioned it. Net effect: `hermes.dysfunctionjunction.xyz` was unreachable before tonight, for an unknown period.
   - **Fix applied:** stopped + disabled host `caddy.service` (`systemctl stop/disable caddy`), then `docker compose down && docker compose up -d` in `/home/micha/hermes-bridge` so the container Caddy could claim ports 80/443 cleanly. Confirmed via `docker ps`: `0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp` now correctly bound.
   - **`service-key.json` (Firebase) missing at `/opt/hermes/`:** confirmed still absent, but the `hermes-bridge` container logs show a clean startup (`hermes bridge on :8080`, no crash) — the earlier `ENOENT` error isn't reproducing on this fresh boot, so whatever Firebase/FCM feature needs it is either optional or not being exercised. **Deliberately did not** copy the quarantined Downloads Firebase Admin key here — that key still needs rotation (see Q1), reusing it would just spread the same soon-to-be-invalid credential to a second location.
   - **Reboot:** 24 pending package updates + `*** System restart required ***` had been outstanding a while. Rebooted (`sudo reboot`) once the fix was verified working. Confirmed after reboot: both containers auto-restarted (`restart: unless-stopped` held), ports still correctly bound, `https://hermes.dysfunctionjunction.xyz/` returns `401` (healthy — TLS + app responding, just needs auth), and host `caddy.service` confirmed `inactive`/`disabled` (did not come back).
   - **Not fixed, minor/cosmetic:** container Caddy's ACME renewal-info checks fail on a DNS lookup (`127.0.0.53:53 connection refused` — container-internal `systemd-resolved` stub unreachable). Current TLS cert is valid until ~2026-10 regardless, so not urgent — revisit if cert renewal actually fails as that date approaches.
6. ~~Confirm FCC docs PR~~ — **done (2026-07-25).** It had never been opened. Worse: the local commit on the fork was corrupted — the doc section was duplicated twice with raw diff/patch syntax (`--- a/README.md`, `@@`) and mojibake encoding (`â€‘` etc.) leaked directly into the file body from an earlier bad patch-apply that was never verified. Reset `README.md` to a clean sync with upstream (fork was 12 commits behind), rewrote the "Using FCC locally" section once, correctly encoded, on a fresh branch (`docs/fcc-local-setup-guide`), pushed, and opened the PR: https://github.com/Alishahryar1/free-claude-code/pull/1261
7. ~~Optional: security policy + private vuln reporting~~ — **skipped, by decision (2026-07-25).** Confirmed neither is enabled (`gh api repos/.../bear-house-classic` shows `private_vulnerability_reporting_status: null`, no `SECURITY.md`). These exist to give external researchers a safe disclosure channel — with 0 outside collaborators and no bug bounty on a solo family-app repo, that scenario doesn't apply. Deliberately not done; revisit only if the repo ever gets real outside contributors/users beyond the household.

---

### Hard rules for the next agent

- Do **not** restart a full codebase audit; `AUDIT.md` is stale relative to tonight + today's PLAN completion
- Do **not** reopen the service_role vs RLS decision without new incident or `resolveHouseholdId` redesign
- Do **not** paste container env secret values into chat or commits
- Prefer finishing items 1–5 above over new features
- When touching API routes: always `resolveHouseholdId`; never client `household_id`
- Admin-only UI is excluded from DOM for non-superadmin (not CSS-hidden) — keep that pattern
- Tests: full suite was ~158–169 tests earlier today — run `npm test` + `npm run lint` before pushing security fixes

---

### Key local paths

```
C:\Users\micha\OneDrive\Desktop\projects\bear-house-classic\
  CLAUDE.md
  PLAN.md
  AUDIT.md
  src\lib\familyos.ts
  src\lib\presenceTracker.ts
  src\components\familyos\SettingsModal.tsx
  api\_db.ts
  api\_rateLimit.ts
  api\_responseHelpers.ts
  .github\workflows\ci.yml
```

---

## Next-level abilities — Family OS brainstorm status

Recovered from the afternoon brainstorm session (Pieces LTM). The numbered 1–7 concept list is complete for that brainstorm — no missing 8th core concept. Two same-session add-ons (App 8, App 9) surfaced from a follow-up filesystem/browser survey and should be tracked alongside it.

| # | Concept | Status |
|---|---|---|
| 1 | **Hermes Recall** (Pieces → palace → Recall Briefing in `WelcomeBackModal`) | Greenlit ("you're in on Hermes Recall") — **not evidenced as built**. Priority pick to start next. |
| 2 | **Household Vision Verify** (floorplan/digital-twin chore scan) | Still half-built (~80% on `origin/main`); Wyze + HA + Gemini already live |
| 3 | **Warranty / Device Fleet Tracker** | **Done** — Warranty tab, `DeviceWarranty.tsx`, lazy chunk, wired in `AppLayout`. Don't rebuild. |
| 4 | **Browser / Login Consolidation Assistant** | Idea only |
| 5 | **Plaid Budget Pace Alerts** | Idea only — alert scaffold exists on abandoned `origin/main`; Plaid already live |
| 6 | **Meeting / Call → Task Pipeline** (Otter + Pieces audio → Hermes → tasks) | Idea only — candidate to fold into #1's build |
| 7 | **Family Calendar Conflict Sentinel** | Idea only — GCal already wired |
| App 8 | **Project consolidator** — find multi-copy repos | Report run: `bear-house-classic` exists in 3 places; only `Desktop\projects\bear-house-classic` is live. Stale copies (`frankenstein`, `Family-os`) may hold unported features — salvage-scan before deleting. |
| App 9 | **Downloads triage** — classify/clean Downloads (old installers, house docs → ties to #3, archive) | Report run: flagged **real credential exposure** (Firebase admin key, SSH key, plaintext password CSV, OAuth secret) + ~0.5 GB reclaimable. **Cleanup + credential rotation still open — higher urgency than any greenfield item above.** |

**Not part of this brainstorm set** (different category, don't merge in): PLAN.md P2/P3 observability backlog (Sentry/LogRocket, admin health dashboard), Claude Desktop ↔ Pieces MCP tooling, tonight's security loops (CodeQL/Dependabot/hermes-host freeze), FCC docs PR, on-device Gemini scanner, Hermes self-improvement plan.

**Note for any Hermes Recall build session:** the original pitch referenced `lib/palace.ts` / Firestore rooms — current stack is Supabase `family_data`. Target the current memory store, not the old Firestore wording.

---

## QoL builds beyond the app (added 2026-07-24 ~11:28 PM CDT)

Grounded in real friction from the last ~2 weeks (Downloads secrets, password checkup, multi-copy repos, multi-account sprawl, ADHD ops, early wake, family logistics). Not app features unless noted.

| # | Build | Why it helps you specifically | First concrete step |
|---|---|---|---|
| **Q1** | **Credential Escape Hatch** | App 9 found Firebase admin key, SSH key, OAuth client secret, and **Google Passwords.csv** sitting in `Downloads`. Password Checkup: **1,253** passwords, **24 compromised**, **748 reused**, **710 weak**. This is higher urgency than greenfield feature work. | Tonight: move CSV/keys out of Downloads → vault; revoke/rotate the exposed ones; empty Recycle Bin. Script: scan Downloads/Desktop/Documents for `*.csv` password exports, `*client_secret*`, `*service*account*`, `id_rsa`, `*.pem`. |
| **Q2** | **One-Identity Account Map** | Many Google accounts in rotation (`michae1711hebert`, `bearappdev6969`, smokehouse, etc.) + mid-effort "standardize logins." Bookmarks mix personal, school, money, work. | One sheet/vault note: account → purpose → recovery → 2FA where. Kill dead emails; pick primary for GH/Vercel/Supabase/GCloud. |
| **Q3** | **Repo Single Source of Truth** | App 8: `bear-house-classic` in **3 places**; only `Desktop\projects\bear-house-classic` is live. Stale copy had **47 uncommitted changes**; `frankenstein` / `Family-os` may hold unported features. | Diff stale → live; export unported commits/files; delete or archive the rest; pin one path in your shell `$PROFILE`. |
| **Q4** | **Morning Load-Out (ADHD ops brief)** | Persona is ambient/ADHD-first; you mentioned waking ~4:30a and not being ready. Spoken commitments leak (Instagram unblock never became a task). You already have GCal + Pieces + Zoom history. | 5-minute script/agent at first unlock: today's calendar, open loops from yesterday audio/Pieces, one "don't forget" line, kid/logistics flags. Output: ephemeral notification or `WelcomeBackModal` — not a new app surface. |
| **Q5** | **Family Run-of-Show board** | Pickups, school portal (`myzbportal`), Texas Benefits, Bridgecrest, multi-person household — coordination is still tribal knowledge. Spoken logistics vanish unless captured. | Shared "today/this week" board (Notion you're already MCP'd to, or a single Family OS page): who drives, where, money/admin deadlines. Auto-seed from GCal nightly. |
| **Q6** | **Mega-download & disk governor** | Recent **2.5 GB** `out-windows.exe`-class downloads; App 9: **~0.5–4.5 GB** reclaimable installers in Downloads; nested tool with **1,900+** files. Disk/attention tax. | Weekly job: flag installers >200 MB older than 14 days, nested node_modules-like junk trees, duplicate `google-services.json`. One-click quarantine folder — never auto-delete secrets. |

### Suggested attack order if energy is low
1. **Q1** (secrets — stop the bleeding)
2. **Q3** (one live repo tree)
3. **Q2** (account map — reduces daily auth thrash)
4. **Q4** (morning brief — compounds daily)
5. **Q5** / **Q6** when the house is quieter

### Keep separate from security open loops
Tonight's CodeQL / Dependabot / hermes-host freeze stays in **Open loops** above. Don't merge those into this QoL list.

