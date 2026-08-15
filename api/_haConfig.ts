import { dbGetHouseholdHA } from './_db.js';
import { decryptSecret } from './_crypto.js';

/**
 * Resolves the effective Home Assistant URL/token for one household: their
 * own connection if they've set one (api/settings-ha.ts), else this app's
 * shared HOME_ASSISTANT_URL/HOME_ASSISTANT_TOKEN env vars (the original
 * single-household setup). Every HA-calling route should call this right
 * after resolving householdId, instead of reading process.env directly.
 */
export async function resolveHaConfig(householdId: string): Promise<{
  haUrl: string | undefined;
  haToken: string | undefined;
}> {
  const sharedUrl = process.env.HOME_ASSISTANT_URL;
  const sharedToken = process.env.HOME_ASSISTANT_TOKEN;

  const stored = await dbGetHouseholdHA(householdId);

  if (stored.ha_url && stored.ha_token_encrypted) {
    try {
      const haToken = await decryptSecret(stored.ha_token_encrypted);
      return { haUrl: stored.ha_url, haToken };
    } catch (e) {
      console.error('Failed to decrypt household HA token, falling back to shared:', e);
    }
  }

  return { haUrl: sharedUrl, haToken: sharedToken };
}
