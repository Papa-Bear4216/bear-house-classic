-- 20260815000000_add_household_ha_config.sql
-- Per-household Home Assistant connection (self-hosted or Nabu Casa URL +
-- long-lived access token). Token stored encrypted (AES-GCM via
-- api/_crypto.ts, ENCRYPTION_KEY env var) — never plaintext at rest.
-- Optional; when unset, HA-calling routes fall back to the app's shared
-- HOME_ASSISTANT_URL/HOME_ASSISTANT_TOKEN env vars (see api/_haConfig.ts).
alter table households
  add column ha_url text,
  add column ha_token_encrypted text,
  add column ha_configured_at timestamptz;
