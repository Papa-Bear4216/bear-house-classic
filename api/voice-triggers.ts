/**
 * /api/voice-triggers — Manage voice trigger registry for a household (Edge Runtime).
 *
 * CRUD operations for IFTTT-style voice triggers. Household-authenticated
 * via Bearer token (Supabase access token resolves householdId).
 *
 * Actions:
 * - list: return all triggers for this household
 * - add: add a new trigger mapping { trigger, deviceId, action, params? }
 * - remove: remove a trigger by name
 * - rotateToken: generate a new voice_trigger_token for webhook auth
 *
 * Also manages the household's voice_trigger_token on the households row
 * (for webhook auth).
 */
export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { dbGet, dbSet, dbGetHouseholdVoiceToken, dbSetHouseholdVoiceToken } from './_db.js';
import { handleCorsPreflight } from './_cors.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, VoiceTriggerManageBodySchema, VoiceTriggerActionSchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

const VOICE_TRIGGERS_KEY_PREFIX = 'voice_triggers_';
const VOICE_TRIGGER_TOKEN_KEY_PREFIX = 'voice_trigger_token_';

function voiceTriggersKey(householdId: string) {
  return `${VOICE_TRIGGERS_KEY_PREFIX}${householdId}`;
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'voice-triggers', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(VoiceTriggerManageBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { action } = parsed.data;

  try {
    if (action === 'list') {
      const stored = await dbGet(voiceTriggersKey(householdId), householdId) as any;
      const triggers = stored?.triggers || [];
      const token = await dbGetHouseholdVoiceToken(householdId);
      return j({ ok: true, triggers, hasToken: !!token.voice_trigger_token });
    }

    if (action === 'add') {
      const { trigger, deviceId, deviceAction, params } = (parsed.data as any);
      const newTrigger = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        trigger,
        deviceId,
        action: deviceAction,
        params: params || {},
        createdAt: Date.now(),
      };

      const stored = await dbGet(voiceTriggersKey(householdId), householdId) as any;
      const triggers = (stored?.triggers || []);
      // Prevent duplicate trigger names
      if (triggers.some((t: any) => t.trigger === trigger)) {
        return j({ error: `Trigger "${trigger}" already exists` }, 409);
      }
      triggers.push(newTrigger);
      await dbSet(voiceTriggersKey(householdId), householdId, { triggers, updatedAt: Date.now() });
      return j({ ok: true, trigger: newTrigger });
    }

    if (action === 'remove') {
      const { trigger } = (parsed.data as any);
      const stored = await dbGet(voiceTriggersKey(householdId), householdId) as any;
      const triggers = (stored?.triggers || []);
      const filtered = triggers.filter((t: any) => t.trigger !== trigger);
      await dbSet(voiceTriggersKey(householdId), householdId, { triggers: filtered, updatedAt: Date.now() });
      return j({ ok: true, removed: trigger });
    }

    if (action === 'rotateToken') {
      const newToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      await dbSetHouseholdVoiceToken(householdId, newToken);
      return j({ ok: true, token: newToken });
    }

    return j({ error: `Unknown action: ${action}` }, 400);
  } catch (e: any) {
    return serverError(e?.message || 'Voice trigger operation failed', 'voice-triggers', e);
  }
}
