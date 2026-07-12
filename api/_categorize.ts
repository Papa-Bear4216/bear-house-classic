// api/_categorize.ts
// AI transaction categorization with a merchant→category cache.
// Delegates the model call to /api/chat so it inherits the Claude→Gemini fallback.

import { normalizeMerchant } from './_subscriptions.js';

const CATEGORIES = ['Housing','Food','Transportation','Utilities','Insurance','Entertainment','Clothing','Healthcare','Savings','Kids','Pets','Other'];

async function classifyBatch(baseUrl: string, merchants: string[]): Promise<Record<string, string>> {
  if (merchants.length === 0) return {};
  const prompt = `Categorize each merchant into exactly one of: ${CATEGORIES.join(', ')}.
Return ONLY a JSON object mapping the merchant string to its category. Merchants:
${merchants.map((m) => `- ${m}`).join('\n')}`;

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // maxTokens<=512 picks the cheap haiku tier in api/chat.ts; enough for a JSON map.
      body: JSON.stringify({ prompt, maxTokens: 512 }),
    });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    const data = (await res.json()) as any;
    const text = data?.text ?? '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    const out: Record<string, string> = {};
    for (const m of merchants) {
      const c = parsed[m];
      out[m] = CATEGORIES.includes(c) ? c : 'Other';
    }
    return out;
  } catch {
    return Object.fromEntries(merchants.map((m) => [m, 'Other']));
  }
}

export async function categorize<T extends { notes: string }>(
  baseUrl: string,
  txns: T[],
  cache: Record<string, string>,
): Promise<Array<T & { category: string }>> {
  const keyed = txns.map((t) => ({ t, key: normalizeMerchant(t.notes) }));
  const uncached = [...new Set(keyed.map((k) => k.key).filter((k) => k && !(k in cache)))];
  if (uncached.length) {
    const results = await classifyBatch(baseUrl, uncached);
    for (const [m, c] of Object.entries(results)) cache[m] = c;
  }
  return keyed.map(({ t, key }) => ({ ...t, category: cache[key] || 'Other' }));
}
