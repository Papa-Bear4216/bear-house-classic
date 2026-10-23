-- Restore households.voice_trigger_token. 20260926000000_add_voice_trigger_token.sql is recorded
-- as applied on the live project, but the column never existed there, so the voice-trigger
-- routes (api/voice-trigger.ts, api/voice-triggers.ts) fail. Idempotent so fresh DBs that already
-- have the column are unaffected.
-- No client grant: 20261022000200 limits authenticated/anon to an explicit column allowlist,
-- so this column is service_role-only by default.
alter table public.households
  add column if not exists voice_trigger_token text;

create unique index if not exists households_voice_trigger_token_key
  on public.households (voice_trigger_token);
