export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, ChatBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

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

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'chat', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!anthropicKey && !geminiKey) return serverError('API key not configured.', 'chat');

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(ChatBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { prompt, messages: msgArray, system, maxTokens, model } = parsed.data;

  const messages = msgArray || [{ role: 'user', content: prompt }];
  const tokens = maxTokens || 512;
  
  let augmentedSystem = system || '';
  const mem0Key = process.env.MEM0_API_KEY;
  if (mem0Key && messages.length > 0) {
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    if (lastUserMessage) {
      try {
        // 1. Search for relevant past context
        const searchRes = await fetch('https://api.mem0.ai/v1/search', {
          method: 'POST',
          headers: { 'Authorization': `Token ${mem0Key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: lastUserMessage, user_id: householdId })
        });
        if (searchRes.ok) {
          const results = await searchRes.json();
          if (results && results.length > 0) {
            const context = results.map((r: any) => r.memory).join('\n- ');
            augmentedSystem += `\n\nRelevant past context about this user/household:\n- ${context}`;
          }
        }
        
        // 2. Fire-and-forget: add the new user message to Mem0 for future recall
        // (We don't await this so it doesn't slow down the chat response)
        fetch('https://api.mem0.ai/v1/memories', {
          method: 'POST',
          headers: { 'Authorization': `Token ${mem0Key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: lastUserMessage }], user_id: householdId })
        }).catch(() => {});
      } catch (err) {
        console.error('Mem0 integration error:', err);
      }
    }
  }

  if (anthropicKey) {
    const chosenModel = model || (tokens > 512 ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001');
    const apiBody: any = { model: chosenModel, max_tokens: tokens, messages };
    if (augmentedSystem) apiBody.system = augmentedSystem;

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
      if (!geminiKey) return serverError(e?.message || 'Network error', 'chat:claude', e);
    }
  }

  // Fallback to Gemini if Claude is unavailable, errored, or unconfigured
  try {
    const text = await callGemini(messages, augmentedSystem, geminiKey!, tokens);
    return j({ text });
  } catch (e: any) {
    return serverError(e?.message || 'Network error', 'chat:gemini', e);
  }
}
