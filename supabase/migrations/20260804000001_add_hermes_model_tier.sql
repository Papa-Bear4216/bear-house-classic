-- 20260804000001_add_hermes_model_tier.sql
-- Household-tunable Hermes chat model. HermesChat.tsx previously hardcoded
-- claude-haiku for every message, overriding api/chat.ts's own tier logic.
-- Default stays 'haiku' (free/cheap); a household can opt into 'sonnet' for
-- consistently better reasoning/action-planning at real per-message cost.
alter table households
  add column hermes_model_tier text not null default 'haiku' check (hermes_model_tier in ('haiku', 'sonnet'));
