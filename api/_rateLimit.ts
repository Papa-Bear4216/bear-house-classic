import { dbGet, dbSet } from './_db.js';

const WINDOW_MS = 60_000; // 1 minute sliding window

interface RateLimitState { count: number; windowStart: number; }

/** Returns {allowed:true} or {allowed:false, retryAfterSeconds}. Keyed by
 * householdId+endpoint so one household's usage doesn't affect another's,
 * and chat/vision have fully independent budgets. This is cost-control
 * against a runaway loop or compromised session, not adversarial-traffic
 * defense — limits are intentionally generous. */
export async function checkRateLimit(
  householdId: string, endpoint: string, limit: number
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const key = `ratelimit_${endpoint}`;
  const state = (await dbGet(key, householdId)) as RateLimitState | null;
  const now = Date.now();

  if (!state || now - state.windowStart > WINDOW_MS) {
    await dbSet(key, householdId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (state.count >= limit) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - state.windowStart)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  await dbSet(key, householdId, { count: state.count + 1, windowStart: state.windowStart });
  return { allowed: true };
}
