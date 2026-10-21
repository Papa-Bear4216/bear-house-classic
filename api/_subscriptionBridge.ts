/**
 * Client for scripts/subscription-bridge.mjs: runs a text-only prompt through
 * the Claude Code / Codex / Antigravity subscription signed in on the owner's
 * PC. Only households listed in SUBSCRIPTION_BRIDGE_HOUSEHOLDS may use it, so
 * one personal subscription is never shared with other customers. Returns
 * null on any miss so callers fall through to their normal API-key path.
 */

export function bridgeAllowed(householdId: string | undefined): boolean {
  if (!householdId) return false;
  if (!process.env.SUBSCRIPTION_BRIDGE_URL || !process.env.SUBSCRIPTION_BRIDGE_TOKEN) return false;
  const allowed = (process.env.SUBSCRIPTION_BRIDGE_HOUSEHOLDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(householdId);
}

export async function tryBridge(householdId: string | undefined, prompt: string): Promise<string | null> {
  if (!bridgeAllowed(householdId)) return null;
  const provider = process.env.SUBSCRIPTION_BRIDGE_PROVIDER || 'claude';
  try {
    const res = await fetch(`${process.env.SUBSCRIPTION_BRIDGE_URL!.replace(/\/$/, '')}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUBSCRIPTION_BRIDGE_TOKEN}` },
      body: JSON.stringify({ provider, prompt }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    return typeof data.text === 'string' && data.text.trim() ? data.text : null;
  } catch {
    return null;
  }
}
