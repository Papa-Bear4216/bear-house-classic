import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn(), dbGetHermesModelTier: vi.fn() }));
vi.mock('./_aiKeys.js', () => ({ resolveAiKeys: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './chat';
import { resolveHouseholdId, dbGetHermesModelTier } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, auth = 'Bearer t') {
  return new Request('https://example.com/api/chat', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authed() {
  vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
  vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');
  vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: 'gemini-1' });
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
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [{ text: 'hello' }] }),
    } as Response);

    await handler(req({ prompt: 'hi' }));

    expect(resolveAiKeys).toHaveBeenCalledWith('household-1');
  });

  it('returns the Claude response when the Anthropic key is configured and the call succeeds', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [{ text: 'hello from claude' }] }),
    } as Response);

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('hello from claude');
  });

  it('falls back to Gemini when Claude errors and a Gemini key is also configured', async () => {
    authed();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'claude down' } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'hello from gemini' }] } }] }),
      } as Response);

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

  // --- Hermes overhaul: tier toggle, current models, empty-response handling ---

  it('uses the household sonnet tier for the Claude model', async () => {
    authed();
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('sonnet');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [{ text: 'hi' }] }),
    } as Response);

    await handler(req({ prompt: 'hi' }));

    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.model).toBe('claude-sonnet-4-6');
  });

  it('defaults to haiku when the tier lookup fails', async () => {
    authed();
    vi.mocked(dbGetHermesModelTier).mockRejectedValue(new Error('db down'));
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [{ text: 'hi' }] }),
    } as Response);

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const sentBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(sentBody.model).toBe('claude-haiku-4-5-20251001');
  });

  it('lets an explicit model param override the household tier', async () => {
    authed();
    vi.mocked(dbGetHermesModelTier).mockResolvedValue('haiku');
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [{ text: 'hi' }] }),
    } as Response);

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
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'claude down' } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'hi gemini' }] } }] }),
      } as Response);

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[1][0])).toContain('gemini-2.5-flash');
    expect(String(fetchMock.mock.calls[1][0])).not.toContain('gemini-2.0-flash');
  });

  it('flags truncated responses instead of silently cutting off', async () => {
    authed();
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [{ text: 'partial…' }], stop_reason: 'max_tokens' }),
    } as Response);

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('partial…');
    expect(body.truncated).toBe(true);
  });
});
