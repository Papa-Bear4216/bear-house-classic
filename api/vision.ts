export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, VisionBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';
import { handleCorsPreflight } from './_cors.js';

async function callGeminiVision(
  imageBase64: string,
  mediaType: string,
  prompt: string,
  apiKey: string
): Promise<string> {
  const mimeType = mediaType || 'image/jpeg';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 150)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'vision', 15);
  if (!rl.allowed) {
    const retry = 'retryAfterSeconds' in rl ? rl.retryAfterSeconds : 15;
    return j({ error: `Rate limit exceeded, try again in ${retry}s` }, 429);
  }

  const { anthropicKey, geminiKey } = await resolveAiKeys(householdId);
  if (!anthropicKey && !geminiKey) return serverError('API key not configured.', 'vision');

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(VisionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { imageBase64, mediaType, prompt } = parsed.data;

  // Primary: Claude Sonnet
  if (anthropicKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      });
      if (response.ok) {
        const data = await response.json() as any;
        return j({ text: data?.content?.[0]?.text || '' });
      }
      if (!geminiKey) return j({ error: await response.text() }, response.status);
    } catch (e: any) {
      if (!geminiKey) return serverError(e?.message || 'Network error', 'vision:claude', e);
    }
  }

  // Fallback / Secondary: Gemini Flash
  try {
    const text = await callGeminiVision(imageBase64, mediaType || 'image/jpeg', prompt, geminiKey!);
    return j({ text });
  } catch (e: any) {
    return serverError(e?.message || 'Network error', 'vision:gemini', e);
  }
}
