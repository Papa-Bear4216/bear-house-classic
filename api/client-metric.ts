export const config = { runtime: 'edge' };

/**
 * Landing zone for client-side performance timings (e.g. household load
 * time) that need to be visible in Vercel's log viewer without opening
 * browser dev tools. Fire-and-forget from the client — logs and returns
 * 204 even on bad input, since a dropped metric should never surface as a
 * user-visible error.
 */

import { checkRateLimit } from './_rateLimit.js';
import { parseBody, ClientMetricBodySchema } from './_schemas.js';
import { logInfo } from './_log.js';

import { handleCorsPreflight } from './_cors.js';
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return new Response(null, { status: 405 });

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(ClientMetricBodySchema, rawBody);
  if (!parsed.ok) return new Response(null, { status: 204 });
  const { event, totalMs, detail, householdId } = parsed.data;

  if (householdId) {
    const rl = await checkRateLimit(householdId, 'client-metric', 60);
    if (!rl.allowed) return new Response(null, { status: 204 });
  }

  logInfo('client-metric', event, { totalMs, ...detail, householdId });
  return new Response(null, { status: 204 });
}
