/**
 * Cheap model tier for low-stakes text calls (daily briefing, task enrichment,
 * Gmail suggestions). Goes through the Vercel AI Gateway's OpenAI-compatible
 * endpoint, so it works with any gateway model id. Tool-using chat and image
 * reading are NOT routed here — they stay on Claude.
 *
 * Off unless AI_GATEWAY_API_KEY is set. Returns null on any miss so callers
 * fall through to their normal Claude/Gemini key path.
 */

const GATEWAY_CHAT_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_CHEAP_MODEL = 'google/gemini-2.5-flash-lite';

export function cheapModelEnabled(): boolean {
  return !!process.env.AI_GATEWAY_API_KEY && process.env.HERMES_CHEAP_MODEL !== 'off';
}

export async function tryCheapModel(prompt: string, maxTokens = 600): Promise<string | null> {
  if (!cheapModelEnabled()) return null;
  try {
    const res = await fetch(GATEWAY_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.HERMES_CHEAP_MODEL || DEFAULT_CHEAP_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === 'string' && text.trim() ? text : null;
  } catch {
    return null;
  }
}
