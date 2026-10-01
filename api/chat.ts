export const config = { runtime: 'edge' };

import { resolveHouseholdId, resolveCallerMember, dbGetHermesModelTier } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';
import { parseBody, ChatBodySchema } from './_schemas.js';
import { json as j, serverError } from './_responseHelpers.js';

import { handleCorsPreflight } from './_cors.js';
import { CLAUDE_MODELS, GEMINI_MODEL as DEFAULT_GEMINI_MODEL } from './_aiModels.js';
import { handleStreamingChat } from './_streamChat.js';
import { isTriadHousehold } from './_triadAccess.js';
import { HERMES_TOOLS, isValidCall, sanitizeToolParams, type ToolDefinition } from './_hermesTools.js';

// --- Model catalog (verified 2026-09-25). Next model deprecation = edit here. ---
// NOTE: these are now also exported from _aiModels.js as the single source of
// truth for briefing.ts/secretary.ts. Keep them in sync when deprecating models.
// const CLAUDE_MODELS = {
//   haiku: 'claude-haiku-4-5-20251001',
//   sonnet: 'claude-sonnet-4-6',
// } as const;
const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
const PROVIDER_TIMEOUT_MS = 30_000;
export const MAX_ACTIONS_PER_TURN = 8;

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
export interface HermesActionPayload {
  type: string;
  params: Record<string, any>;
}

