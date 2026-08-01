-- 20260801000000_add_voice_unlocked.sql
-- Per-household premium voice unlock. Redeemed via api/voice-unlock.ts using
-- a developer-distributed 6-digit code (see VOICE_UNLOCK_CODES env var) —
-- independent of Stripe subscription status, same manual-grant spirit as
-- bypass_billing but self-serve through the app instead of dashboard-only.
alter table households
  add column voice_unlocked boolean not null default false;
