export const config = { runtime: 'edge' };

import { resolveHouseholdId } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, ChatBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

import { handleCorsPreflight } from './_cors.js';
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
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'chat', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(ChatBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { prompt, messages: msgArray, system, maxTokens, model } = parsed.data;

  const messages = msgArray || [{ role: 'user', content: prompt }];
  const tokens = maxTokens || 512;
  const augmentedSystem = system || '';

  // Intercept Triad queries and route to ambient Triad daemon on port 8789 ($0 token cost)
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || prompt || '';
  const cleanQuery = lastUserMsg.trim();
  const isTriadDirect = /^(triad|\/triad)\b/i.test(cleanQuery) ||
    /\b(triad doctor|triad gate|triad health|review diff)\b/i.test(cleanQuery);

  if (isTriadDirect) {
    const TRIAD_URL = process.env.TRIAD_URL || 'http://127.0.0.1:8789';
    try {
      const strippedPrompt = cleanQuery.replace(/^(\/)?triad\s*:?\s*/i, '').trim() || 'doctor';
      const triadRes = await fetch(`${TRIAD_URL}/auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: strippedPrompt }),
        signal: AbortSignal.timeout(10000),
      });

      if (triadRes.ok) {
        const triadData = await triadRes.json();
        let formatted = '';
        if (triadData.result?.response) {
          formatted = triadData.result.response;
        } else if (triadData.result?.synthesis) {
          formatted = triadData.result.synthesis;
        } else if (triadData.intent === 'DOCTOR') {
          const subs = triadData.result || {};
          formatted = `Triad Health Report (Intent: DOCTOR):\n` +
            `• Pieces OS: ${subs.pieces_os ? '🟢 Online (39300)' : '🔴 Offline'}\n` +
            `• Hermes Relay: ${subs.hermes_relay ? '🟢 Online (8766)' : '🔴 Standby'}\n` +
            `• Pieces Proxy: ${subs.pieces_proxy ? '🟢 Online (8787)' : '🔴 Offline'}\n` +
            `• Ollama: ${subs.ollama ? '🟢 Online (11434)' : '🔴 Standby'}\n` +
            `• Active Advisors: ${Object.keys(subs.advisors || {}).join(', ') || 'Claude, Codex'}`;
        } else {
          formatted = JSON.stringify(triadData.result || triadData, null, 2);
        }

        const reply = JSON.stringify({
          text: `[Triad Engine: ${triadData.intent || 'AUTO'}]\n${formatted}`,
          actions: []
        });
        return j({ text: reply });
      }
    } catch (e: any) {
      console.warn('[Chat] Triad ambient bridge unavailable, falling back to LLM:', e?.message);
    }
  }

  const { anthropicKey, geminiKey } = await resolveAiKeys(householdId);
  if (!anthropicKey && !geminiKey) return serverError('API key not configured.', 'chat');

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
