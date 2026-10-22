-- Server-owned repair telemetry and weekly developer feedback.
create table public.hermes_repair_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  surface text,
  issue_type text not null check (issue_type in (
    'memory_write_failed','memory_dedupe','memory_supersede','memory_expired',
    'cache_stale','tool_degraded','snapshot_missing','context_overflow','other'
  )),
  detail text not null,
  action_taken text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index hermes_repair_log_household_recent_idx
  on public.hermes_repair_log (household_id, created_at desc, issue_type, success);
create index hermes_repair_log_global_recent_idx
  on public.hermes_repair_log (created_at desc, success);

create table public.hermes_dev_feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  week_of date not null,
  repairs_made integer not null default 0,
  repairs_failed integer not null default 0,
  suggested_changes jsonb not null default '[]'::jsonb,
  performance_notes text,
  flagged_for_review boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index hermes_dev_feedback_household_week_idx
  on public.hermes_dev_feedback (household_id, week_of)
  where household_id is not null;
create unique index hermes_dev_feedback_global_week_idx
  on public.hermes_dev_feedback (week_of)
  where household_id is null;
create index hermes_dev_feedback_flagged_idx
  on public.hermes_dev_feedback (week_of desc)
  where flagged_for_review;

alter table public.hermes_repair_log enable row level security;
alter table public.hermes_dev_feedback enable row level security;

-- These tables are reachable through the Data API only to server service-role
-- requests. No browser role gets table access, and there are no RLS policies.
revoke all on public.hermes_repair_log, public.hermes_dev_feedback from anon, authenticated;
grant select, insert, update on public.hermes_repair_log, public.hermes_dev_feedback to service_role;
