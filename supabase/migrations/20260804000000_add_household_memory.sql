-- 20260804000000_add_household_memory.sql
-- Household-wide Hermes memory. Replaces the per-device localStorage
-- 'hermes_memory' text blob (still readable client-side for one-time
-- migration) with a real, shared table so what Hermes learns on one
-- device is known on every device in the household.
create table public.household_memory (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  text text not null,
  source text not null default 'auto' check (source in ('auto', 'manual')),
  created_at timestamptz not null default now()
);

create index household_memory_household_id_idx on public.household_memory(household_id);

-- RLS: service_role (used by api/) bypasses this; this policy covers the
-- one browser-side read path (Settings UI listing current memories).
alter table public.household_memory enable row level security;

create policy "members read own household memory" on public.household_memory
  for select
  to authenticated
  using (
    household_id in (select household_id from public.household_members where auth_user_id = (select auth.uid()))
  );
