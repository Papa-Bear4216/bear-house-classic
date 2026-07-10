export const config = { runtime: 'edge' };

const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

async function callGemini(
  messages: { role: string; content: string }[],
  system: string,
  apiKey: string
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
        generationConfig: { maxOutputTokens: 800 },
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

  const body = await req.json().catch(() => ({})) as any;
  const { prompt, messages: msgArray, system, maxTokens, model } = body;
  if (!prompt && !msgArray) return j({ error: 'Missing prompt or messages' }, 400);

  const messages = msgArray || [{ role: 'user', content: prompt }];

  // 1. Try Gemini first if GEMINI_API_KEY is configured and no specific Anthropic model is requested
  if (geminiKey && !model) {
    try {
      const text = await callGemini(messages, system || '', geminiKey);
      return j({ text });
    } catch (e: any) {
      console.warn('Gemini failed in chat API, trying Claude:', e.message);
    }
  }

  // 2. Call Claude
  if (!anthropicKey) {
    return j({ error: 'Neither Anthropic nor Gemini API keys are configured.' }, 500);
  }

  const chosenModel = model || (maxTokens && maxTokens > 512 ? 'claude-3-5-sonnet-latest' : 'claude-3-5-haiku-latest');
  const apiBody: any = { model: chosenModel, max_tokens: maxTokens || 512, messages };
  if (system) apiBody.system = system;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(apiBody),
    });
    if (!response.ok) {
      // If Claude fails and we have a Gemini key, do a last-minute fallback
      if (geminiKey) {
        try {
          const text = await callGemini(messages, system || '', geminiKey);
          return j({ text });
        } catch {}
      }
      return j({ error: await response.text() }, response.status);
    }
    const data = await response.json() as any;
    return j({ text: data?.content?.[0]?.text || '' });
  } catch (e: any) {
    if (geminiKey) {
      try {
        const text = await callGemini(messages, system || '', geminiKey);
        return j({ text });
      } catch {}
    }
    return j({ error: e?.message || 'Network error' }, 500);
  }
}

