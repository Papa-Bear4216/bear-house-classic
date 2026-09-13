-- 20260913010000_device_tokens_person_id.sql
-- Links each device token to the household_member who registered it, so
-- notifications can be targeted at one person instead of the whole
-- household. Nullable: existing rows (registered before this column
-- existed) simply aren't targetable individually until they re-register,
-- which happens automatically on next login (see src/lib/push.ts).
alter table public.device_tokens
  add column if not exists person_id uuid references public.household_members(id) on delete cascade;

create index if not exists device_tokens_person_id_idx
  on public.device_tokens(household_id, person_id);
