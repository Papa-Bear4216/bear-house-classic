-- Structured household-scoped Hermes memory with dedupe, retrieval and review metadata.
alter table public.household_memory
  add column member_id uuid references public.household_members(id) on delete set null,
  add column subject_member_id uuid references public.household_members(id) on delete set null,
  add column kind text not null default 'fact'
    check (kind in ('fact','preference','routine','pattern','correction')),
  add column importance smallint not null default 5 check (importance between 1 and 10),
  add column status text not null default 'active'
    check (status in ('active','pending_review','superseded','archived')),
  add column dedupe_hash text,
  add column last_seen_at timestamptz not null default now(),
  add column expires_at timestamptz;

-- Backfill normalized dedupe keys and archive duplicate legacy notes, retaining
-- the newest row for each household and normalized fact.
with ranked as (
  select id,
         lower(regexp_replace(trim(text), '\s+', ' ', 'g')) as normalized,
         row_number() over (
           partition by household_id, lower(regexp_replace(trim(text), '\s+', ' ', 'g'))
           order by created_at desc, id asc
         ) as position
  from public.household_memory
)
update public.household_memory as memory
set dedupe_hash = ranked.normalized,
    status = case when ranked.position = 1 then 'active' else 'archived' end,
    last_seen_at = memory.created_at
from ranked
where memory.id = ranked.id;

create unique index household_memory_active_dedupe_idx
  on public.household_memory (household_id, dedupe_hash)
  where status = 'active' and dedupe_hash is not null;

create index household_memory_retrieval_idx
  on public.household_memory (household_id, status, importance desc, last_seen_at desc, id asc);

create index household_memory_pending_idx
  on public.household_memory (household_id, created_at desc)
  where status = 'pending_review';
