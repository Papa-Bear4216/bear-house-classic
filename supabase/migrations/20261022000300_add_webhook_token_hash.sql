-- Store a SHA-256 hash of each household webhook token so lookups no longer
-- need the plaintext. Tokens are 256-bit random values, so a fast unsalted hash
-- is appropriate and keeps indexed equality lookup. Plaintext stays in place
-- (dual-read) until a household rotates its token via /api/webhook-token, which
-- nulls the plaintext. The column is not granted to anon/authenticated
-- (households grants are an explicit column allowlist since 20261022000200).
alter table public.households
  add column if not exists webhook_token_hash text unique;

update public.households
   set webhook_token_hash = encode(sha256(convert_to(webhook_token, 'UTF8')), 'hex')
 where webhook_token is not null
   and webhook_token_hash is null;
