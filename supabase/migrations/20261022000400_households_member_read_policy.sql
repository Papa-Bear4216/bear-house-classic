-- Re-assert the members-read-own-household policy idempotently. It previously lived only in
-- 20261002120000_harden_households_rls.sql (now parked in supabase/_superseded/ because its
-- voice_trigger_token revoke fails on the live schema), so a fresh `supabase db reset`
-- would otherwise end up with column grants but no SELECT policy. Identical to the live policy.
drop policy if exists "guardians read own household" on public.households;
drop policy if exists "members read own household" on public.households;

create policy "members read own household" on public.households
  for select to authenticated
  using ( id in (select public.current_user_household_ids()) );
