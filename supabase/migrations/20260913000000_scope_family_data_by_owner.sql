-- Adds per-member ownership scoping to family_data so a sensitive row (a
-- household member's linked bank connection and synced transactions) can be
-- restricted to that member plus superadmins, instead of the whole
-- household by default.
--
-- owner_member_id is nullable and every existing row keeps it NULL — that
-- preserves today's household-wide visibility for everything already
-- stored (tasks, room map, budget categories, shared expenses, etc). This
-- is additive: nothing that doesn't opt in (by having a caller pass
-- ownerMemberId to dbSet) changes behavior.
--
-- Concretely: api/finance.ts now writes each member's SimpleFIN connection
-- and bank-synced transactions to simplefin_access_<memberId> /
-- familyos_expenses_<memberId> with owner_member_id set to that member.
-- The policy below means an 'admin' role member's family_data SELECT
-- (via the client's realtime/pull sync, or a direct REST call) simply never
-- returns another member's owned row — 'superadmin' is the only role that
-- can see every member's owned rows regardless of who owns them.
alter table public.family_data
  add column owner_member_id uuid references public.household_members(id) on delete set null;

drop policy if exists "members read own household data" on public.family_data;

create policy "members read own household data" on public.family_data
  for select
  to authenticated
  using (
    household_id in (select household_id from public.household_members where auth_user_id = (select auth.uid()))
    and (
      owner_member_id is null
      or owner_member_id in (select id from public.household_members where auth_user_id = (select auth.uid()))
      or exists (
        select 1 from public.household_members
        where auth_user_id = (select auth.uid()) and role = 'superadmin'
      )
    )
  );
