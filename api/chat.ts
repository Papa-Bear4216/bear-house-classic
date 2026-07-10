export const config = { runtime: 'edge' };

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

async function callGemini(
  messages: { role: string; content: string }[],
  system: string,
  apiKey: string,
  maxTokens: number
): Promise<string> {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { maxOutputTokens: maxTokens },
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
  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!anthropicKey && !geminiKey) return j({ error: 'API key not configured.' }, 500);

  const body = await req.json().catch(() => ({})) as any;
  // Support both single-prompt mode and multi-turn messages array
  const { prompt, messages: msgArray, system, maxTokens, model } = body;
  if (!prompt && !msgArray) return j({ error: 'Missing prompt or messages' }, 400);

  const messages = msgArray || [{ role: 'user', content: prompt }];
  const tokens = maxTokens || 512;

  if (anthropicKey) {
    const chosenModel = model || (tokens > 512 ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001');
    const apiBody: any = { model: chosenModel, max_tokens: tokens, messages };
    if (system) apiBody.system = system;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(apiBody),
      });
      if (response.ok) {
        const data = await response.json() as any;
        return j({ text: data?.content?.[0]?.text || '' });
      }
      if (!geminiKey) return j({ error: await response.text() }, response.status);
    } catch (e: any) {
      if (!geminiKey) return j({ error: e?.message || 'Network error' }, 500);
    }
  }

  // Fallback to Gemini if Claude is unavailable, errored, or unconfigured
  try {
    const text = await callGemini(messages, system || '', geminiKey!, tokens);
    return j({ text });
  } catch (e: any) {
    return j({ error: e?.message || 'Network error' }, 500);
  }
}
