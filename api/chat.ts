export const config = { runtime: 'edge' };

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return j({ error: 'API key not configured.' }, 500);

  const body = await req.json().catch(() => ({})) as any;
  // Support both single-prompt mode and multi-turn messages array
  const { prompt, messages: msgArray, system, maxTokens, model } = body;
  if (!prompt && !msgArray) return j({ error: 'Missing prompt or messages' }, 400);

  const messages = msgArray || [{ role: 'user', content: prompt }];
  const chosenModel = model || (maxTokens && maxTokens > 512 ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001');
  const apiBody: any = { model: chosenModel, max_tokens: maxTokens || 512, messages };
  if (system) apiBody.system = system;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(apiBody),
    });
    if (!response.ok) return j({ error: await response.text() }, response.status);
    const data = await response.json() as any;
    return j({ text: data?.content?.[0]?.text || '' });
  } catch (e: any) {
    return j({ error: e?.message || 'Network error' }, 500);
  }
}
