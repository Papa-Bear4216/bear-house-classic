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
import { resolveHouseholdId } from './_db.js';
import { CORS_HEADERS, handleCorsPreflight } from './_cors.js';

const MAX_BODY_BYTES = 4096;

async function readBoundedJson(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new Error('Request body too large');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally {
    reader.releaseLock();
  }
}

function noContent() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return new Response(null, { status: 405, headers: CORS_HEADERS });

  const authorization = req.headers.get('authorization') || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');
  let householdId: string | null = null;
  try {
    householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  } catch {
    return noContent();
  }
  if (!householdId) return noContent();

  let rl: Awaited<ReturnType<typeof checkRateLimit>> = { allowed: true } as Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    rl = await checkRateLimit(householdId, 'client-metric', 60);
  } catch {
    return noContent();
  }
  if (!rl.allowed) return noContent();

  let rawBody: unknown;
  try {
    rawBody = await readBoundedJson(req);
  } catch {
    return noContent();
  }
  const parsed = parseBody(ClientMetricBodySchema, rawBody);
  if (!parsed.ok) return noContent();
  const { event, totalMs, detail } = parsed.data;

  logInfo('client-metric', event, {
    totalMs,
    sessionMs: detail?.sessionMs,
    pullFromCloudMs: detail?.pullFromCloudMs,
    householdId,
  });
  return noContent();
}
