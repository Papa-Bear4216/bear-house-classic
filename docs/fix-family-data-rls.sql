-- ============================================================================
-- FIX: family_data Row-Level Security
-- Project: zjialvdolbkccduuwsck  (Bear House / FamilyOS)
-- Written: 2026-07-12
--
-- WHY: The anon key is committed to a public GitHub repo (src/lib/sync.ts).
-- Verified live on 2026-07-12: an anonymous client could INSERT and SELECT
-- rows in family_data. That makes your entire household DB world-writable.
--
-- CONTEXT THAT SHAPES THE FIX: FamilyOS authenticates users via Google
-- Sign-In *client-side only*. The Supabase client is NEVER given an auth
-- session — every request hits the DB as the `anon` role. Therefore you
-- CANNOT scope policies to `authenticated` (that role never exists here);
-- doing so would lock the whole app out.
--
-- ⚠️  DEPENDENCY WARNING — READ BEFORE RUNNING OPTION A ⚠️
-- The app's PRIMARY writes are CLIENT-SIDE: src/lib/familyos.ts saveJSON()
-- -> src/lib/sync.ts pushToCloud() -> supabase.from('family_data').upsert()
-- using the anon key IN THE BROWSER. Tasks, presence, emotions, pillars,
-- and activities all persist this way.
--
-- If you run OPTION A while the app still writes client-side with anon,
-- ALL cloud sync breaks SILENTLY (pushToCloud ignores the returned error,
-- so not even a console warning fires; localStorage keeps working, so it
-- looks fine on one device while multi-device sync rots).
--
-- CORRECT ORDER:
--   1. Migrate every saveJSON write to a server-side API route that holds
--      the service_role key (the service key CANNOT live in sync.ts — that
--      is the browser bundle). This is a real project, not a one-liner.
--   2. THEN run OPTION A.
-- There is NO SQL that both closes the hole and keeps client writes working.
--
-- (Note: the Anthropic/Gemini API keys and camera token are written with
-- localStorage.setItem directly, NOT saveJSON, so they do NOT sync to this
-- table and are not exposed by the RLS hole. Verified 2026-07-12.)
--
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- ============================================================================

-- 0. Clean up the leftover probe row from the 2026-07-12 RLS test.
delete from public.family_data where key = '__rls_probe__';

-- 1. Turn RLS ON (this alone denies ALL anon access until a policy allows it).
alter table public.family_data enable row level security;

-- ============================================================================
-- OPTION A (RECOMMENDED): anon can READ, nobody writes via anon.
-- Writes go through your serverless API using the service_role key, which
-- bypasses RLS entirely. This is the correct model for your auth setup.
-- ============================================================================
drop policy if exists "anon_read_only" on public.family_data;
create policy "anon_read_only"
  on public.family_data
  for select
  to anon
  using (true);

-- No insert/update/delete policy for anon => those are denied.
-- service_role bypasses RLS, so your server-side writes keep working
-- once api/_db.ts uses SUPABASE_SERVICE_KEY instead of the anon key.

-- ============================================================================
-- OPTION B (STOPGAP ONLY): keep client-side writes working TODAY without
-- changing app code. This still lets anyone with the public anon key write,
-- so it is NOT a real fix — it only un-breaks nothing. Prefer Option A.
-- If you must ship before wiring the server-side key, at least this is
-- explicit rather than "RLS accidentally off". Uncomment to use, and DROP
-- Option A's policy first.
-- ============================================================================
-- drop policy if exists "anon_read_only" on public.family_data;
-- create policy "anon_full_access_STOPGAP" on public.family_data
--   for all to anon using (true) with check (true);

-- ============================================================================
-- VERIFY after running (should return rows for SELECT, and your anon key
-- should get a 401/permission error on INSERT under Option A):
--   select * from public.family_data;
-- ============================================================================
