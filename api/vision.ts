export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, VisionBodySchema } from './_schemas.js';

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'vision', 15);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return j({ error: 'API key not configured.' }, 500);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(VisionBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { imageBase64, mediaType, prompt } = parsed.data;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
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
    if (!response.ok) return j({ error: await response.text() }, response.status);
    const data = await response.json() as any;
    return j({ text: data?.content?.[0]?.text || '' });
  } catch (e: any) {
    return j({ error: e?.message || 'Network error' }, 500);
  }
}
