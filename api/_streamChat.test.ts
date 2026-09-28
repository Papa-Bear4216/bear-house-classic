import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./_postChat.js', () => ({
  resolveChatInput: vi.fn(),
}));

vi.mock('./_streamBody.js', () => ({
  fetchAiStream: vi.fn(),
}));

import { handleStreamingChat } from './_streamChat.js';
import { resolveChatInput } from './_postChat.js';
import { fetchAiStream } from './_streamBody.js';

function makeRequest(body: unknown, auth = 'Bearer t'): Request {
  return new Request('https://example.com/api/chat?stream=true', {
    method: 'POST',
    headers: {
      authorization: auth,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function* yieldChunks(chunks: string[]): AsyncIterableIterator<string> {
  for (const c of chunks) yield c;
}

async function readBody(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  let totalLength = 0;
  for (const p of parts) totalLength += p.length;
  const merged = new Uint8Array(totalLength);
  let off = 0;
  for (const p of parts) { merged.set(p, off); off += p.length; }
  return new TextDecoder().decode(merged);
}

describe('server/streamChat.handleStreamingChat', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns a 401 JSON error when resolveChatInput fails auth', async () => {
    vi.mocked(resolveChatInput).mockResolvedValue({
      kind: 'error',
      status: 401,
      body: { error: 'Unauthorized' },
    });

    const res = await handleStreamingChat(makeRequest({ prompt: 'hi' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' });
    expect(vi.mocked(fetchAiStream)).not.toHaveBeenCalled();
  });

  it('returns a 429 JSON error when rate-limited', async () => {
    vi.mocked(resolveChatInput).mockResolvedValue({
      kind: 'error',
      status: 429,
      body: { error: 'Rate limit exceeded' },
    });

    const res = await handleStreamingChat(makeRequest({ prompt: 'hi' }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'Rate limit exceeded' });
  });

  it('returns 400 for triad queries — streaming not supported', async () => {
    vi.mocked(resolveChatInput).mockResolvedValue({
      kind: 'triad',
      prompt: 'doctor',
    });

    const res = await handleStreamingChat(makeRequest({ prompt: 'triad doctor' }));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body).toMatchObject({
      error: expect.stringContaining('streaming'),
    });
    expect(vi.mocked(fetchAiStream)).not.toHaveBeenCalled();
  });

  it('streams deltas + final metadata from fetchAiStream as SSE', async () => {
    vi.mocked(resolveChatInput).mockResolvedValue({
      kind: 'ai',
      input: {
        householdId: 'h1',
        messages: [{ role: 'user', content: 'hi' }],
        effectiveSystem: 'sys',
        tokens: 512,
        chosenModel: 'claude-haiku-4-5-20251001',
        anthropicKey: 'sk-ant-1',
        geminiKey: undefined,
        isTriadDirect: false,
        triadPrompt: '',
      },
    });

    vi.mocked(fetchAiStream).mockReturnValue(yieldChunks(['Hello', ', ', 'world']));

    const res = await handleStreamingChat(makeRequest({ prompt: 'hi' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const body = await readBody(res);
    // Each delta is emitted as { text, done: false }; final frame has done: true + model + fullText
    expect(body).toContain('"text":"Hello"');
    expect(body).toContain('"text":", "');
    expect(body).toContain('"text":"world"');
    expect(body).toContain('"done":true');
    expect(body).toContain('"model":"claude-haiku-4-5-20251001"');
    expect(body).toContain('"fullText":"Hello, world"');
  });

  it('emits an SSE error frame when the provider stream throws', async () => {
    vi.mocked(resolveChatInput).mockResolvedValue({
      kind: 'ai',
      input: {
        householdId: 'h1',
        messages: [{ role: 'user', content: 'hi' }],
        effectiveSystem: 'sys',
        tokens: 512,
        chosenModel: 'claude-haiku-4-5-20251001',
        anthropicKey: 'sk-ant-1',
        geminiKey: undefined,
        isTriadDirect: false,
        triadPrompt: '',
      },
    });

    let yielded = 0;
    vi.mocked(fetchAiStream).mockReturnValue((async function* () {
      yield 'ok';
      yielded++;
      throw new Error('stream broke');
    })());

    const res = await handleStreamingChat(makeRequest({ prompt: 'hi' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const body = await readBody(res);
    expect(body).toContain('"text":"ok"');
    expect(body).toContain('"error"');
  });
});
