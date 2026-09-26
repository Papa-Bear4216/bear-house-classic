# Bear House Classic — Enhancement & Enrichment Ideas

Living scratchpad for feature ideas. This is **not** the remediation plan —
that's `PLAN.md` (P0–P3). These are product enrichments: things that would
make the app more useful, delightful, or sticky for the household. Promote
anything that graduates into `PLAN.md` as a P1/P2 with an estimate.

Conventions: each idea has a rough effort — **S** (< 1 day), **M** (1–3 days),
**L** (3+ days / multi-surface). Anchor each to the routes/modules it touches.

---

## Briefing & Daily Rhythm

### 1. Push-delivered morning briefing
`briefing.ts` + `daily-brain.ts` + `register-push-token.ts`
The briefing exists but requires opening the app. Compose the morning brief
(calendar lookahead, weather, finance snapshot, daily-brain flags) and deliver
it as a push notification at a per-member configurable time. **M**

### 2. Bedtime / wind-down routine
`tts.ts` + `ha-control.ts`
Voice-driven routine: at kid bedtime, dim HA lights (`ha-control`), then read
tomorrow's highlights aloud with TTS. Same primitive could do a "leaving for
school" checklist. **M**

### 3. Weekly family digest
`secretary.ts` + `notify-person.ts` + `finance.ts`
Sunday-evening auto-digest: chores completed, spend vs. budget, calendar
lookahead for the week, one "win" per kid. Delivered to parents; opt-in for
kids. Turns existing data into a retention loop. **M**

## Home Assistant

### 4. One-tap scenes
`ha-control.ts` + `ha-cameras.ts`
Named scenes (Movie Night, Bedtime, Away, School Morning) bundling light,
climate, and camera-privacy states. Scenes are the feature that makes HA
feel finished to non-technical family members. **M**

### 5. Presence-aware automations
`ha-discover.ts` + `ha-webhook.ts`
"Everyone left" → arm cameras + eco climate; "first person home" →
disarm + entry lights. Webhook plumbing already exists; this is the
rule layer on top. **L**

### 6. Integration health watch
`health-check.ts` + `client-metric.ts` + `preempt-refresh.ts`
Household-visible status: HA, Gmail, SimpleFin, calendar sync each get a
freshness indicator, with proactive repair prompts when a token goes stale
instead of silent feature rot. **S–M**

## Finance & Household Ops

### 7. Receipt intelligence
`walmart.ts` + `vision.ts` + `finance.ts`
Snap a grocery receipt → vision extracts line items → auto-categorize
against the budget. Walmart route already pulls order data; this closes
the loop for in-store purchases. **L**

### 8. Transaction review inbox
`_simplefin.ts` + `finance-sync.ts`
SimpleFin auto-categorization is only as good as its corrections. A lightweight
"review these 5 uncertain transactions" inbox (swipe right = confirm)
compounds categorization accuracy over time. **M**

### 9. Pantry / grocery loop
`walmart.ts`
Track staples from receipt history; flag "running low" based on purchase
cadence; one-tap add to the next Walmart order. **M**

## Family & Kids

### 10. Chore streaks & leaderboard
Family OS heritage feature, never built here. Streaks, points, and a weekly
family leaderboard with parent-approved rewards. The single highest-leverage
kid-engagement mechanic available. **M**

