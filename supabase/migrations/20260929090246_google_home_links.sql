-- ============================================================
-- Google Smart Home (cloud-to-cloud) account linking.
-- google_home_auth_codes: short-lived, single-use OAuth codes (hashed).
-- google_home_links: one row per linked Google account; holds the hashed
--   refresh token and can be revoked (DISCONNECT / unlink).
-- Service role only — RLS on, no policies, so no client role can read tokens.
-- ============================================================

create table if not exists public.google_home_auth_codes (
  code_hash text primary key,
  member_id uuid not null references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  redirect_uri text not null,
  expires_at timestamptz not null
);

create table if not exists public.google_home_links (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  refresh_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists google_home_links_member_idx on public.google_home_links (member_id);

alter table public.google_home_auth_codes enable row level security;
alter table public.google_home_links enable row level security;
revoke all on table public.google_home_auth_codes from public, anon, authenticated;
revoke all on table public.google_home_links from public, anon, authenticated;
grant all on table public.google_home_auth_codes to service_role;
grant all on table public.google_home_links to service_role;
