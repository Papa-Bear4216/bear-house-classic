export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, TtsBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

import { handleCorsPreflight } from './_cors.js';
// Premium voice for households that redeemed a code via api/voice-unlock.ts.
// Uses Google Cloud TTS Neural2 voices (~$16/1M chars, 1M chars/month free
// tier) — cheap relative to the free browser voice's quality gap, and reuses
// the same Google ecosystem/API key pattern as Gemini in api/chat.ts.
export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'tts', 60);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const ttsKey = process.env.GOOGLE_TTS_API_KEY;
  if (!ttsKey) return serverError('Premium voice is not configured', 'tts');

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(TtsBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { text } = parsed.data;

  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-US', name: 'en-US-Neural2-J' },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      return j({ error: `TTS ${res.status}: ${errText.slice(0, 200)}` }, res.status);
    }
    const data = await res.json() as any;
    return j({ audioBase64: data.audioContent || '' });
  } catch (e: any) {
    return serverError(e?.message || 'Network error', 'tts', e);
  }
}
