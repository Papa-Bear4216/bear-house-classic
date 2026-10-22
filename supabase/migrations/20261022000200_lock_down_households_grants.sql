-- Lock down client access to public.households.
-- authenticated previously held table-level SELECT/INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES,
-- so every member could read webhook_token, encrypted BYO/HA keys, Stripe ids and address fields.
-- RLS (the "members read own household" SELECT policy) still scopes rows; this scopes columns.
-- service_role is untouched (api/ uses it for all writes and secret reads).
-- Client reads: src/lib/householdAuth.ts embeds households(subscription_status, bypass_billing,
-- voice_unlocked, hermes_model_tier); id/name/created_at are included for joins and display.

revoke all on public.households from anon, authenticated;

grant select (id, name, created_at, subscription_status, bypass_billing, voice_unlocked, hermes_model_tier)
  on public.households to authenticated;
