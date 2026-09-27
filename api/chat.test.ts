import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn(), dbGetHermesModelTier: vi.fn() }));
vi.mock('./_aiKeys.js', () => ({ resolveAiKeys: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler, { buildClaudeRequestBody } from './chat';
import { resolveHouseholdId, dbGetHermesModelTier } from './_db.js';
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

  it('routes Triad queries directly to ambient Triad daemon on port 8789', async () => {
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

  it('gracefully falls back to LLM when Triad daemon is offline during a triad query', async () => {
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
});