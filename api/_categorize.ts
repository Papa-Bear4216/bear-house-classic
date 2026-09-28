// api/_categorize.ts
// AI transaction categorization with a merchant→category cache.
//
// Calls fetchAi directly (server/streamBody.ts) instead of self-fetching
// /api/chat over HTTP — the old self-call sent no Authorization header, but
// chat.ts requires one, so every classification 401'd, hit the catch below,
// and permanently cached every merchant as 'Other' (the cache never
// distinguishes "the model said Other" from "the call failed"). Calling the
// provider layer directly means real key resolution and no auth mismatch.

import { normalizeMerchant } from './_subscriptions.js';
import { fetchAi } from './_streamBody.js';
import { resolveAiKeys } from './_aiKeys.js';
import { CLAUDE_MODELS } from './_aiModels.js';

const CATEGORIES = ['Housing','Food','Transportation','Utilities','Insurance','Entertainment','Clothing','Healthcare','Savings','Kids','Pets','Other'];

async function classifyBatch(householdId: string, merchants: string[]): Promise<Record<string, string> | null> {
  if (merchants.length === 0) return {};
  const prompt = `Categorize each merchant into exactly one of: ${CATEGORIES.join(', ')}.
Return ONLY a JSON object mapping the merchant string to its category. Merchants:
${merchants.map((m) => `- ${m}`).join('\n')}`;

  try {
    const { anthropicKey, geminiKey } = await resolveAiKeys(householdId);
    if (!anthropicKey && !geminiKey) return null; // no key configured — don't cache a guess

    const result = await fetchAi(CLAUDE_MODELS.haiku, '', [{ role: 'user', content: prompt }], 512, anthropicKey, geminiKey);
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null; // malformed/truncated output — don't cache a guess
    const parsed = JSON.parse(jsonMatch[0]);
    const out: Record<string, string> = {};
    for (const m of merchants) {
      const c = parsed[m];
      out[m] = CATEGORIES.includes(c) ? c : 'Other';
    }
    return out;
  } catch {
    return null; // network/parse failure — don't cache a guess; retry next run
  }
}

export async function categorize<T extends { notes: string }>(
  householdId: string,
  txns: T[],
  cache: Record<string, string>,
): Promise<Array<T & { category: string }>> {
  const keyed = txns.map((t) => ({ t, key: normalizeMerchant(t.notes) }));
  const uncached = [...new Set(keyed.map((k) => k.key).filter((k) => k && !(k in cache)))];
  if (uncached.length) {
    const results = await classifyBatch(householdId, uncached);
    // Only cache real classifications — a failed/malformed call returns null
    // and is left uncached so the next sync retries it, instead of
    // permanently freezing every merchant as 'Other'.
    if (results) {
      for (const [m, c] of Object.entries(results)) cache[m] = c;
    }
  }
  return keyed.map(({ t, key }) => ({ ...t, category: cache[key] || 'Other' }));
}
