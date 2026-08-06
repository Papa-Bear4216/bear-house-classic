-- 20260806000000_add_household_activity.sql
-- Household activity feed: "who did what" so members don't have to ask
-- each other what changed. Logged client-side (task/shopping/etc. writes
-- happen via family_data, not server API routes — see src/lib/sync.ts),
-- so this is a simple append-only log, not derived from a server hook.
create table public.household_activity (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index household_activity_household_id_idx on public.household_activity(household_id, created_at desc);

-- RLS: service_role (used by api/) bypasses this; this policy covers the
-- one browser-side read path (the activity feed UI).
alter table public.household_activity enable row level security;

create policy "members read own household activity" on public.household_activity
  for select
  to authenticated
  using (
    household_id in (select household_id from public.household_members where auth_user_id = (select auth.uid()))
  );
