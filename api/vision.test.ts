import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_aiKeys.js', () => ({ resolveAiKeys: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './vision';
import { resolveHouseholdId } from './_db.js';
import { resolveAiKeys } from './_aiKeys.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, auth = 'Bearer valid-token', method = 'POST') {
  return new Request('https://example.com/api/vision', {
    method,
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('POST /api/vision', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ prompt: 'what is this', imageBase64: 'abc' }, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limited', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 5 });
    const res = await handler(req({ prompt: 'what is this', imageBase64: 'abc' }));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain('5s');
  });

  it('rejects with 500 when no AI keys are configured', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: undefined, geminiKey: undefined });
    const res = await handler(req({ prompt: 'what is this', imageBase64: 'abc' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain('API key not configured');
  });

  it('rejects with 400 when body is missing imageBase64 or prompt', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-123' });
    const res = await handler(req({ prompt: 'only prompt' }));
    expect(res.status).toBe(400);
  });

  it('calls Claude when anthropicKey is present and returns 200', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-123' });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: 'Clean kitchen counter' }] }),
    } as any);

    const res = await handler(req({ prompt: 'assess room', imageBase64: 'aW1hZ2VkYXRh' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe('Clean kitchen counter');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'sk-ant-123' }),
      })
    );
  });

  it('falls back to Gemini when Claude fails and geminiKey is present', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-123', geminiKey: 'ai-gemini-456' });
    // Claude throws / fails
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 529, text: async () => 'Overloaded' } as any)
      // Gemini succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Room looks tidy from Gemini' }] } }],
        }),
      } as any);

    const res = await handler(req({ prompt: 'assess room', imageBase64: 'aW1hZ2VkYXRh' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe('Room looks tidy from Gemini');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('calls Gemini directly when only geminiKey is configured', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: undefined, geminiKey: 'ai-gemini-456' });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Receipt total is $42.50' }] } }],
      }),
    } as any);

    const res = await handler(req({ prompt: 'scan receipt', imageBase64: 'cmVjZWlwdA==' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe('Receipt total is $42.50');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-2.0-flash:generateContent?key=ai-gemini-456'),
      expect.anything()
    );
  });

  it('rejects GET requests with 405 Method Not Allowed', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-1');
    const res = await handler(req(null, 'Bearer valid-token', 'GET'));
    expect(res.status).toBe(405);
  });
});
