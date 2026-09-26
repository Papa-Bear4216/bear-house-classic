-- 20260926000000_add_voice_trigger_token.sql
-- Per-household voice trigger webhook token for IFTTT-style triggers.
-- Used by api/voice-trigger.ts to authenticate webhook calls from
-- Google Assistant, Alexa, and IFTTT without a Supabase Auth session.
-- Backfilled from existing webhook_token for household #1 on deploy.
alter table households
  add column voice_trigger_token text unique;

create index if not exists households_voice_trigger_token_idx on households (voice_trigger_token);
