-- 20260717000000_add_bypass_billing.sql
-- Creator-only exemption from the subscription paywall. No API endpoint
-- writes this column — it is set only via direct SQL/Supabase dashboard,
-- by design (see docs/superpowers/specs/2026-07-17-billing-completion-and-bypass-design.md).
alter table households
  add column bypass_billing boolean not null default false;
