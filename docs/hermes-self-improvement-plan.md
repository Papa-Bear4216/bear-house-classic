# Hermes Self-Improvement Track — Master Plan

Durable handoff doc: any session (or human) should be able to continue the work from this
file alone. Companion doc: `docs/hermes-mind-palace-plan.md` (memory architecture).

Last updated: 2026-07-07. Lead: Claude session (Gemini track is dead; its Task-1 ticket was
absorbed here).

---

## Architecture reality (investigated, confirmed)

Two Hermes surfaces share one Firebase project (`prime-mechanic-463314-m8`, **named**
Firestore DB `ai-studio-5a6aeb79-f287-4f57-8c65-c96c8b467352` — never "(default)"):

1. **Vercel app** — `Papa-Bear4216/bear-house-classic` (this repo). Next.js. All real AI
   behavior lives here today: `/api/hermes` (chat via OpenRouter: `nousresearch/hermes-4-70b`
   primary → `google/gemini-2.5-flash` fallback), `/api/scan*` (vision), `/api/avatar`
   (Google image gen via `lib/google-image.ts`), `/api/hermes-enhanced` (orchestrator).
2. **GCE VM** — `Papa-Bear4216/hermes-api` (Express, PM2/Caddy, port 80). **Currently a
   28-line stub**: `/health` + `/api/hermes-enhanced` returning canned JSON ("Tacos
   tonight"). No agent loop, no task creation, no Telegram, no Firestore/Anthropic/pino
   usage (deps installed but unimported). The "autonomous agent" does not exist in code yet
   — it must be BUILT, not instrumented. ⚠️ Unverified assumption: that the VM runs this
   repo's HEAD; confirm on the VM (`pm2 ls`, deploy path, `git log`).

Other findings:
- `lib/hermes-enhanced.ts` has an old in-memory `MemoryPalace` (Maps + setTimeout) — loses
  state on every serverless cold start; superseded by the Firestore palace (`lib/palace.ts`).
- No Telegram code in either repo. The Telegram channel mentioned in the original ticket
  doesn't exist in git; a bot token + chat id from the user will be needed when we build it.

## Shared telemetry design (implemented)

Top-level Firestore collection **`hermes_events`** — one audit trail for both surfaces:
`{ ts, source: 'vercel'|'gce', event_type, summary, status: 'ok'|'error', route?, model?,
latencyMs?, userId?, taskId?, error? }`. Writers must strip `undefined` fields and swallow
their own errors (telemetry may never break a response).

---

## Task 1 — Self-monitoring / observability

### Vercel side — ✅ DONE (commit `feat: Hermes observability…`)
- `lib/hermes-events.ts` — `logEvent()` / `errText()`.
- `/api/hermes` instrumented: `ai.chat` ok per reply (model + latency ⇒ fallback-rate is
  computable), `ai.chat.primary_failed`, `ai.chat.failed`, `memory.store` ok/error.
- `/api/scan` → `ai.scan`, `/api/avatar` → `ai.avatar`. (Same pattern extends to
  `/api/scan-room`, `/api/scan-receipt`, `/api/hermes-enhanced` — small follow-up.)
- `/api/hermes/status` (authed GET, `?hours=N` ≤168): totals, byType/bySource/byModel with
  avg latency, chat primary-vs-fallback health %, memories stored, 10 recent errors.

### GCE side — 🔨 IN PROGRESS (branch to create: `claude/hermes-observability` in hermes-api)
Done so far:
- `src/lib/firebase.ts` — admin init via `FIREBASE_SERVICE_ACCOUNT` env or ADC (GCE default
  SA), targeting the named DB above (`FIRESTORE_DATABASE_ID` overridable).

Remaining steps (in order):
1. `src/lib/events.ts` — `logEvent()` with `source: 'gce'` + pino logger (dep already in
   package.json). Same undefined-stripping + error-swallowing as the Vercel twin.
2. `src/app.ts` — `res.on('finish')` middleware on `/api`: one `api.request` event per hit
   (route, `req.body.action`, status from `res.statusCode`, latency). Express 4-arg error
   handler → `api.error` event. INSTRUMENT ONLY — route behavior unchanged.
3. `src/index.ts` — `process.on('uncaughtException'/'unhandledRejection')` → error event +
   pino, then exit(1) for uncaughtException (PM2 restarts).
4. Verify: `npm install && npm run build` (esbuild via build.mjs; repo has NO tsconfig).
5. Commit, push branch, open **draft PR** on `Papa-Bear4216/hermes-api`.
6. **Deploy (user or session with VM access):** on the VM: `git pull`, `npm install`,
   `npm run build`, `pm2 restart hermes-api` (confirm actual PM2 app name). ADC note: the
   VM's default service account needs Firestore access (roles/datastore.user).
7. Verify end-to-end: hit `/api/hermes-enhanced`, then check `hermes_events` has
   `source: 'gce'` records; `/api/hermes/status` on Vercel should show `bySource.gce`.

### Task 1 acceptance
Clean event trail visible for both surfaces; `/api/hermes/status` returns a sane 24h
rollup; a deliberate failure (bad model id) produces an `error` event.

---

## Task 2 — Self-diagnosis (PROPOSED — confirm before building)
Hermes reads its own `hermes_events` and detects degradation:
- Vercel Cron (e.g. hourly) hits an internal diagnosis route: computes fallback rate,
  error clusters, latency drift over the window; compares to thresholds.
- On breach: write a `diagnosis` event + push notification (existing `/api/notify` /
  `getAdminMessaging`), or Telegram once it exists.
- Daily digest: "last 24h: X replies (Y% primary), Z errors, N memories" — same rollup as
  `/api/hermes/status`, pushed instead of pulled.

## Task 3 — Feedback loop (PROPOSED)
👍/👎 on Hermes replies in the UI → `hermes_feedback` collection
`{ prompt, response, model, verdict, recalledMemoryIds, ts }`. Stamp recalled memory ids
into the reply path (small `recallMemories` change) so feedback can reinforce/decay palace
memories — this is **mind-palace Phase 2** (see companion doc).

## Task 4 — Real GCE agent (PROPOSED — biggest build)
Replace the hermes-api stub with an actual agent loop: scheduled wake → read household
state (Firestore) → reason (Anthropic SDK is already a dep; recommend `claude-opus-4-8` via
the API — cheaper/steadier than routing agent work through OpenRouter) → create tasks /
send notifications, every action logged to `hermes_events` (the audit trail from Task 1 is
the safety substrate). Start read-only ("observe + suggest"), graduate to task creation.

## Task 5 — Mind-palace Phase 3 + shared memory (PROPOSED)
Semantic recall (embeddings within rooms); GCE agent reads/writes the same
`households/{uid}/palace/*` so both Hermes surfaces share one memory.

## Task 6 — Autonomous feature development (PROPOSED — needs guardrails discussion)
Hermes proposes its own improvements from diagnosis + feedback data (e.g. opens GitHub
issues with evidence). Do NOT let it ship code unsupervised; human merges.

---

## Standing state / operational notes
- Everything ships on PR #26 (`claude/bear-house-api-gateway-diagnosis-b2bqln`) in
  bear-house-classic unless told to split. hermes-api work goes on its own branch + PR.
- PR #26 already carries: OpenRouter model-id fixes, avatar→Google image gen, mind-palace
  Phase 1, observability (Vercel side), this plan + the palace plan.
- Post-deploy smoke tests still owed (need live keys): hermes chat, scan, avatar,
  `ADD TO MEMORY` → `palace/kitchen`, `/api/hermes/status` rollup.
- Env keys: `AI_GATEWAY_KEY` (OpenRouter) + `GEMINI_API_KEY` (Google) on Vercel — existence
  unconfirmed from sandbox; check Vercel dashboard.
