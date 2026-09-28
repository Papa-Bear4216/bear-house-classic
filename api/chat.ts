export const config = { runtime: 'edge' };

import { resolveHouseholdId, dbGetHermesModelTier } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, ChatBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

import { handleCorsPreflight } from './_cors.js';
import { CLAUDE_MODELS, GEMINI_MODEL as DEFAULT_GEMINI_MODEL } from './_aiModels.js';
import { handleStreamingChat } from './_streamChat.js';

// --- Model catalog (verified 2026-09-25). Next model deprecation = edit here. ---
// NOTE: these are now also exported from _aiModels.js as the single source of
// truth for briefing.ts/secretary.ts. Keep them in sync when deprecating models.
// const CLAUDE_MODELS = {
//   haiku: 'claude-haiku-4-5-20251001',
//   sonnet: 'claude-sonnet-4-6',
// } as const;
const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
const PROVIDER_TIMEOUT_MS = 30_000;

export const HERMES_SYSTEM_PROMPT = [
  'You are Hermes, the Bear House family assistant.',
  'You help with household life: routines, chores, schedules, homework, meals, budgeting, and finding things.',
  'Be concise, warm, and practical. Prefer short answers with concrete next steps.',
  'Hard rules: never give medical, dosing, legal, or court-related advice; never diagnose anyone;',
  "never speculate about another person's motives or intent;",
  "if you are unsure, say what you know and what you don't.",
].join(' ');

type ChatMessage = { role: string; content: string };

