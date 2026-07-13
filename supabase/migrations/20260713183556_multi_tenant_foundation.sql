-- households: one row per signed-up family
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'none',
  created_at timestamptz not null default now()
);

-- household_members: replaces the hardcoded USERS/FAMILY arrays with real rows
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  role text not null check (role in ('superadmin', 'admin', 'child', 'pet')),
  color text not null default 'slate',
  pin_hash text,
  created_at timestamptz not null default now()
);

create index household_members_household_id_idx on public.household_members(household_id);
create index household_members_auth_user_id_idx on public.household_members(auth_user_id);

-- family_data gets a nullable household_id — NOT backfilled yet, NOT NOT NULL yet.
-- RLS on family_data is intentionally left unchanged in this task (see plan header).
alter table public.family_data add column household_id uuid references public.households(id);

-- RLS on the two new tables: enabled now (they're brand new, no legacy anon
-- readers depend on them), scoped to household membership.
alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "members read own household" on public.households
  for select
  to authenticated
  using (
    id in (select household_id from public.household_members where auth_user_id = (select auth.uid()))
  );

create policy "members read own household roster" on public.household_members
  for select
  to authenticated
  using (
    household_id in (select household_id from public.household_members where auth_user_id = (select auth.uid()))
  );
