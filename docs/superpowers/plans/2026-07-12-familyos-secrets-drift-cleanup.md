# FamilyOS Secrets & Drift Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move hardcoded Supabase credentials into env vars, rotate the exposed anon key, verify Row-Level Security state, and delete stack drift (Firestore artifacts, stray `.next/`).

**Architecture:** Three independent hardening chores. Secrets move from source into Vite/Vercel env vars; the committed key is rotated in the Supabase dashboard (user action); RLS is verified with a one-line probe; dead files are removed.

**Tech Stack:** Vite env vars (`import.meta.env.VITE_*`), Vercel env vars, Supabase dashboard, git.

## Global Constraints

- `.env*` is already gitignored — never commit real secret values.
- The frontend Supabase client is `src/lib/sync.ts`; the server-side helper is `api/_db.ts`. Both currently hardcode `SUPABASE_URL` and the anon key. Server routes read `process.env.SUPABASE_ANON_KEY`; frontend hardcodes both.
- Rotating the anon key and toggling RLS are **user actions in the Supabase dashboard** — the plan cannot perform them; it provides exact steps and a verification probe.
- No test framework — verify by running the app and curl probes.

---

### Task 1: Move Supabase config to env vars

**Files:**
- Modify: `src/lib/sync.ts`
- Modify: `api/_db.ts`
- Modify: `.env.local` (add vars — not committed)

**Interfaces:**
- Produces: frontend reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; server reads `process.env.SUPABASE_URL` / `SUPABASE_ANON_KEY`.

- [ ] **Step 1: Add vars to `.env.local`**

Append to `.env.local` (values are the CURRENT ones for now; rotated in Task 2):
```
VITE_SUPABASE_URL=https://pbiffzdcythkwtwxtqlu.supabase.co
VITE_SUPABASE_ANON_KEY=<current anon key from src/lib/sync.ts>
SUPABASE_URL=https://pbiffzdcythkwtwxtqlu.supabase.co
SUPABASE_ANON_KEY=<current anon key>
```

- [ ] **Step 2: Update the frontend client**

In `src/lib/sync.ts`, replace the hardcoded constants:
```ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
```

- [ ] **Step 3: Update the server helper**

In `api/_db.ts`, replace the hardcoded URL constant:
```ts
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pbiffzdcythkwtwxtqlu.supabase.co';
```
(The anon key is already read from `process.env.SUPABASE_ANON_KEY` — no change needed there.)

- [ ] **Step 4: Set the same vars in Vercel**

Run (or via the Vercel dashboard → Settings → Environment Variables for the `bear-house-classic` project):
```bash
# Requires vercel CLI + link; otherwise do this in the dashboard.
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
```
Repeat for `preview` and `development` environments as needed.

- [ ] **Step 5: Verify the app still runs**

