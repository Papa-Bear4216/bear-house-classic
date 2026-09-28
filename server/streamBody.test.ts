/**
 * Tests for server/streamBody.ts — provider call layer.
 *
 * Mirrors streamChat.test.ts but tests the lower-level fetchAi / fetchAiStream
 * functions directly (no SSE framing, no handler dispatch).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchAi, fetchAiStream } from './streamBody.js';

function claudeStreamChunks(texts: string[]) {
  const events: string[] = [];
  for (const t of texts) {
    events.push(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })}`);
  }
  events.push('data: [DONE]');
  return events.join('\n');
}

function geminiStreamChunks(texts: string[]) {
  const events: string[] = [];
  for (const t of texts) {
    events.push(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}`);
  }
  events.push('data: [DONE]');
  return events.join('\n');
}

function makeStream(body: string) {
  let pos = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (pos >= body.length) {
          controller.close();
          return;
        }
        const nl = body.indexOf('\n', pos);
        const end = nl === -1 ? body.length : nl + 1;
        controller.enqueue(new TextEncoder().encode(body.slice(pos, end)));
        pos = end;
      },
    }),
    { headers: { 'Content-Type': 'text/plain' } },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('server/streamBody.fetchAi (non-streaming)', () => {
  it('calls Claude when an Anthropic key is present', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'hello from claude' }],
        stop_reason: 'end_turn',
        usage: { cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
      }),
    } as Response);

    const result = await fetchAi('claude-sonnet-4-6', 'sys', [{ role: 'user', content: 'hi' }], 512, 'sk-ant-1', undefined);

    expect(result.text).toBe('hello from claude');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage).toEqual({ cacheRead: 9000, cacheCreated: 0 });

    const url = (fetchMock.mock.calls[0][0] as string);
    expect(url).toContain('api.anthropic.com/v1/messages');
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(sentBody.model).toBe('claude-sonnet-4-6');
    expect(sentBody.system).toEqual([
      { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('falls back to Gemini when Claude errors and a Gemini key is present', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'claude down' } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'hello from gemini' }] } }] }),
      } as Response);

    const result = await fetchAi('claude-sonnet-4-6', 'sys', [{ role: 'user', content: 'hi' }], 512, 'sk-ant-1', 'gemini-key');

    expect(result.text).toBe('hello from gemini');
    const geminiUrl = (fetchMock.mock.calls[1][0] as string);
    expect(geminiUrl).toContain('generativelanguage.googleapis.com');
    expect(geminiUrl).toContain('gemini-2.5-flash');
  });

  it('throws when no key is configured', async () => {
    await expect(
      fetchAi('claude-sonnet-4-6', 'sys', [{ role: 'user', content: 'hi' }], 512, undefined, undefined),
    ).rejects.toThrow('No AI key configured');
  });

  it('throws the Claude error when Claude fails and no Gemini fallback exists', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' } as Response);
    await expect(
      fetchAi('claude-sonnet-4-6', 'sys', [{ role: 'user', content: 'hi' }], 512, 'sk-ant-1', undefined),
    ).rejects.toThrow('Claude 429');
  });
});

describe('server/streamBody.fetchAiStream (streaming)', () => {
  it('yields Claude deltas when streaming', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(makeStream(claudeStreamChunks(['hel', 'lo', ' from ', 'claude'])));

    const chunks: string[] = [];
    for await (const d of fetchAiStream('claude-sonnet-4-6', 'sys', [{ role: 'user', content: 'hi' }], 512, 'sk-ant-1', undefined)) {
      chunks.push(d);
    }
    expect(chunks).toEqual(['hel', 'lo', ' from ', 'claude']);
  });

  it('falls back to Gemini streaming when Claude stream errors', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'claude down' } as Response)
      .mockResolvedValueOnce(makeStream(geminiStreamChunks(['hello ', 'from gemini'])));

    const chunks: string[] = [];
    for await (const d of fetchAiStream('claude-sonnet-4-6', 'sys', [{ role: 'user', content: 'hi' }], 512, 'sk-ant-1', 'gemini-key')) {
      chunks.push(d);
    }
    expect(chunks).toEqual(['hello ', 'from gemini']);
    const geminiUrl = (fetchMock.mock.calls[1][0] as string);
    expect(geminiUrl).toContain('streamGenerateContent');
    expect(geminiUrl).toContain('gemini-2.5-flash');
  });

  it('throws when no key is configured for streaming', async () => {
    const it = fetchAiStream('claude-sonnet-4-6', 'sys', [{ role: 'user', content: 'hi' }], 512, undefined, undefined);
    await expect(it.next()).rejects.toThrow('No AI key configured');
  });

  it('throws the Claude stream error when no Gemini fallback exists', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' } as Response);
    const it = fetchAiStream('claude-sonnet-4-6', 'sys', [{ role: 'user', content: 'hi' }], 512, 'sk-ant-1', undefined);
    await expect(it.next()).rejects.toThrow('Claude 429');
  });
});
