-- 20260805000000_add_gmail_server_oauth.sql
-- Per-member server-side Gmail OAuth (authorization-code flow, refresh
-- token stored encrypted) — distinct from the existing client-side
-- implicit-flow token in sessionStorage (src/lib/auth.ts), which expires
-- in ~1hr and only exists while that member's browser tab is open. This
-- lets server-side routes (api/gmail-suggestions.ts, api/walmart.ts, future
-- background Hermes checks) read a member's Gmail without their browser
-- being open at all.
alter table household_members
  add column gmail_refresh_token_encrypted text,
  add column gmail_connected_email text,
  add column gmail_connected_at timestamptz;