Run: `npm run dev` → app loads, sync works (data pulls from Supabase).
Then `npm run build` → clean build.
Verify no hardcoded key remains in source:
```bash
grep -rn "eyJhbGci" src/ api/ || echo "no hardcoded keys"
```
Expected: `no hardcoded keys`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync.ts api/_db.ts
git commit -m "chore(security): move Supabase config to env vars"
```

---

### Task 2: Rotate the exposed anon key (user action)

**Files:** none (dashboard action + env update)

- [ ] **Step 1: Rotate the key in Supabase**

In the Supabase dashboard for project `pbiffzdcythkwtwxtqlu`: Settings → API → roll/regenerate the `anon` public key. (Note: this invalidates the old key everywhere it's used.)

- [ ] **Step 2: Update env vars with the new key**

Replace `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY` values in `.env.local` AND in the Vercel dashboard (all environments) with the new key.

- [ ] **Step 3: Redeploy + verify**

Trigger a Vercel redeploy (push to a branch or `vercel --prod`). Then confirm the live app still syncs (loads family data). If it fails to load data, the new key didn't propagate to Vercel — re-check the dashboard env values.

- [ ] **Step 4: Confirm the old key is dead**

Run with the OLD key:
```bash
curl -s -o /dev/null -w "%{http_code}" "https://pbiffzdcythkwtwxtqlu.supabase.co/rest/v1/family_data?select=key&limit=1" -H "apikey: <OLD_KEY>"
```
Expected: `401` (old key rejected). If it still returns `200`, rotation didn't take effect.

---

### Task 3: Verify RLS on `family_data`

**Files:** none (verification + optional dashboard action)

- [ ] **Step 1: Probe whether the table is publicly readable**

Run with the CURRENT anon key:
```bash
curl -s "https://pbiffzdcythkwtwxtqlu.supabase.co/rest/v1/family_data?select=key&limit=1" -H "apikey: <CURRENT_ANON_KEY>"
```
- If it returns rows: the anon role can read the table. Given the "good-enough / family trust" posture this is acceptable **only if that's intended**. Note it explicitly.
- If it returns `[]` or a permission error with RLS on and no policy: fine.

- [ ] **Step 2: Decide and document**

The app REQUIRES the anon key to read/write `family_data` (that's how sync works), so a fully-locked table would break the app. Acceptable end states under "family trust":
- **RLS on + permissive anon policy** (read/write allowed for anon) — same practical access, but explicit and revocable. **Recommended.**
- **RLS off** — works, but the table is world-read/write to anyone with the (public, in-bundle) anon key. Acceptable only knowingly.

If RLS is off, in the Supabase dashboard → Authentication → Policies, enable RLS on `family_data` and add a permissive policy (anon select+insert+update) so the app keeps working while the state is explicit. Record the choice in the commit message / a note.

- [ ] **Step 3: Re-verify the app after any policy change**

Run `npm run dev` → confirm data still syncs. If sync breaks, the policy is too strict — loosen the anon policy to allow select+insert+update on `family_data`.

---

### Task 4: Delete stack drift

**Files:**
- Delete: `.next/` (stray Next.js build output — this is a Vite app)
- Delete: `firestore-debug.log`
- Delete: `ha_states.json`, `ha_integrations.json` (375KB audit dumps — keep `ha_audit_plan.md` as the runbook)
- Modify: `.gitignore` (ensure `.next` and debug logs stay out)

**Interfaces:** none — pure cleanup.

- [ ] **Step 1: Confirm these are not referenced anywhere**

Run:
```bash
grep -rn "firestore\|\.next/" src/ api/ package.json vite.config.ts 2>/dev/null || echo "no references"
```
Expected: `no references` (or only incidental). If any source imports Firestore, STOP — the spec assumed Supabase-only; surface the conflict before deleting.

- [ ] **Step 2: Remove the files**

Run:
```bash
rm -rf .next firestore-debug.log ha_states.json ha_integrations.json
```

- [ ] **Step 3: Ensure `.gitignore` covers regenerated drift**

Confirm `.gitignore` contains `.next` (add it if missing — the current file ignores `dist` and `*.log` but not `.next`):
```
.next
```

- [ ] **Step 4: Verify build still clean**

Run: `npm run build`
Expected: clean build, app unaffected.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove stack drift (.next, firestore log, HA audit dumps)"
```

---

## Self-Review Notes

- **Spec coverage:** §4 secrets → Tasks 1,2; RLS verification → Task 3; drift deletion → Task 4. All of build-order item 6 covered.
- **User-action tasks flagged:** Task 2 (key rotation) and Task 3 (RLS policy) require Supabase dashboard access the agent doesn't have — steps are exact and each has a curl verification the agent CAN run.
- **Safety:** Task 4 Step 1 gates deletion on "nothing references these" and explicitly says STOP if a Firestore import exists, so cleanup can't silently break a real dependency.
- **Ordering note:** this plan is independent of the reliability and finance plans and can run any time; per the spec build order it runs last.
