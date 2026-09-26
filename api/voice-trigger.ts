/**
 * /api/voice-trigger — IFTTT-style voice trigger webhook (Edge Runtime).
 *
 * Receives webhook calls from Google Assistant (via IFTTT),
 * Alexa (via IFTTT/Routines), and any HTTP-capable voice service.
 *
 * Auth: household-scoped voice_trigger_token (resolved via
 * resolveHouseholdIdByVoiceTriggerToken, stored in households table).
 *
 * Body: { trigger: string, token: string }
 * - trigger is the phrase/name registered for this household
 * - token authenticates the caller as belonging to this household
 *
 * The endpoint looks up the trigger in the household's voice_triggers
 * family_data record, finds the matching action, and dispatches it
 * through the device control dispatcher.
 */
export const config = { runtime: 'edge' };

import { resolveHouseholdIdByVoiceTriggerToken } from './_db.js';
import { dbGet } from './_db.js';
import { dispatchDevice } from './_deviceDispatcher.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, VoiceTriggerWebhookBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

const VOICE_TRIGGERS_KEY_PREFIX = 'voice_triggers_';

function voiceTriggersKey(householdId: string) {
  return `${VOICE_TRIGGERS_KEY_PREFIX}${householdId}`;
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method === 'GET') return j({ ok: true, description: 'POST { trigger, token } to fire a voice trigger' });
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const rawBody = await req.json().catch(() => ({})) as any;
  const parsed = parseBody(VoiceTriggerWebhookBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { trigger, token } = parsed.data;

  const householdId = await resolveHouseholdIdByVoiceTriggerToken(token);
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'voice-trigger', 20);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  // Load voice triggers for this household
  const stored = await dbGet(voiceTriggersKey(householdId), householdId) as any;
  const triggers = stored?.triggers || [];
  const triggerRecord = triggers.find((t: any) => t.trigger === trigger);

  if (!triggerRecord) {
    return j({ error: `Trigger "${trigger}" not found for this household` }, 404);
  }

  // Dispatch the action
  const result = await dispatchDevice(householdId, {
    deviceId: triggerRecord.deviceId,
    action: triggerRecord.action,
    params: triggerRecord.params,
  });

  if (!result.ok) {
    return j({ ok: false, trigger, error: result.error }, 500);
  }
  return j({ ok: true, trigger });
}
