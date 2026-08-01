import { dbGetHouseholdKeys } from './_db.js';
import { decryptSecret } from './_crypto.js';

/**
 * Resolves the effective Anthropic/Gemini keys for one request: a
 * household's own BYO key if they've set one (api/settings-keys.ts), else
 * falls back to this app's shared env var keys. Every AI-calling route
 * should call this right after resolving householdId, instead of reading
 * process.env.ANTHROPIC_API_KEY / GEMINI_API_KEY directly.
 */
export async function resolveAiKeys(householdId: string): Promise<{
  anthropicKey: string | undefined;
  geminiKey: string | undefined;
}> {
  const sharedAnthropic = process.env.ANTHROPIC_API_KEY;
  const sharedGemini = process.env.GEMINI_API_KEY;

  const stored = await dbGetHouseholdKeys(householdId);

  let anthropicKey = sharedAnthropic;
  if (stored.byo_anthropic_key_encrypted) {
    try {
      anthropicKey = await decryptSecret(stored.byo_anthropic_key_encrypted);
    } catch (e) {
      console.error('Failed to decrypt household Anthropic key, falling back to shared:', e);
    }
  }

  let geminiKey = sharedGemini;
  if (stored.byo_gemini_key_encrypted) {
    try {
      geminiKey = await decryptSecret(stored.byo_gemini_key_encrypted);
    } catch (e) {
      console.error('Failed to decrypt household Gemini key, falling back to shared:', e);
    }
  }

  return { anthropicKey, geminiKey };
}
