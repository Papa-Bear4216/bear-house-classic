# Task: Scaffold & scope "seamlessness" features for bear-house-classic

Repo: `C:\Users\micha\OneDrive\Desktop\projects\bear-house-classic`
Full plan already written by Claude Code at: `C:\Users\micha\.claude\plans\distributed-growing-mountain.md` — read that file first, it has the ordering, phases, and file-level pointers.

## Your job

Do NOT implement anything yet. Just scaffold and scope:

1. Read `CLAUDE.md` in the repo root for architecture (Vite/React SPA + Vercel Edge Functions + Supabase, household-scoped multi-tenancy, `resolveHouseholdId` trust boundary).
2. Read the phase plan and pick **Phase 0, item 1 (push notifications)** as the starting point — a full design spec already exists on git branch `feat/native-push-notifications` at `docs/superpowers/specs/2026-07-22-native-push-notifications-design.md` (docs only, no code yet).
3. For that item, produce:
   - The exact list of new/changed files (spec already names them: `api/register-push-token.ts`, `api/_notify.ts` addition, `src/lib/push.ts`, `device_tokens` migration, `AndroidManifest.xml` permission, `google-services.json` placement).
   - Any open questions that need a human decision before writing code (e.g. Firebase project access, whether to reuse existing `prime-mechanic-463314-m8` project).
   - A rough file-by-file diff outline (not full code) so Claude Code can implement it in one pass next.
4. Do the same lightweight scope pass for Phase 0 items 2-4 (notification bundling, offline queue, optimistic UI) since they build on each other.

Stop after scoping — hand the scoped-out plan back rather than writing implementation code. Output should be a markdown file at `C:\Users\micha\OneDrive\Desktop\projects\bear-house-classic\HERMES_SCOPE_OUTPUT.md`.
