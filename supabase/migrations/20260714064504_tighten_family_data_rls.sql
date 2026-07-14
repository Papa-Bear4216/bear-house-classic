-- Prior policy allowed unrestricted anon read of all family_data rows.
-- Replace with household-scoped, authenticated-only access. Applied via
-- MCP during Task 6; reconstructed here to keep the repo in sync with
-- the live DB (verified byte-identical against pg_policies).
drop policy if exists "anon_read_only" on public.family_data;

create policy "members read own household data" on public.family_data
  for select
  to authenticated
  using (
    household_id in (select household_id from public.household_members where auth_user_id = (select auth.uid()))
  );
