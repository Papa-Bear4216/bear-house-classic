export const config = { runtime: 'edge' };

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return j({ error: 'API key not configured.' }, 500);

  const body = await req.json().catch(() => ({})) as any;
  const { imageBase64, mediaType, prompt } = body;
  if (!imageBase64 || !prompt) return j({ error: 'Missing imageBase64 or prompt' }, 400);

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
