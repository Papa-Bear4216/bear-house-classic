/**
 * Pure chat-input resolution — body parse, auth, rate-limit, key resolution,
 * model selection, and triad-query detection. No fetch, no provider call.
 *
 * PARITY: this resolver must mirror chat.ts until both are replaced by
 * _hermesContext.ts. Keep model selection, surface verification, and context
 * assembly aligned in both paths. No current client requests streaming.
 *
 * Extracted from chat.ts's handler so the handler can delegate to
 * fetchAi / fetchAiStream from streamBody.ts instead of inlining provider
 * calls. The handler still owns the provider dispatch (stream vs. non-stream,
 * fetchAi vs. fetchAiStream, provider fallback) — this module only resolves
 * _what_ to call, not _how_ to call it.
 *
 * Side effects (all behind mocks in tests):
 *  - resolveHouseholdId(accessToken)
 *  - checkRateLimit(householdId, 'chat', 30)
 *  - dbGetHermesModelTier(householdId)
 *  - resolveAiKeys(householdId)
 *  - fetch (triad daemon only — only when isTriadDirect is true)
 *
 * Tests mock all of these. See _postChat.test.ts.
 */

import { isTriadHousehold } from './_triadAccess.js';
import { parseBody, ChatBodySchema } from './_schemas.js';
import { json } from './_responseHelpers.js';
import { checkRateLimit } from './_rateLimit.js';
import { resolveHouseholdId, resolveCallerMember, dbGetHermesModelTier } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { type ClaudeModelTier, HERMES_SYSTEM_PROMPT } from './_aiModels.js';
import { resolveHermesModel } from './_hermesRouting.js';
import { buildHermesContext } from './_hermesContext.js';

// Treat unknown keys as 0 length so the SSE publisher can count deltas.
export type DeltaCount = { count: number };

function providerMix(output: any): DeltaCount {
  if (!output || typeof output !== 'object') return { count: 0 };
  let c = 0;
  for (const v of Object.values(output)) {
    c += countValues(v);
  }
  return { count: c };
}

function countValues(v: unknown): number {
  if (typeof v === 'string') return v.length;
  if (Array.isArray(v)) return v.reduce((s, x) => s + countValues(x), 0);
  if (v && typeof v === 'object') {
    let s = 0;
    for (const val of Object.values(v)) s += countValues(val);
    return s;
  }
  return 0;
}

export type ChatInput = Readonly<{
  householdId: string;
  messages: Array<{ role: string; content: string }>;
  effectiveSystem: string;
  tokens: number;
  chosenModel: string;
  anthropicKey: string | undefined;
  geminiKey: string | undefined;
  isTriadDirect: boolean;
  triadPrompt: string;
  // Pre-counted delta estimate for the SSE Content-Length / progress heuristic.
  // Approximate — real deltas come from the provider. Used only when the caller
  // wants a rough size hint before streaming starts.
  estimatedTokenDelta: number;
  hermesMeta: { surface: string; model: string; memoryFacts: number; toolsCount: number };
}>;

export type ChatResolution =
  | { kind: 'ai'; input: ChatInput }
  | { kind: 'triad'; prompt: string }
  | { kind: 'error'; status: number; body: unknown };

export async function resolveChatInput(req: Request): Promise<ChatResolution> {
  const preflight = (await import('./_cors.js')).handleCorsPreflight(req);
  if (preflight) return { kind: 'error', status: 204, body: preflight };

  if (req.method !== 'POST') {
    return { kind: 'error', status: 405, body: { error: 'Method not allowed' } };
  }

  const authHeader = req.headers.get('authorization') || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const caller = accessToken ? await resolveCallerMember(accessToken).catch(() => null) : null;
  const householdId = caller?.householdId ?? (accessToken ? await resolveHouseholdId(accessToken) : null);
  if (!householdId) return { kind: 'error', status: 401, body: { error: 'Unauthorized' } };

  const rl = await checkRateLimit(householdId, 'chat', 30);
  if (!rl.allowed) {
    return { kind: 'error', status: 429, body: { error: `Rate limit exceeded, try again in ${rl.retryAfterSeconds}s` } };
  }

  const rawBody = await req.json().catch(() => ({})) as any;
  const parsed = parseBody(ChatBodySchema, rawBody);
  if (!parsed.ok) return { kind: 'error', status: 400, body: { error: parsed.error } };

  const { prompt, messages: msgArray, system, clientSnapshot, maxTokens, model, surface, currentModule, neutralMode, role: requestedRole, memberId } = parsed.data;
  if (surface === 'kids-monster' && (
    caller?.role !== 'child' || !caller || !memberId || memberId !== caller.memberId || requestedRole !== 'child'
  )) {
    return { kind: 'error', status: 403, body: { error: 'Forbidden: invalid sealed Monster Hermes identity.' } };
  }
  const messages: Array<{ role: string; content: string }> =
    (msgArray || [{ role: 'user', content: prompt || '' }]).map(m => ({ role: m.role || 'user', content: m.content || '' }));
  const tokens = maxTokens || 512;

  const tier = (await dbGetHermesModelTier(householdId).catch(() => 'haiku' as const)) as ClaudeModelTier;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || prompt || '';
  const chosenModel = resolveHermesModel(lastUserMsg, model, tier);
  let effectiveSystem = system || HERMES_SYSTEM_PROMPT;
  let memoryFacts = 0;
  let toolsCount = 0;
  if (surface) {
    const context = await buildHermesContext({
      householdId,
      callerRole: caller?.role || 'child',
      canControlDevices: caller?.canControlDevices ?? false,
      surface,
      currentModule,
      clientSnapshot: surface === 'kids-monster' ? undefined : clientSnapshot,
      sealedPersona: surface === 'kids-monster' ? system : undefined,
      enableTools: false,
      neutralMode: neutralMode === true,
      requestedRole,
      modelId: chosenModel,
    });
    effectiveSystem = context.system;
    memoryFacts = context.memoryCount;
    toolsCount = context.tools.length;
  }
  const cleanQuery = lastUserMsg.trim();
  const isTriadDirect = isTriadHousehold(householdId) && (
    /^(triad|\/triad)\b/i.test(cleanQuery) ||
    /\b(triad doctor|triad gate|triad health|review diff)\b/i.test(cleanQuery));

  if (isTriadDirect) {
    const strippedPrompt = cleanQuery.replace(/^(\/)?triad\s*:?\s*/i, '').trim() || 'doctor';
    return { kind: 'triad', prompt: strippedPrompt };
  }

  const { anthropicKey, geminiKey } = await resolveAiKeys(householdId);
  if (!anthropicKey && !geminiKey) {
    return { kind: 'error', status: 500, body: { error: 'API key not configured.' } };
  }

  const estimatedTokenDelta = providerMix(messages).count;

  return {
    kind: 'ai',
    input: {
      householdId,
      messages,
      effectiveSystem,
      tokens,
      chosenModel,
      anthropicKey,
      geminiKey,
      isTriadDirect: false,
      triadPrompt: '',
      estimatedTokenDelta,
      hermesMeta: { surface: surface || 'api', model: chosenModel, memoryFacts, toolsCount },
    },
  };
}
