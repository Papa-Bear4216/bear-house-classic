-- ============================================================
-- 20260928000000_create_families_tables.sql
-- Phase 0: family mode switch — new tables for multi-household families
-- ============================================================

-- Families: one row per family (single or coparenting group)
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('single', 'coparent')) default 'single',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Link households to families. A household belongs to exactly one family.
-- role_in_family: how this household participates in the family (primary, secondary, etc.)
create table if not exists public.household_family_link (
  household_id uuid not null references public.households(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  role_in_family text not null default 'primary' check (role_in_family in ('primary', 'secondary')),
  created_at timestamptz not null default now(),
  primary key (household_id)
);

-- Enable RLS on new tables
alter table public.families enable row level security;
alter table public.household_family_link enable row level security;

-- Members can read families they belong to via their household link
create policy "members read linked families" on public.families
  for select
  to authenticated
  using (
    id in (
      select family_id
      from public.household_family_link hfl
      join public.household_members hm on hm.household_id = hfl.household_id
      where hm.auth_user_id = auth.uid()
    )
  );

-- Members can read their household's family link
create policy "members read own household family link" on public.household_family_link
  for select
  to authenticated
  using (
    household_id in (
      select household_id
      from public.household_members
      where auth_user_id = auth.uid()
    )
  );

-- Service-role helpers (no RLS bypass needed — these are called via service_role from api/)
-- Families admin: superadmins manage family setup
create policy "superadmins manage families" on public.families
  for all
  to service_role
  using (true)
  with check (true);

create policy "superadmins manage household family links" on public.household_family_link
  for all
  to service_role
  using (true)
  with check (true);

-- Indexes
create index if not exists household_family_link_family_id_idx
  on public.household_family_link(family_id);
create index if not exists household_family_link_household_id_idx
  on public.household_family_link(household_id);

-- Backfill: every existing household gets its own single-member family.
-- Per-row loop with RETURNING so each household is reliably paired with its own
-- newly-created family row (not a Cartesian product). Safe for re-runs:
-- skips households that already have a link.
do $$
declare
  household_row record;
  new_family_id uuid;
begin
  for household_row in
    select h.id
    from public.households h
    where not exists (
      select 1
      from public.household_family_link l
      where l.household_id = h.id
    )
  loop
    insert into public.families (mode)
    values ('single')
    returning id into new_family_id;

    insert into public.household_family_link (household_id, family_id, role_in_family)
    values (household_row.id, new_family_id, 'primary');
  end loop;
end;
$$
