import { dbGetHouseholdHA } from './_db.js';
import { decryptSecret } from './_crypto.js';
import { logInfo } from './_log.js';

/**
 * Resolves the effective Home Assistant URL/token for one household: their
 * own connection if they've set one (api/settings-ha.ts), else this app's
 * shared HOME_ASSISTANT_URL/HOME_ASSISTANT_TOKEN env vars (the original
 * single-household setup). Every HA-calling route should call this right
 * after resolving householdId, instead of reading process.env directly.
 *
 * The shared fallback is a single token every household without its own HA
 * connection inherits — fine while there's one real household, a growing
 * blast radius if more sign up. Logged (not yet hard-errored) so a second
 * household landing on it is visible instead of silent; see
 * memory/project_bearhouse.md before turning this into an error, since the
 * app's own household may still be relying on the fallback today.
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

  logInfo('_haConfig', 'household using shared fallback HA token', { householdId });
  return { haUrl: sharedUrl, haToken: sharedToken };
}
