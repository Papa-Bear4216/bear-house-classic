-- Drop legacy plaintext webhook tokens now that every one has a verified SHA-256 hash
-- (api/_db.ts looks tokens up by hash first). Only rows whose stored hash matches the
-- plaintext are cleared, so a bad backfill can never lock a household out.
update public.households
   set webhook_token = null
 where webhook_token is not null
   and webhook_token_hash = encode(sha256(convert_to(webhook_token, 'UTF8')), 'hex');
