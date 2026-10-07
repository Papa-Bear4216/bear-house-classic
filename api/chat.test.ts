import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn(), resolveCallerMember: vi.fn(), dbGetHermesModelTier: vi.fn() }));
vi.mock('./_aiKeys.js', () => ({ resolveAiKeys: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler, { buildClaudeRequestBody } from './chat';
import { resolveHouseholdId, resolveCallerMember, dbGetHermesModelTier } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';

// --- Test helpers -------------------------------------------------------
// Extracted so the new Hermes-overhaul tests don't repeat the same
// fetch-mock shape six times (that was the Sonar duplicated-lines hit).

function req(body: unknown, auth = 'Bearer t') {
  return new Request('https://example.com/api/chat', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authed() {
  vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
  vi.mocked(resolveCallerMember).mockResolvedValue({ householdId: 'household-1', memberId: 'm-admin', role: 'admin', canControlDevices: true });
  vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');
  vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: 'gemini-1' });
}

/** Mocks a successful Claude response with the given text. */
function claudeOk(text = 'hi') {
  return {
    ok: true,
    json: async () => ({ content: [{ type: 'text', text }] }),
  } as Response;
}

/** Mocks a successful Gemini response with the given text. */
function geminiOk(text: string) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as Response;
}

/** Mocks Claude being down (500) so the Gemini fallback path is exercised. */
function claudeDown() {
  return { ok: false, status: 500, text: async () => 'claude down' } as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');
  vi.mocked(resolveCallerMember).mockResolvedValue(null);
  delete process.env.TRIAD_HOUSEHOLD_ID;
});

describe('POST /api/chat', () => {
  it('rejects with 401 when there is no Bearer token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ prompt: 'hi' }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when the token does not resolve to a household — wrong/stale token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ prompt: 'hi' }, 'Bearer bad'));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when the household is rate-limited', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 3 });
    const res = await handler(req({ prompt: 'hi' }));
    expect(res.status).toBe(429);
  });

  it('rejects with 500 when the household has no AI key configured at all', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: undefined, geminiKey: undefined });
    const res = await handler(req({ prompt: 'hi' }));
    expect(res.status).toBe(500);
  });

  it("scopes AI key resolution to the caller's own resolved household, not a client-supplied one", async () => {
    // Regression guard: the body has no householdId field at all (ChatBodySchema
    // doesn't accept one) — resolveAiKeys must only ever be called with the
    // server-resolved id from the Bearer token
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk('hello'));

    await handler(req({ prompt: 'hi' }));

    expect(resolveAiKeys).toHaveBeenCalledWith('household-1');
  });

  it('returns the Claude response when the Anthropic key is configured and the call succeeds', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk('hello from claude'));

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('hello from claude');
  });

  it('falls back to Gemini when Claude errors and a Gemini key is also configured', async () => {
    authed();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(claudeDown())
      .mockResolvedValueOnce(geminiOk('hello from gemini'));

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('hello from gemini');
  });

  it('propagates the Claude error status when Claude fails and there is no Gemini fallback key', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' } as Response);

    const res = await handler(req({ prompt: 'hi' }));
    expect(res.status).toBe(429);
  });

  it('does not route "triad" to the daemon for a household that is not the Triad household', async () => {
    process.env.TRIAD_HOUSEHOLD_ID = 'someone-else';
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(claudeOk('normal llm answer'));

    const res = await handler(req({ prompt: 'triad doctor' }));
    const body = await res.json();
    expect(body.text).toBe('normal llm answer');
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes('8789'))).toBe(true);
  });

  it('routes Triad queries directly to ambient Triad daemon on port 8789', async () => {
    authed();
    process.env.TRIAD_HOUSEHOLD_ID = 'household-1';
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    // Notice resolveAiKeys is NOT called or required for Triad queries!
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'success',
        intent: 'DOCTOR',
        result: { pieces_os: true, hermes_relay: true, pieces_proxy: true, ollama: false, advisors: { claude: true } },
      }),
    } as Response);

    const res = await handler(req({ prompt: 'triad doctor' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = JSON.parse(body.text);
    expect(parsed.text).toContain('Triad Health Report (Intent: DOCTOR)');
    expect(parsed.text).toContain('Pieces OS: 🟢 Online (39300)');
  });

  it('blocks Triad queries when child role is active even in triad household', async () => {
    authed();
    process.env.TRIAD_HOUSEHOLD_ID = 'household-1';
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk('Normal child response'));

    const res = await handler(req({ prompt: 'triad doctor', role: 'child' }));
    expect(res.status).toBe(200);
    // Should NOT have called triad port 8789; should have reached Claude directly with child safety persona
    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.system[0].text).toContain('[Child Safety Persona Active]');
  });

  it('gracefully falls back to LLM when Triad daemon is offline during a triad query', async () => {
    authed();
    process.env.TRIAD_HOUSEHOLD_ID = 'household-1';
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });

    const fetchMock = vi.mocked(fetch);
    // 1st fetch: Triad daemon connection refused
    // 2nd fetch: Anthropic call succeeds
    fetchMock
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8789'))
      .mockResolvedValueOnce(claudeOk('fallback response from claude'));

    const res = await handler(req({ prompt: 'triad doctor' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('fallback response from claude');
  });

  // --- Hermes overhaul: tier toggle, current models, empty-response handling ---
  // --- Hermes overhaul: tier toggle, current models, empty-response handling ---

  it('uses the household sonnet tier for the Claude model', async () => {
    authed();
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('sonnet');
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    await handler(req({ prompt: 'hi' }));

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.model).toBe('claude-sonnet-4-6');
  });

  it('defaults to haiku when the tier lookup fails', async () => {
    authed();
    vi.mocked(dbGetHermesModelTier).mockRejectedValue(new Error('db down'));
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.model).toBe('claude-haiku-4-5-20251001');
  });

  it('lets an explicit model param override the household tier', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    await handler(req({ prompt: 'hi', model: 'claude-sonnet-4-6' }));

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.model).toBe('claude-sonnet-4-6');
  });

  it('returns 502 — not a silent 200 with empty text — when Claude returns no text', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [], stop_reason: 'end_turn' }),
    } as Response);

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/no text/);
  });

  it('calls the current gemini-2.5-flash model on the Gemini fallback path', async () => {
    authed();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(claudeDown())
      .mockResolvedValueOnce(geminiOk('hi gemini'));

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[1][0])).toContain('gemini-2.5-flash');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('gemini-2.0-flash');
  });

  it('flags truncated responses instead of silently cutting off', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [{ type: 'text', text: 'partial…' }], stop_reason: 'max_tokens' }),
    } as Response);

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('partial…');
    expect(body.truncated).toBe(true);
  });

  // --- Prompt caching: system prompt served from cache on repeat turns ---

  it('marks the system prompt as an ephemeral-cacheable block', () => {
    const body = buildClaudeRequestBody('claude-haiku-4-5-20251001', 'sys', [{ role: 'user', content: 'hi' }], 512);

    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.max_tokens).toBe(512);
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.system).toEqual([
      { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('sends the cache_control block on the live Claude request', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    await handler(req({ prompt: 'hi' }));

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.system).toEqual([
      { type: 'text', text: expect.any(String), cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('surfaces cache read/create token counts when the provider reports them', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'hi' }],
        usage: { input_tokens: 100, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
      }),
    } as Response);

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cache).toEqual({ cacheRead: 9000, cacheCreated: 0 });
  });

  it('omits the cache field when the provider reports no caching', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect('cache' in body).toBe(false);
  });

  // --- Hermes Action Reliability: Native Anthropic Tool Calling ---

  it('attaches HERMES_TOOLS when enableTools is true with cache control on the last tool for triad households', async () => {
    process.env.TRIAD_HOUSEHOLD_ID = 'household-1';
    authed();
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    await handler(req({ prompt: 'add milk to shopping', enableTools: true }));

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(Array.isArray(sentBody.tools)).toBe(true);
    expect(sentBody.tools.length).toBe(23);
    const lastTool = sentBody.tools[sentBody.tools.length - 1];
    expect(lastTool.cache_control).toEqual({ type: 'ephemeral' });
    expect(sentBody.max_tokens).toBe(1024);
  });

  it('attaches 22 tools omitting queryTriad for non-triad households with cache on new last tool', async () => {
    authed(); // household-1 is non-triad
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    await handler(req({ prompt: 'add milk to shopping', enableTools: true }));

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(Array.isArray(sentBody.tools)).toBe(true);
    expect(sentBody.tools.length).toBe(22);
    expect(sentBody.tools.some((t: any) => t.name === 'queryTriad')).toBe(false);
    const lastTool = sentBody.tools[sentBody.tools.length - 1];
    expect(lastTool.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('omits tools by default when enableTools is not specified', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    await handler(req({ prompt: 'plain text query' }));

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.tools).toBeUndefined();
    expect(sentBody.max_tokens).toBe(512);
  });

  it('parses tool_use blocks into structured actions and returns them alongside text', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          { type: 'text', text: 'Added milk to your shopping list.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'addShopping',
            input: { name: 'milk', quantity: '1 gallon', category: 'Groceries' },
          },
        ],
        stop_reason: 'tool_use',
      }),
    } as Response);

    const res = await handler(req({ prompt: 'get milk', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('Added milk to your shopping list.');
    expect(body.actions).toEqual([
      {
        type: 'addShopping',
        params: { name: 'milk', quantity: '1 gallon', category: 'Groceries' },
      },
    ]);
  });

  it('returns 200 with actions even when text is empty', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_2',
            name: 'completeTask',
            input: { match: 'dishes' },
          },
        ],
        stop_reason: 'tool_use',
      }),
    } as Response);

    const res = await handler(req({ prompt: 'dishes are done', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0].type).toBe('completeTask');
  });

  it('drops the last incomplete tool call when response is truncated by max_tokens', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'addTask',
            input: { text: 'Complete homework' },
          },
          {
            type: 'tool_use',
            id: 'toolu_truncated',
            name: 'setMealPlan',
            input: {}, // partial/corrupted input due to token cutoff
          },
        ],
        stop_reason: 'max_tokens',
      }),
    } as Response);

    const res = await handler(req({ prompt: 'two things', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0].type).toBe('addTask');
    expect(body.truncated).toBe(true);
  });

  it('drops tool calls that lack required fields', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_bad',
            name: 'addTask',
            input: { person: 'Sam' }, // missing required 'text'
          },
          {
            type: 'tool_use',
            id: 'toolu_good',
            name: 'addTask',
            input: { text: 'Wash dishes', person: 'Sam' },
          },
        ],
        stop_reason: 'tool_use',
      }),
    } as Response);

    const res = await handler(req({ prompt: 'add tasks', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0].params.text).toBe('Wash dishes');
  });

  it('filters out unknown tool names not in the whitelisted catalog', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_invalid',
            name: 'maliciousOrInventedTool',
            input: { dropTable: true },
          },
          {
            type: 'tool_use',
            id: 'toolu_valid',
            name: 'addTask',
            input: { text: 'Valid task' },
          },
        ],
        stop_reason: 'tool_use',
      }),
    } as Response);

    const res = await handler(req({ prompt: 'do something', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0].type).toBe('addTask');
  });

  it('filters out empty content messages to prevent Anthropic 400 errors', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    await handler(
      req({
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: '   ' },
          { role: 'user', content: 'world' },
        ],
      })
    );

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.messages).toHaveLength(2);
    expect(sentBody.messages[0].content).toBe('hello');
    expect(sentBody.messages[1].content).toBe('world');
  });

  it('rejects with 400 when all messages have empty content', async () => {
    authed();
    const res = await handler(
      req({
        messages: [{ role: 'user', content: '   ' }],
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No non-empty messages provided');
  });

  it('omits tools when format is json', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk());

    await handler(req({ prompt: 'hi', format: 'json', enableTools: true }));

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.tools).toBeUndefined();
  });

  it('extracts actions from Gemini function calls during fallback', async () => {
    authed();
    vi.mocked(fetch)
      .mockResolvedValueOnce(claudeDown())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: 'Done.' },
                  {
                    functionCall: {
                      name: 'addTask',
                      args: { text: 'Feed the dog' },
                    },
                  },
                ],
              },
            },
          ],
        }),
      } as Response);

    const res = await handler(req({ prompt: 'remind me to feed the dog', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('Done.');
    expect(body.actions).toEqual([
      { type: 'addTask', params: { text: 'Feed the dog' } },
    ]);
  });

  it('retries Gemini without tools when Gemini returns 400 with functionDeclarations', async () => {
    authed();
    vi.mocked(fetch)
      .mockResolvedValueOnce(claudeDown()) // Claude fails
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid schema for tool declaration',
      } as Response) // Gemini 400 with tools
      .mockResolvedValueOnce(geminiOk('Fell back to plain text answer')); // Gemini retry without tools succeeds

    const res = await handler(req({ prompt: 'what is dinner?', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('Fell back to plain text answer');
  });

  it('drops leading assistant messages left behind after filtering empty messages', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk('Hello there!'));

    const res = await handler(
      req({
        messages: [
          { role: 'user', content: '   ' }, // trimmed to empty and removed
          { role: 'assistant', content: 'previous assistant turn' }, // now leading non-user, must be dropped
          { role: 'user', content: 'valid user prompt' },
        ],
      })
    );

    expect(res.status).toBe(200);
    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.messages).toHaveLength(1);
    expect(sentBody.messages[0].role).toBe('user');
    expect(sentBody.messages[0].content).toBe('valid user prompt');
  });

  it('excludes queryTriad for non-triad households and drops hallucinated queryTriad tool call', async () => {
    authed(); // household-1 is non-triad
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_triad',
            name: 'queryTriad',
            input: { query: 'doctor' },
          },
        ],
        stop_reason: 'tool_use',
      }),
    } as Response);

    const res = await handler(req({ prompt: 'status check', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Sent request has 22 tools (queryTriad stripped)
    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.tools.some((t: any) => t.name === 'queryTriad')).toBe(false);
    // Response dropped queryTriad and surfaced droppedActions
    expect(body.actions).toEqual([]);
    expect(body.droppedActions).toBe(1);
  });

  it('returns 200 with notice when all actions are dropped and text is empty', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_invalid',
            name: 'deleteTask',
            input: {}, // missing match/id
          },
        ],
        stop_reason: 'tool_use',
      }),
    } as Response);

    const res = await handler(req({ prompt: 'delete it', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toEqual([]);
    expect(body.droppedActions).toBe(1);
    expect(body.truncated).toBe(true);
    expect(body.text).toContain('could not be validated');
  });

  it('does not retry Gemini on 400 when error is not schema/tool related and returns sanitized 502', async () => {
    authed();
    vi.mocked(fetch)
      .mockResolvedValueOnce(claudeDown()) // Claude fails
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'API_KEY_INVALID: Key not found',
      } as Response); // Gemini fails with auth/key 400

    const res = await handler(req({ prompt: 'hi', enableTools: true }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain('AI provider error');
    // Fetch should not have been called a third time
    expect(vi.mocked(fetch).mock.calls).toHaveLength(2);
  });

  it('excludes manageMember tool for child role accounts and drops attempted manageMember calls', async () => {
    authed();
    vi.mocked(resolveCallerMember).mockResolvedValue({
      householdId: 'household-1',
      memberId: 'm-child',
      role: 'child',
      canControlDevices: false,
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_admin',
            name: 'manageMember',
            input: { op: 'remove', person: 'Alice' },
          },
        ],
        stop_reason: 'tool_use',
      }),
    } as Response);

    const res = await handler(req({ prompt: 'kick Alice', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    // Tools sent to Claude should not contain manageMember, notifyPerson, or controlDevice
    expect(sentBody.tools.some((t: any) => t.name === 'manageMember')).toBe(false);
    expect(sentBody.tools.some((t: any) => t.name === 'notifyPerson')).toBe(false);
    expect(sentBody.tools.some((t: any) => t.name === 'controlDevice')).toBe(false);
    // Action dropped because it was not in allowedTools
    expect(body.actions).toEqual([]);
    expect(body.droppedActions).toBe(1);
  });

  it('fails closed to least privilege (child) when resolveCallerMember throws', async () => {
    authed();
    vi.mocked(resolveCallerMember).mockRejectedValueOnce(new Error('DB connection reset'));
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk('Hello'));

    const res = await handler(req({ prompt: 'hi', enableTools: true }));
    expect(res.status).toBe(200);

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    // Even though resolveCallerMember threw, least privilege ensures admin & device tools are stripped
    expect(sentBody.tools.some((t: any) => t.name === 'manageMember')).toBe(false);
    expect(sentBody.tools.some((t: any) => t.name === 'controlDevice')).toBe(false);
    expect(sentBody.tools.some((t: any) => t.name === 'notifyPerson')).toBe(false);
    expect(sentBody.tools.some((t: any) => t.name === 'updateMemory')).toBe(false);
  });

  it('applies child safety persona and strips sensitive household mutators when caller role is child', async () => {
    authed();
    vi.mocked(resolveCallerMember).mockResolvedValueOnce({
      householdId: 'household-1',
      memberId: 'm-child',
      role: 'child',
      canControlDevices: false,
    });
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk('Hi buddy!'));

    const res = await handler(req({ prompt: 'hello', enableTools: true }));
    expect(res.status).toBe(200);

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    // System prompt includes child safety persona
    expect(sentBody.system[0].text).toContain('[Child Safety Persona Active]');
    expect(sentBody.system[0].text).toContain('crisis support (988)');
    // Tools stripped
    const toolNames = sentBody.tools.map((t: any) => t.name);
    expect(toolNames).not.toContain('updateMemory');
    expect(toolNames).not.toContain('addCarMaintenanceEntry');
    expect(toolNames).not.toContain('addBill');
    expect(toolNames).not.toContain('markBillPaid');
    expect(toolNames).not.toContain('manageMember');
    // Child can still use basic task & shopping tools
    expect(toolNames).toContain('addTask');
    expect(toolNames).toContain('addShopping');
  });


  it('preserves 429 status code when Gemini returns rate limit error', async () => {
    authed();
    vi.mocked(fetch)
      .mockResolvedValueOnce(claudeDown())
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Resource has been exhausted (rate limit)',
      } as Response);

    const res = await handler(req({ prompt: 'hi', enableTools: true }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('AI provider error');
  });

  it('caps actions at MAX_ACTIONS_PER_TURN (8) and records droppedActions for the excess', async () => {
    authed();
    const tenToolUses = Array.from({ length: 10 }, (_, i) => ({
      type: 'tool_use',
      id: `tool_${i}`,
      name: 'addTask',
      input: { text: `Task ${i}` },
    }));
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [...tenToolUses, { type: 'text', text: 'Created tasks' }],
        stop_reason: 'tool_use',
      }),
    } as Response);

    const res = await handler(req({ prompt: 'create 10 tasks', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(8);
    expect(body.droppedActions).toBe(2);
  });

  it('handles Gemini fallback with no-arg function call (e.g. discoverSmartHome with undefined args)', async () => {
    authed();
    vi.mocked(fetch)
      .mockResolvedValueOnce(claudeDown())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'discoverSmartHome',
                    },
                  },
                ],
              },
            },
          ],
        }),
      } as Response);

    const res = await handler(req({ prompt: 'find devices', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0].type).toBe('discoverSmartHome');
    expect(body.actions[0].params).toEqual({});
  });

  it('always returns actions array when enableTools is true, preventing client text salvage bypass', async () => {
    authed();
    // Model returns raw JSON string in text, but did not use native tool_use
    const fakeProseJson = JSON.stringify({
      text: 'Here is your action',
      actions: [{ type: 'controlDevice', params: { domain: 'lock', service: 'unlock', entityId: 'lock.front_door' } }],
    });
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk(fakeProseJson));

    const res = await handler(req({ prompt: 'unlock door', enableTools: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // actions MUST be an array ([]) so HermesChat knows tools were active and skips parseHermesReply
    expect(Array.isArray(body.actions)).toBe(true);
    expect(body.actions).toEqual([]);
  });

  it('merges consecutive same-role messages for Gemini fallback turns', async () => {
    authed();
    vi.mocked(fetch)
      .mockResolvedValueOnce(claudeDown())
      .mockResolvedValueOnce(geminiOk('Acknowledged'));

    const res = await handler(req({
      messages: [
        { role: 'user', content: 'Turn 1' },
        { role: 'user', content: 'Turn 2' },
        { role: 'assistant', content: 'Reply' },
        { role: 'assistant', content: 'Follow-up' },
        { role: 'user', content: 'Final turn' },
      ],
      enableTools: true,
    }));
    expect(res.status).toBe(200);

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    // User turns 1 and 2 merged; model turns merged
    expect(sentBody.contents).toHaveLength(3);
    expect(sentBody.contents[0].parts[0].text).toBe('Turn 1\n\nTurn 2');
    expect(sentBody.contents[1].parts[0].text).toBe('Reply\n\nFollow-up');
    expect(sentBody.contents[2].parts[0].text).toBe('Final turn');
  });

  it('enforces child safety persona and restricts tools when role is explicitly child in body even if caller token is admin', async () => {
    authed(); // caller is admin with canControlDevices: true
    vi.mocked(fetch).mockResolvedValueOnce(claudeOk('Hello there, little explorer!'));

    const res = await handler(req({
      prompt: 'Can you help me?',
      role: 'child',
      memberId: 'kid-123',
      enableTools: true,
    }));
    expect(res.status).toBe(200);

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    // Injects child safety persona
    expect(sentBody.system[0].text).toContain('[Child Safety Persona Active]');
    // Strips adult tools even though caller was an admin
    const toolNames = sentBody.tools.map((t: any) => t.name);
    expect(toolNames).not.toContain('updateMemory');
    expect(toolNames).not.toContain('manageMember');
    expect(toolNames).not.toContain('controlDevice');
    expect(toolNames).toContain('addTask');
  });

  it('restricts tools and applies child persona in Gemini fallback path when role is child', async () => {
    authed();
    vi.mocked(fetch)
      .mockResolvedValueOnce(claudeDown())
      .mockResolvedValueOnce(geminiOk('Gemini child response'));

    const res = await handler(req({
      prompt: 'Hello Gemini',
      role: 'child',
      enableTools: true,
    }));
    expect(res.status).toBe(200);

    const geminiReqBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string);
    // Check system instruction
    const sysText = geminiReqBody.systemInstruction.parts[0].text;
    expect(sysText).toContain('[Child Safety Persona Active]');
    // Check tool declarations
    const decls = geminiReqBody.tools[0].functionDeclarations.map((d: any) => d.name);
    expect(decls).not.toContain('updateMemory');
    expect(decls).not.toContain('manageMember');
    expect(decls).not.toContain('controlDevice');
    expect(decls).toContain('addTask');
  });
});