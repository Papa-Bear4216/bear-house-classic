/**
 * Family mode switch — Phase 0 (bear-house-classic).
 *
 * New tables:
 *  - families (id, mode 'single' | 'coparent', created_at, updated_at)
 *  - household_family_link (household_id → family_id, role in that family)
 *
 * Backfill: every existing household gets its own single-member family with
 * mode='single'. No existing data is disturbed.
 *
 * Auth rework (application layer, not migration):
 *  - resolveFamilyId(accessToken) replaces bare resolveHouseholdId as the
 *    top-level tenant resolver. Returns { familyId, householdId, householdRole }.
 *  - All existing routes continue to work unchanged for single-family mode.
 *  - Routes that need family-scoped data call resolveFamilyId and thread
 *    familyId through to the new family-scoped helpers.
 *
 * Client:
 *  - useFamilyMode() hook exposes { mode, familyId, households, activeHouseholdId }
 *  - requireMode('coparent') helper for coparent-only surfaces
 */

return `
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

-- Backfill: every existing household gets a single-member family
-- Skipped if families table already has data (safe for re-runs)
do \$\$
begin
  if not exists (select 1 from public.families limit 1) then
    insert into public.families (id, mode)
    select gen_random_uuid(), 'single'
    from public.households;

    insert into public.household_family_link (household_id, family_id, role_in_family)
    select h.id, f.id, 'primary'
    from public.households h
    join public.families f on f.mode = 'single'
    where not exists (
      select 1 from public.household_family_link hfl where hfl.household_id = h.id
    );
  end if;
end;
\$\$;
`;
