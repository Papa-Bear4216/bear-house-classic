export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbGetHouseholdKeys, dbSetHouseholdKey } from './_db.js';
import { encryptSecret, maskKey } from './_crypto.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, SettingsKeysBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

// Lets a household bring their own Anthropic/Gemini API key instead of
// using this app's shared keys (see api/_aiKeys.ts, used by every AI route).
// GET returns masked values only — the raw key is never sent back to the
// browser once saved.
export default async function handler(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'settings-keys', 20);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  if (req.method === 'GET') {
    const stored = await dbGetHouseholdKeys(householdId);
    // Masking needs the plaintext momentarily; decrypt just to mask, never
    // return it. If decryption fails (bad ENCRYPTION_KEY rotation, etc.),
    // report "set" without a mask rather than leaking an error string.
    const describe = async (encrypted: string | null) => {
      if (!encrypted) return { set: false, masked: null };
      try {
        const { decryptSecret } = await import('./_crypto.js');
        return { set: true, masked: maskKey(await decryptSecret(encrypted)) };
      } catch {
        return { set: true, masked: null };
      }
    };
    return j({
      anthropic: await describe(stored.byo_anthropic_key_encrypted),
      gemini: await describe(stored.byo_gemini_key_encrypted),
    });
  }

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(SettingsKeysBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);

  try {
    if (parsed.data.action === 'clear') {
      await dbSetHouseholdKey(householdId, parsed.data.provider, null);
      return j({ ok: true });
    }
    const encrypted = await encryptSecret(parsed.data.apiKey);
    await dbSetHouseholdKey(householdId, parsed.data.provider, encrypted);
    return j({ ok: true, masked: maskKey(parsed.data.apiKey) });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to save key', 'settings-keys', e);
  }
}
