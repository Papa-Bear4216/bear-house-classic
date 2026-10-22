export const config = { runtime: 'edge' };

import { resolveCallerMember, dbSetVoiceUnlocked } from './_db.js';
import { secretsEqual } from './_secureCompare.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, VoiceUnlockBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

import { handleCorsPreflight } from './_cors.js';
// Redeems a developer-distributed 6-digit code to unlock premium voice for
// the caller's whole household. Independent of Stripe billing — codes are a
// flat list in VOICE_UNLOCK_CODES (comma-separated), set/rotated via Vercel
// env vars. Only admin/superadmin members can redeem; the unlock applies
// household-wide.
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken) : null;
  if (!caller) return j({ error: 'Unauthorized' }, 401);
  if (caller.role !== 'admin' && caller.role !== 'superadmin') return j({ error: 'Only an admin can unlock voice' }, 403);
  const householdId = caller.householdId;

  const rl = await checkRateLimit(householdId, 'voice-unlock', 10);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(VoiceUnlockBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);

  const validCodes = (process.env.VOICE_UNLOCK_CODES || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
  if (validCodes.length === 0) return serverError('Voice unlock is not configured', 'voice-unlock');

  // Check every code (no early exit) with constant-time comparisons so response
  // timing does not reveal how close a guess is.
  const submitted = parsed.data.code.trim();
  const matches = await Promise.all(validCodes.map((c) => secretsEqual(c, submitted)));
  if (!matches.some(Boolean)) {
    return j({ error: 'Invalid code' }, 400);
  }

  try {
    await dbSetVoiceUnlocked(householdId);
    return j({ unlocked: true });
  } catch (e: any) {
    return serverError(e?.message || 'Failed to unlock', 'voice-unlock', e);
  }
}
