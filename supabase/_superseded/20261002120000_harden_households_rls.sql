-- Migration: 20261002120000_harden_households_rls.sql
-- Description: Ensure members can read their own household metadata (for subscription status,
-- bypass billing, and voice unlock join in householdAuth.ts) while strictly revoking column-level
-- SELECT privileges on sensitive voice_trigger_token from public/authenticated users.

-- 1. Ensure members read policy exists and correctly checks current_user_household_ids()
drop policy if exists "guardians read own household" on public.households;
drop policy if exists "members read own household" on public.households;

create policy "members read own household" on public.households
  for select to authenticated
  using ( id in (select public.current_user_household_ids()) );

-- 2. Revoke client-side access to sensitive voice_trigger_token column
-- Serverless endpoints in api/_db.ts use service_role which bypasses this restriction.
revoke select (voice_trigger_token) on public.households from anon, authenticated;
grant select (voice_trigger_token) on public.households to service_role;
