import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_aiKeys.js', () => ({ resolveAiKeys: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './chat';
import { resolveHouseholdId } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/chat', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('POST /api/chat', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ prompt: 'hi' }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when the token does not resolve to a household — wrong/stale token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ prompt: 'hi' }, 'Bearer someone-elses-token'));
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

  it('scopes AI key resolution to the caller\'s own resolved household, not a client-supplied one', async () => {
    // Regression guard: the body has no householdId field at all (ChatBodySchema
    // doesn't accept one) — resolveAiKeys must only ever be called with the
    // server-resolved id from the bearer token.
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: undefined });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [{ text: 'hello' }] }),
    } as Response);

    await handler(req({ prompt: 'hi' }));

    expect(resolveAiKeys).toHaveBeenCalledWith('household-1');
  });

  it('returns the Claude response when the Anthropic key is configured and the call succeeds', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: 'gemini-1' });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ content: [{ text: 'hello from claude' }] }),
    } as Response);

    const res = await handler(req({ prompt: 'hi' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('hello from claude');
  });

  it('falls back to Gemini when Claude errors and a Gemini key is also configured', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-1', geminiKey: 'gemini-1' });
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
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ text: 'fallback response from claude' }] }),
      } as Response);

    const res = await handler(req({ prompt: 'triad doctor' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe('fallback response from claude');
  });
});
