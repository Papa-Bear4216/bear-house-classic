-- 20260720000000_add_webhook_token.sql
-- Per-household webhook token, replacing the single shared WEBHOOK_TOKEN env
-- var as the tenant identifier for external callers (Tasker/IFTTT/HA/NFC)
-- that have no Supabase Auth session. Backfilled from the existing
-- WEBHOOK_TOKEN env var value for household #1 so nothing breaks on deploy —
-- run separately, see accompanying instructions.
alter table households
  add column webhook_token text unique;

create index if not exists households_webhook_token_idx on households (webhook_token);
