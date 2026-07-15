-- Task 1's original policies on household_members/households were
-- self-referentially recursive: the household_members SELECT policy's
-- subquery re-queries household_members, which re-applies the same
-- policy, causing "infinite recursion detected in policy" at query time.
-- Fix: a SECURITY DEFINER helper that resolves "my household ids" without
-- re-triggering RLS, scoped safely to auth.uid() so it never leaks other
-- users' data despite being callable by any authenticated role.
create or replace function public.current_user_household_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select household_id from public.household_members
  where auth_user_id = (select auth.uid())
$$;

drop policy "members read own household roster" on public.household_members;
create policy "members read own household roster" on public.household_members
  for select to authenticated
  using ( household_id in (select public.current_user_household_ids()) );

drop policy "members read own household" on public.households;
create policy "members read own household" on public.households
  for select to authenticated
  using ( id in (select public.current_user_household_ids()) );

-- Link Daddy's now-existing auth.users row (created by first real Google
-- sign-in) to the backfilled household_members row, per plan Task 4
-- Step 2.
update public.household_members
set auth_user_id = (select id from auth.users where email = 'michael711hebert@gmail.com')
where email = 'michael711hebert@gmail.com' and auth_user_id is null;
