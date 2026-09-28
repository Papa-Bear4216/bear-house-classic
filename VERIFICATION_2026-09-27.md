# Verification Evidence — 2026-09-28 01:16 CDT

**Commit:** `84a2d1f` — "fix: kill dead Gemini models + add JSON mode input gating per triad review"

## Test Results
- **Test Files:** 57 passed (57)
- **Tests:** 506 passed (506)
- **Server/ tests:** 3 files / 28 passed
- **Duration:** 6.90s

## Lint
- **eslint:** 0 errors, 0 warnings

## Build
- **vite build:** ✓ built in 19.93s
- **dist/index.html hash:** `d1e596c547318a1de0d7f406fcaea05b`

## TypeScript
- **tsc -p tsconfig.app.json --noEmit:** 2 pre-existing errors in `src/lib/voice.ts` (WebSpeech API DOM types not in project lib config — `Dashboard.tsx`, `Emotions.tsx`, `HouseholdBrain.tsx`, `Promises.tsx`, `QualityTime.tsx`, `BillTracker.tsx`, `HermesChat.tsx`, `Pantry.tsx`, `Shopping.tsx`, `MealPlanner.tsx`, `sync.ts`, `familyos.ts`). These are NOT from today's changes. Bare `tsc --noEmit` returns 0 because root `tsconfig.json` has `files: []`. Client-side only, not runtime issues.

## Changed Files (5)
| File | Change |
|---|---|
| `api/_schemas.ts` | Added `BriefingJsonInputSchema` + `SecretaryParseSchema` (+28 lines) |
| `api/briefing.ts` | Import `GEMINI_MODEL`/`CLAUDE_MODELS`/`BriefingJsonInputSchema`; kill dead `gemini-2.0-flash`; add JSON mode input gating (+25/−7) |
| `api/secretary.ts` | Import `GEMINI_MODEL`/`CLAUDE_MODELS`; kill dead `gemini-2.0-flash`; add `SecretaryParseSchema` validation on LLM output (+15/−7) |
| `api/chat.ts` | CRLF normalization only (no functional change) |
| `vitest.config.ts` | CRLF normalization only (no functional change) |

## Security Impact
- **Dead model removed:** `gemini-2.0-flash` (deprecated, unreliable) replaced with `gemini-2.5-flash` (shared `GEMINI_MODEL` constant) in both briefing.ts and secretary.ts
- **Input gating:** Briefing JSON-mode requests now validated against `BriefingJsonInputSchema` before reaching prompt construction — closes the gap where a caller could inject oversized/malformed JSON into the briefing prompt without shape validation
- **Output validation:** Secretary LLM output now validated against `SecretaryParseSchema` before trusting its keys — closes the parse→validate gap per triad finding

## Known Outstanding (from Claude's full-codebase triad review `f0553b9`)
- **P0 auth gaps** (5): `data-write.ts` cross-household R/W — FIXED in `65be63d`; `finance-sync`/`preempt-refresh` no auth — NOT YET FIXED; Gmail OAuth state forgeable — NOT YET FIXED; no role gating on device control — NOT YET FIXED; Alexa/Google auth model mismatch — NOT YET VERIFIED
- **P1 data corruption races** (6): `calendar-sync.ts`, `classroom.ts`, `daily-brain.ts`, `finance.ts`, `familyos.ts` reward redemption, `server/streamBody.ts` streaming fallback — NOT YET FIXED
- **Tooling gap:** `tsc --noEmit` silently checks nothing — need `tsc -p tsconfig.app.json --noEmit` or `tsc -b` for real coverage

## Verify Command
```bash
cd C:/Users/micha/projects/bear-house-classic
npm test && npm run lint && npm run build && npx tsc -p tsconfig.app.json --noEmit
```
