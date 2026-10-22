/**
 * Cheap model tier for low-stakes text calls (daily briefing, task enrichment,
 * Gmail suggestions). Goes through the Vercel AI Gateway's OpenAI-compatible
 * endpoint, so it works with any gateway model id. Tool-using chat and image
 * reading are NOT routed here — they stay on Claude.
 *
 * Off unless AI_GATEWAY_API_KEY or the deployment's VERCEL_OIDC_TOKEN is present. Returns null on any miss so callers
 * fall through to their normal Claude/Gemini key path.
 */

const GATEWAY_CHAT_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
// Quality first, cost second: Haiku 5.5 costs the same as Flash-Lite ($0.10/$0.50 vs $0.10/$0.40 per M)
// and is the safer default for JSON extraction; flash-lite stays a candidate pending an eval.
const DEFAULT_CHEAP_MODEL = 'anthropic/claude-haiku-5.5';

// An explicit gateway key wins; otherwise the deployment's own OIDC token (Vercel
// injects VERCEL_OIDC_TOKEN, so no key has to be created or stored).
function gatewayToken(): string | undefined {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
}

export function cheapModelEnabled(): boolean {
  return !!gatewayToken() && process.env.HERMES_CHEAP_MODEL !== 'off';
}

export async function tryCheapModel(prompt: string, maxTokens = 600): Promise<string | null> {
  if (!cheapModelEnabled()) return null;
  try {
    const res = await fetch(GATEWAY_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayToken()}`,
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