export function buildClaudeRequestBody(
  model: string,
  system: string,
  messages: ChatMessage[],
  maxTokens: number,
  jsonMode: boolean,
  tools?: ToolDefinition[],
): Record<string, unknown> {
  const toolsWithCache = tools && tools.length > 0
    ? tools.map((t, idx) => idx === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t)
    : undefined;

  return {
    model,
    max_tokens: maxTokens,
    system: [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
    ],
    messages,
    ...(toolsWithCache ? { tools: toolsWithCache } : {}),
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
  tools?: ToolDefinition[],
  allowedTools: Set<string> = new Set(),
  isAdmin: boolean = true,
): Promise<{
  text: string;
  actions: HermesActionPayload[];
  stopReason: string | null;
  usage: { cacheRead: number; cacheCreated: number };
  truncated: boolean;
  droppedActions: number;
}> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(buildClaudeRequestBody(model, system, messages, maxTokens, jsonMode, tools)),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new ProviderError(`Claude ${res.status}`, res.status, errText.slice(0, 300));
  }
  const data = (await res.json()) as any;
  const content = Array.isArray(data?.content) ? data.content : [];
  const stopReason = data?.stop_reason ?? null;
  const truncated = stopReason === 'max_tokens';
  const lastBlock = content[content.length - 1];
  const dropLast = truncated && lastBlock?.type === 'tool_use';
  const usable = dropLast ? content.slice(0, -1) : content;
  let droppedActions = 0;
  if (dropLast) droppedActions += 1;
  const candidateBlocks = usable.filter((b: any) => b?.type === 'tool_use' && typeof b.name === 'string');

  const actions: HermesActionPayload[] = [];
  for (const b of candidateBlocks) {
    if (actions.length >= MAX_ACTIONS_PER_TURN) {
      droppedActions += 1;
      continue;
    }
    const raw = b.input;
    const input = raw === undefined ? {} : raw;
    if (isValidCall(b.name, input, allowedTools, isAdmin)) {
      actions.push({
        type: b.name,
        params: sanitizeToolParams(b.name, (input && typeof input === 'object') ? (input as Record<string, unknown>) : {}),
      });
    } else {
      droppedActions += 1;
    }
  }

  const text = content
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('');

  const usage = data?.usage ?? {};
  return {
    text,
    actions,
    stopReason,
    truncated,
    droppedActions,
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
  tools?: ToolDefinition[],
  allowedTools: Set<string> = new Set(),
  isAdmin: boolean = true,
): Promise<{ text: string; actions: HermesActionPayload[]; truncated: boolean; droppedActions: number; toolsDegraded?: boolean }> {
  // Gemini requires strictly alternating user/model turns; merge consecutive same-role messages
  const geminiMessages: ChatMessage[] = [];
  for (const m of messages) {
    if (geminiMessages.length > 0 && geminiMessages[geminiMessages.length - 1].role === m.role) {
      geminiMessages[geminiMessages.length - 1].content += `\n\n${m.content}`;
    } else {
      geminiMessages.push({ ...m });
    }
  }

  const contents = geminiMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const functionDeclarations = tools && tools.length > 0
    ? tools
        .filter((t) => t.name !== 'genericAction')
        .map((t) => {
          const hasProps = t.input_schema.properties && Object.keys(t.input_schema.properties).length > 0;
          return {
            name: t.name,
            description: t.description,
            ...(hasProps ? { parameters: t.input_schema } : {}),
          };
        })
    : undefined;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        ...(functionDeclarations ? { tools: [{ functionDeclarations }] } : {}),
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
    if (res.status === 400 && functionDeclarations && (errText.includes('INVALID_ARGUMENT') || /schema|tool|functionDeclaration|parameter/i.test(errText))) {
      console.warn('[Gemini] Tool schema rejected with 400, downgrading to text-only:', errText.slice(0, 200));
      const fallback = await callGemini(messages, system, apiKey, maxTokens, jsonMode, undefined, allowedTools, isAdmin);
      return { ...fallback, toolsDegraded: true };
    }
    throw new ProviderError(`Gemini ${res.status}`, res.status, errText.slice(0, 300));
  }
  const data = (await res.json()) as any;
  const candidate = data?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const truncated = finishReason === 'MAX_TOKENS';
  const parts = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts
    : [];
  const text = parts
    .filter((p: any) => typeof p?.text === 'string')
    .map((p: any) => p.text)
    .join('');

  let droppedActions = 0;
  if (finishReason === 'MALFORMED_FUNCTION_CALL' || finishReason === 'SAFETY' || finishReason === 'RECITATION') {
    droppedActions += 1;
  }
  const actions: HermesActionPayload[] = [];
  for (const p of parts) {
    if (p?.functionCall && typeof p.functionCall.name === 'string') {
      if (actions.length >= MAX_ACTIONS_PER_TURN) {
        droppedActions += 1;
        continue;
      }
      const name = p.functionCall.name;
      const raw = p.functionCall.args;
      const args = raw === undefined ? {} : raw;
      if (isValidCall(name, args, allowedTools, isAdmin)) {
        actions.push({
          type: name,
          params: sanitizeToolParams(name, (args && typeof args === 'object') ? (args as Record<string, unknown>) : {}),
        });
      } else {
        droppedActions += 1;
      }
    }
  }
  return { text, actions, truncated, droppedActions };
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
  let caller: Awaited<ReturnType<typeof resolveCallerMember>> = null;
  let callerError = false;
  if (accessToken) {
    try {
      caller = await resolveCallerMember(accessToken);
    } catch (e) {
      callerError = true;
      console.error('[Chat] resolveCallerMember failed:', e);
    }
  }
  let householdId = caller?.householdId ?? null;
  let fallbackError = false;
  if (!householdId && accessToken) {
    try {
      householdId = await resolveHouseholdId(accessToken);
    } catch (e) {
      fallbackError = true;
      console.error('[Chat] resolveHouseholdId fallback failed:', e);
    }
  }
  if (!householdId) {
    if (callerError || fallbackError) {
      return j({ error: 'Database unavailable. Please try again shortly.' }, 503);
    }
    return j({ error: 'Unauthorized' }, 401);
  }
  const callerRole = caller?.role ?? 'child'; // least privilege on lookup failure
  const isAdmin = callerRole === 'admin' || callerRole === 'superadmin';
  const canControlDevices = caller?.canControlDevices ?? isAdmin;

  const rl = await checkRateLimit(householdId, 'chat', 30);
  if (!rl.allowed) return j({ error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` }, 429);

  const rawBody = await req.json().catch(() => ({}));
  const parsed = parseBody(ChatBodySchema, rawBody);
  if (!parsed.ok) return j({ error: parsed.error }, 400);
  const { prompt, messages: msgArray, system, maxTokens, model, format, outputSchema, enableTools } = parsed.data;

  // Tools are opt-in for Hermes Chat callers (`enableTools: true`) to prevent token overhead
  // and unexpected tool calling on general text-completion endpoints.
  const useTools = enableTools === true && format !== 'json' && !outputSchema;
  const tools = useTools ? HERMES_TOOLS : undefined;
  const tokens = maxTokens || (useTools ? 1024 : 512);
  const messages: ChatMessage[] = (msgArray || [{ role: 'user', content: prompt || '' }])
    .map(m => ({ role: m.role || 'user', content: (m.content || '').trim() }))
    .filter(m => m.content.length > 0);

  while (messages.length > 0 && messages[0].role !== 'user') {
    messages.shift();
  }
  while (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
    messages.pop();
  }

  if (!messages.length) {
    return j({ error: 'No non-empty messages provided.' }, 400);
  }

  const isTriad = isTriadHousehold(householdId);
  const scopedTools = tools?.filter((t) => {
    if (t.name === 'queryTriad') return isTriad;
    if (t.name === 'manageMember' || t.name === 'notifyPerson' || t.name === 'addBill' || t.name === 'markBillPaid' || t.name === 'clearWeekMeals') return isAdmin;
    if (t.name === 'controlDevice' || t.name === 'discoverSmartHome') return canControlDevices;
    return true;
  });
  const allowedTools = new Set(scopedTools?.map((t) => t.name) || []);

  // JSON output mode: when `format: 'json'` or a non-empty `outputSchema` is
  // requested, constrain the LLM to emit machine-parseable JSON. Claude gets
  // `response_format: { type: 'json_object' }`; Gemini gets
  // `responseMimeType: 'application/json'`.
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
  // Triad is scoped to the owner's household only; everyone else's "triad ..."
  // is just a normal chat message.
  const isTriadDirect = isTriadHousehold(householdId) && (/^(triad|\/triad)\b/i.test(cleanQuery) ||
    /\b(triad doctor|triad gate|triad health|review diff)\b/i.test(cleanQuery));

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
  // The daemon returns advisors as a list of {name, ...} dicts; be liberal
  // and also accept the older name->config map shape. Object.keys() on a
  // list returns indices ("0, 1"), which is the bug this replaces.
  const advisorNames = (advisors: unknown): string => {
    if (Array.isArray(advisors)) {
      return advisors
        .map((a: any) => (a && typeof a === 'object' ? a.name : a) || '')
        .filter(Boolean)
        .join(', ');
    }
    if (advisors && typeof advisors === 'object') return Object.keys(advisors).join(', ');
    return '';
  };
          const subs = triadData.result || {};
          formatted = `Triad Health Report (Intent: DOCTOR):\n` +
            `• Pieces OS: ${subs.pieces_os ? '🟢 Online (39300)' : '🔴 Offline'}\n` +
            `• Hermes Relay: ${subs.hermes_relay ? '🟢 Online (8766)' : '🔴 Standby'}\n` +
            `• Pieces Proxy: ${subs.pieces_proxy ? '🟢 Online (8787)' : '🔴 Offline'}\n` +
            `• Ollama: ${subs.ollama ? '🟢 Online (11434)' : '🔴 Standby'}\n` +
            `• Active Advisors: ${advisorNames(subs.advisors) || 'Claude, Codex'}`;
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
      const { text, actions, stopReason, usage, truncated, droppedActions } = await callClaude(
        messages, effectiveSystem, anthropicKey, chosenModel, tokens, wantJson, scopedTools, allowedTools, isAdmin
      );
      if (!text && actions.length === 0) {
        if (droppedActions > 0) {
          return j({
            text: 'I attempted to perform an action, but it could not be validated or was cut off.',
            actions: [],
            truncated: true,
            droppedActions,
          });
        }
        // Never return a silent 200 with empty text and no actions — surface it as a 502 so clients can retry.
        return j(
          { error: stopReason ? `Model returned no text (stop_reason=${stopReason}).` : 'Model returned no text.' },
          502,
        );
      }
      return j({
        text,
        ...(useTools ? { actions } : (actions.length > 0 ? { actions } : {})),
        model: chosenModel,
        ...(wantJson ? { format: 'json' } : {}),
        ...(truncated ? { truncated: true } : {}),
        ...(droppedActions > 0 ? { droppedActions } : {}),
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
    const { text, actions, truncated, droppedActions, toolsDegraded } = await callGemini(
      messages, effectiveSystem, geminiKey!, tokens, wantJson, scopedTools, allowedTools, isAdmin
    );
    if (!text && actions.length === 0) {
      if (droppedActions > 0) {
        return j({
          text: 'I attempted to perform an action, but it could not be validated or was cut off.',
          actions: [],
          truncated: true,
          droppedActions,
        });
      }
      return j({ error: 'Model returned no text.' }, 502);
    }
    return j({
      text,
      ...(useTools ? { actions } : (actions.length > 0 ? { actions } : {})),
      model: GEMINI_MODEL,
      ...(wantJson ? { format: 'json' } : {}),
      ...(truncated ? { truncated: true } : {}),
      ...(droppedActions > 0 ? { droppedActions } : {}),
      ...(toolsDegraded ? { toolsDegraded: true } : {}),
    });
  } catch (e: any) {
    console.error('[Chat] Gemini provider error:', e?.message || e);
    const status = e instanceof ProviderError && (e.status === 429 || e.status === 503) ? e.status : 502;
    return j({ error: 'AI provider error. Please try again in a moment.' }, status);
  }
}
