-- 20260805000001_add_device_tokens.sql
-- FCM (Firebase Cloud Messaging) device tokens for native Android push.
-- One row per device install; the token string is unique, so a device that
-- re-registers upserts the existing row (refreshing household_id/platform/
-- updated_at) — handles re-installs, permission re-prompts, and Supabase
-- account switches without leaving orphan rows.
--
-- No RLS policy ON PURPOSE: this table is read and written ONLY by the
-- service_role-backed api/ side (api/register-push-token.ts upserts; the
-- FCM sender in api/_notify.ts reads + prunes). service_role bypasses RLS, so
-- the browser never reads or writes this table and needs no policy — contrast
-- with household_memory, which the Settings UI reads and thus has a select
-- policy. Deliberately NOT exposing device tokens to any client.
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index device_tokens_household_id_idx on public.device_tokens(household_id);

alter table public.device_tokens enable row level security;