class ProviderError extends Error {
  status: number;
  detail: string;
  constructor(message: string, status: number, detail = '') {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

// --- Prompt caching (Anthropic) ---
// The system prompt is large and mostly static within a chat session
// (persona, action catalog, memory facts, member list). Marking it as a
// cacheable block means repeat turns are served from the prompt cache:
// cached input tokens bill at ~10% of the base rate and respond faster.
// The first unique system string per ~5min window costs 1.25x (cache
// write); prompts under 1024 tokens simply don't cache — no error, no
// behavior change. No beta header needed; prompt caching is GA.
// Follow-up for higher hit rates: have the client split its system prompt
// into a stable prefix and a dynamic suffix (tasks/weather) as two blocks,
// with the breakpoint between them.
export function buildClaudeRequestBody(
  model: string,
  system: string,
  messages: ChatMessage[],
  maxTokens: number,
  jsonMode: boolean,
): Record<string, unknown> {
  return {
    model,
    max_tokens: maxTokens,
    system: [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
    ],
    messages,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
}

async function callClaude(
  messages: ChatMessage[],
  system: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  jsonMode: boolean,
): Promise<{ text: string; stopReason: string | null; usage: { cacheRead: number; cacheCreated: number } }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(buildClaudeRequestBody(model, system, messages, maxTokens, jsonMode)),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new ProviderError(`Claude ${res.status}`, res.status, errText.slice(0, 300));
  }
  const data = (await res.json()) as any;
  const text = (data?.content ?? [])
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('');
  const usage = data?.usage ?? {};
  return {
    text,
    stopReason: data?.stop_reason ?? null,
    usage: {
      cacheRead: usage?.cache_read_input_tokens ?? 0,
      cacheCreated: usage?.cache_creation_input_tokens ?? 0,
    },
  };
}

async function callGemini(
  messages: ChatMessage[],
  system: string,
  apiKey: string,
  maxTokens: number,
  jsonMode: boolean,
): Promise<{ text: string }> {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new ProviderError(`Gemini ${res.status}`, res.status, errText.slice(0, 300));
  }
  const data = (await res.json()) as any;
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => typeof p?.text === 'string')
    .map((p: any) => p.text)
    .join('');
  return { text };
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return j({ error: 'Method not allowed' }, 405);

  // Route streaming requests to the SSE handler early (before auth + body
  // parse) so the client gets a streaming response without the non-streaming
  // path doing duplicate work. Accept: text/event-stream is the signal.
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/event-stream') || accept.includes('*/*')) {
    const streamMode = req.headers.get('x-stream') === 'true'
      || new URL(req.url).searchParams.get('stream') === 'true'
      || accept.includes('text/event-stream');
    if (streamMode) {
      return handleStreamingChat(req);
    }
  }

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const householdId = accessToken ? await resolveHouseholdId(accessToken) : null;
  if (!householdId) return j({ error: 'Unauthorized' }, 401);

  const rl = await checkRateLimit(householdId, 'chat', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(ChatBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { prompt, messages: msgArray, system, maxTokens, model, format, outputSchema } = parsed.data;

  const messages: ChatMessage[] = (msgArray || [{ role: 'user', content: prompt || '' }]).map(m => ({ role: m.role || 'user', content: m.content || '' }));
  const tokens = maxTokens || 512;

  // JSON output mode: when `format: 'json'` or a non-empty `outputSchema` is
  // requested, constrain the LLM to emit machine-parseable JSON. Claude gets
  // `response_format: { type: 'json_object' }`; Gemini gets
  // `responseMimeType: 'application/json'`. The `outputSchema` field (if
  // provided) is planted into the system prompt as a formatting hint so the
  // model emits the right shape — full zod-gated structured output is a
  // Phase 1 custody feature, not this turn.
  const wantJson = !!(format === 'json' || outputSchema);
  const jsonHint = outputSchema
    ? `\n\nYou must return valid JSON matching this shape:\n${outputSchema}\nNo other keys.`
    : '';
  const effectiveSystem = (system || HERMES_SYSTEM_PROMPT) + jsonHint;

  // The household's self-serve tier toggle (api/hermes-model.ts) picks the
  // Claude model. An explicit `model` in the request still overrides it.
  // The getter itself defaults to 'haiku'; the extra guards are belt-and-braces.
  const tier = await dbGetHermesModelTier(householdId).catch(() => 'haiku' as const);
  const chosenModel = model || CLAUDE_MODELS[tier as keyof typeof CLAUDE_MODELS] || CLAUDE_MODELS.haiku;

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
    try {
      const { text, stopReason, usage } = await callClaude(messages, effectiveSystem, anthropicKey, chosenModel, tokens, wantJson);
      if (!text) {
        // Never return a silent 200 with empty text — that was the
        // "empty response" bug. Surface it as a 502 so clients can retry.
        return j(
          { error: stopReason ? `Model returned no text (stop_reason=${stopReason}).` : 'Model returned no text.' },
          502,
        );
      }
      return j({
        text,
        model: chosenModel,
        ...(wantJson ? { format: 'json' } : {}),
        ...(stopReason === 'max_tokens' ? { truncated: true } : {}),
        // Observability for the prompt-cache win: present only when the
        // provider actually cached something, so old clients ignore it.
        ...(usage.cacheRead || usage.cacheCreated ? { cache: usage } : {}),
      });
    } catch (e: any) {
      const status = e instanceof ProviderError ? e.status : 0;
      if (!geminiKey) {
        // No fallback configured: surface the provider's own status when we
        // have one (old contract), else a 500. Timeouts land here as 500s.
        if (status) return j({ error: e.detail || e.message }, status);
        return serverError(e?.message || 'Network error', 'chat:claude', e);
      }
      // Otherwise fall through to Gemini below.
    }
  }

  // Fallback to Gemini if Claude is unavailable, errored, or unconfigured
  try {
    const { text } = await callGemini(
      messages, effectiveSystem, geminiKey!, tokens, wantJson,
    );
    if (!text) return j({ error: 'Model returned no text.' }, 502);
    return j({ text, model: GEMINI_MODEL, ...(wantJson ? { format: 'json' } : {}) });
  } catch (e: any) {
    return serverError(e?.message || 'Network error', 'chat:gemini', e);
  }
}
