-- 20260801000001_add_byo_api_keys.sql
-- Per-household "bring your own API key" for Anthropic/Gemini. Stored
-- encrypted (AES-GCM via api/_crypto.ts, ENCRYPTION_KEY env var) — never
-- plaintext at rest. Both optional; when unset, routes fall back to the
-- app's shared ANTHROPIC_API_KEY/GEMINI_API_KEY (see api/_aiKeys.ts).
alter table households
  add column byo_anthropic_key_encrypted text,
  add column byo_gemini_key_encrypted text;