### 11. Classroom+ : homework loop
`classroom.ts`
Extend beyond the current surface: assignment capture (photo → vision),
due-date nudges, and a parent "sign-off" flow. Permission-slip detection
could live here too (see #13). **L**

### 12. Memory timeline ("a year ago today")
`memory.ts`
Surface long-term memory as delight: milestones, photos, and notes
resurfaced on anniversaries. Kid-milestone logging (firsts) makes this
a keepsake, not just a database. **S–M**

### 13. School-email triage
`gmail-suggestions.ts` + `gmail-server-scan.ts` + `calendar-sync.ts`
Detect teacher/school senders → roll into a single school digest;
detect permission slips / forms → extract the deadline and create a
calendar event with a parent reminder. **M**

## Platform

### 14. Voice routines beyond unlock
`voice-unlock.ts` + `tts.ts`
Voice unlock proved the mic path. Add a small routine grammar ("good
morning", "goodnight", "we're leaving") mapping to briefing/TTS/HA
actions. **M**

### 15. Grandparent (read-only) view
Household model currently assumes members. A scoped read-only role —
photos, milestones, digest — brings extended family into the loop
without widening the trust boundary. Pairs with the RLS work in `PLAN.md`. **L**

### 16. Guided re-onboarding after dormant integrations
`setup.ts` + `health-check.ts`
When an integration has been broken > 7 days, offer a 2-minute guided
reconnect instead of a dead settings page. Retention insurance. **S**

---

## Parking lot (unshaped)
- Shared grocery list with store-aisle ordering
- Kid-safe "ask the house" voice Q&A over family memory
- Car / garage door state in HA scenes
- Pet feeding tracker (who fed the dog?)

*Last updated: 2026-09-25*

---

## Co-Parenting + ADHD Extension (build scope)

*Status: spec + full scope complete 2026-09-25. Step 0 (Hermes fix/upgrade) done — PR #40.
Full spec: `familyos-coparenting-spec` (owner's files). This section is the build scope.*

**Product goal:** make FamilyOS usable by two separated parents sharing custody
of a child with ADHD. One neutral record, both homes run the same routines,
rewards, and commitments. A **mode inside the existing app**, not a fork.
Child-first, append-only ledgers, 2-tap actions, privacy by default. Never
medical/legal advice.

**Owner decisions (2026-09-25):** follow-through rate is per-user private
only, never shared; Hermes fix/upgrade before everything else; `med_given`
editable by its author only, viewable by both parents; custody calendar is
Hermes' domain (he scopes and fills it); the app is structured around the
child — parents move to separate households, the kid has a room at both.

### Ground truths from the codebase audit

- `households` IS the family today — no `families` table exists. The
  `families → households (1:N)` model is new construction.
- No server-side promises / rewards / expenses / routines model. They are
  localStorage-first blobs synced via the `family_data` KV catch-all.
  Phases 2, 3, 5 are greenfield table builds with blob→ledger migrations.
- Append-only ledgers cannot live in `family_data` (upsert-by-key destroys
  history). New tables required.
- All writes go through service-role `api/` routes; RLS is SELECT-only.
  New tables follow the same pattern.
- `resolveHouseholdId` is first-row-wins — breaks for a dual-household
  child. Phase 0 reworks auth to family-scoped resolution + household context.
- Roles are `superadmin | admin | child | pet` — no `viewer` role yet.
- Push (FCM) works; no reminder scheduler; 3 Vercel crons, already at plan
  limits (daily-brain piggybacks on finance-sync).
- `briefing.ts` + `secretary.ts` still call deprecated `gemini-2.0-flash`
  (same bug fixed in `chat.ts`).
- Realtime `postgres_changes` subscriptions already exist for `family_data` —
  extend to new ledger tables for the <5s cross-home sync requirements.

### Step 0: Hermes fix + upgrade — DONE (PR #40)

`/api/chat.ts` overhauled: dead tier toggle wired up, model catalog
centralized (`gemini-2.5-flash`), empty responses → 502, 30s timeouts,
default Hermes persona with hard safety rules. Follow-ups still open:
(a) briefing.ts/secretary.ts model fix (0.5d), (b) streaming SSE (1–2d),
(c) structured JSON output mode (1–2d, **required** by Phases 1 & 4).

### Phase 0: Family mode switch — L (5–8d)

New `families` table (`mode` default `'single'`); `households.family_id`
backfill (one family per existing household). Auth rework: `resolveFamilyId`
+ explicit household context; child gets one `household_members` row per
household. `useFamilyMode()` hook + `requireMode()` API helper; setup wizard
"One home / Two homes"; email invite flow; consent/time-delay rules for
`co_parenting → single`. Risk: touches every route's trust boundary — one
careful pass, full suite green.

### Phase 1: Two-household foundation — L (5–8d)

New: `custody_patterns`, `custody_overrides`, `swap_requests`. **Hermes
parses custody language into `rule_json`** (needs Step 0(c)); parents
confirm. "Where is the child today/tonight" banner (deterministic,
timezone-careful). Swap requests `requested → accepted/declined`, logged.
RLS tests with two parent + one child accounts, incl. must-fail cases.
Risk: calendaring edge cases — time-box the pattern language.

### Phase 2: Promise ledger — M–L (4–6d)

New: `promises`, `promise_events` (append-only). Migrate the
`family_promises` blob as seeded `created` events. Two-key resolution
(`open / kept / broken / rescheduled / released`); reschedule needs a
reason. **Follow-through rate: `GET /api/my-follow-through` returns only
the caller's own rate — no shared view, ever.** Day-before/day-of push
reminders (needs cron strategy). Child view: promises made to them, simple
language.

### Phase 3: Shared routines + reward economy — L (6–10d, biggest)

New: `routines`, `routine_steps` (+ per-home variants), `routine_completions`
(append-only), `rewards`, `reward_ledger` (append-only). Routines don't exist
anywhere today — fully greenfield. Migrate `household_points` blob as
opening ledger entries. **Balance keyed by `(family_id, child)` — follows
the child across homes.** Realtime sync <5s; optimistic step taps, no
spinners. Dedicated child UI (large targets, "not yet" language). Routine
versioning; parent-proposed changes need the other's approval.

### Phase 4: Quick capture — L (6–10d)

New: `captures` (raw note verbatim, append-only), `capture_entries`
(append-only, **except `med_given`: author-editable, both-parents-viewable**).
Hermes parses into `med_given / health_note / school_event / struggle_note /
handoff_note / general` — extract only what was said. Save immediately →
chips + 10s undo. Fallback buttons work with zero AI. `school_event` →
reminder for the custody-holding parent + one-tap routine-step offer.
Handoff digest ("since last handoff") on custody switch. Go-bag / playbook /
vault as simple lists. PDF export for clinician/school.

### Phase 5: Shared expenses — M (3–5d)

New: `expenses`, `expense_events` (append-only). Split math in integer cents,
deterministic rounding, unit-tested. Statuses
`submitted / approved / disputed / settled`; disputes need reasons. Running
balance + settle-up **record only** — no payment processing (non-goal).

### Phase 6: Hermes, neutral by design — M (3–4d)

Weekly summary generated **only** from ledger events, every claim citing ≥1
event ID; plain-data fallback when the model is down. Opt-in tone assist
(never sends, never stores unsent). Child-facing nudges. Builds on the
Step 0 persona + all ledgers — goes last.

### Cross-cutting

- **Cron strategy** (P2 reminders, P4 digests, P6 summary): one `/api/scheduler`
  route vs. new crons — decide in Phase 0.
- Realtime subscriptions per new ledger table.
- Viewer role migration (if viewers make v1).
- Data export (JSON + PDF); family data survives a parent deleting their account.
- Child device story (own device / shared tablet / none) — needed before P3.

### Open questions for the owner

1. Promise confirmation: child, other parent, or per-promise configurable?
2. Viewers (therapist/teacher) in v1 or deferred?
3. Per-home reward stores or one shared store?
4. Child device constraints?
5. Monetization: setup fee vs. per-family subscription?

### Build order & estimate

Step 0 (done) → Hermes follow-ups (a,b,c) → Phase 0 → Phase 1 → **Phase 4**
(daily-use hook) → Phase 2 → Phase 3 → Phase 5 → Phase 6.
**Rough total: 30–45 focused days.**

---

## Hermes: better at his job without spending more

*Ranked by impact. All $0 marginal cost. #1 shipped 2026-09-25 (PR #40).*

1. **Prompt caching — SHIPPED (PR #40).** The system prompt (persona, 22-action
   catalog, memory facts) is now an Anthropic ephemeral-cacheable block.
   Repeat turns bill cached input at ~10% and respond faster. Response
   surfaces `cache: { cacheRead, cacheCreated }` for observability.
   Follow-up: client splits system prompt into stable prefix + dynamic
   suffix blocks for higher hit rates.
2. **Structured outputs for actions.** Replace "ALWAYS return valid JSON"
   begging + fragile client parsing with Anthropic tool_use/strict schemas.
   Fewer misparses = fewer retries = less spend; shorter prompts too.
3. **Nano-first routing.** On-device Gemini Nano (already wired for vision +
   budget text) becomes the first attempt for simple intents (add task, log
   emotion, classification); cloud only on failure. Highest-frequency calls
   become free.
4. **Memory auto-capture.** Turn on the reserved `auto` memory source:
   Hermes proposes facts to a review queue via the existing `updateMemory`
   action. Compounds household smarts weekly, no bigger model needed.
5. **Per-request model routing.** Replace the household-wide tier toggle with
   routing by complexity: Nano/haiku for chat + quick capture, sonnet for
   weekly summaries + custody parsing. Same budget, better where it counts.
6. **History summarization + briefing cache.** Cap conversation history, roll
   old turns into a summary; cache the morning briefing per day instead of
   recomposing.
