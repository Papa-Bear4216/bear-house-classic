/**
 * Anthropic + Gemini provider calls — streaming and non-streaming.
 *
 * Pure I/O layer extracted from chat.ts so the chat handler can be tested
 * without mocking global fetch for every provider path. Both functions take
 * an already-resolved model string (model selection stays in the handler,
 * where the household tier toggle lives).
 *
 * Signatures mirror the handlers' needs:
 *  - fetchAiStream  → AsyncIterable<string>   (text deltas for SSE)
 *  - fetchAi        → Promise<{ text, stopReason, usage }>  (non-streaming)
 *
 * Gemini streaming uses `generateContentStream` (newer than the
 * `generateContent` call the dead-model routes still use). Claude streaming
 * uses the Messages API `stream: true`.
 */

import { GEMINI_MODEL } from '../api/_aiModels.js';

const PROVIDER_TIMEOUT_MS = 30_000;

/** Claude Messages API — non-streaming. */
async function fetchClaude(
  model: string,
  system: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  apiKey: string,
): Promise<{ text: string; stopReason: string | null; usage: { cacheRead: number; cacheCreated: number } }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      ],
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  const text = (data?.content ?? [])
    .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('');

  return {
    text,
    stopReason: data?.stop_reason ?? null,
    usage: {
      cacheRead: data?.usage?.cache_read_input_tokens ?? 0,
      cacheCreated: data?.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}

/** Claude Messages API — streaming text deltas. */
async function* streamClaude(
  model: string,
  system: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  apiKey: string,
): AsyncIterableIterator<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
      ],
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      stream: true,
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude ${res.status}: ${errText.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Claude stream: no response body');

  let buf = new Uint8Array();
  let bufLen = 0;
  let done = false;

  try {
    while (!done) {
      const { value, done: readDone } = await reader.read();
      done = readDone;
      if (value) {
        // Append to buffer and scan for complete SSE lines.
        const needed = new Uint8Array(bufLen + value.length);
        needed.set(buf.subarray(0, bufLen), 0);
        needed.set(value, bufLen);
        buf = needed;
        bufLen += value.length;
      }

      let off = 0;
      while (off < bufLen) {
        const nl = buf.indexOf(10, off); // '\n'
        if (nl === -1) break;
        const line = decoder.decode(buf.slice(off, nl));
        off = nl + 1;

        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(payload);
            if (parsed?.type === 'content_block_delta' && parsed?.delta?.type === 'text_delta') {
              yield parsed.delta.text;
            }
          } catch {
            // not a data payload we care about — skip
          }
        }
      }

      if (off > 0) {
        // Shift consumed bytes out of the buffer.
        if (off < bufLen) {
          buf.set(buf.slice(off), 0);
        }
        bufLen -= off;
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* already closed */ }
  }
}

/** Gemini generateContent — non-streaming. */
async function fetchGemini(
  model: string,
  system: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  apiKey: string,
  opts?: { responseMimeType?: string; responseSchema?: unknown },
): Promise<{ text: string }> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: any = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (opts?.responseMimeType) body.generationConfig.responseMimeType = opts.responseMimeType;
  if (opts?.responseSchema) body.generationConfig.responseSchema = opts.responseSchema;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => typeof p?.text === 'string')
    .map((p: any) => p.text)
    .join('');

  return { text };
}

/** Gemini generateContentStream — streaming text deltas. */
async function* streamGemini(
  model: string,
  system: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  apiKey: string,
  opts?: { responseMimeType?: string; responseSchema?: unknown },
): AsyncIterableIterator<string> {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: any = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (opts?.responseMimeType) body.generationConfig.responseMimeType = opts.responseMimeType;
  if (opts?.responseSchema) body.generationConfig.responseSchema = opts.responseSchema;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Gemini stream: no response body');

  let buf = new Uint8Array();
  let bufLen = 0;
  let done = false;

  try {
    while (!done) {
      const { value, done: readDone } = await reader.read();
      done = readDone;
      if (value) {
        const needed = new Uint8Array(bufLen + value.length);
        needed.set(buf.subarray(0, bufLen), 0);
        needed.set(value, bufLen);
        buf = needed;
        bufLen += value.length;
      }

      let off = 0;
      while (off < bufLen) {
        const nl = buf.indexOf(10, off);
        if (nl === -1) break;
        const line = decoder.decode(buf.slice(off, nl));
        off = nl + 1;

        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(payload);
            if (parsed?.candidates?.[0]?.content?.parts?.[0]?.text) {
              yield parsed.candidates[0].content.parts[0].text;
            }
          } catch {
            // skip unrecognized chunks
          }
        }
      }

      if (off > 0) {
        if (off < bufLen) {
          buf.set(buf.slice(off), 0);
        }
        bufLen -= off;
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* already closed */ }
  }
}

// ── Public surface ────────────────────────────────────────────────────────────

/** Non-streaming: dispatch to Claude or Gemini based on which key is present. */
export async function fetchAi(
  model: string,
  system: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  anthropicKey?: string,
  geminiKey?: string,
): Promise<{ text: string; stopReason: string | null; usage: { cacheRead: number; cacheCreated: number } }> {
  if (anthropicKey) {
    try {
      return await fetchClaude(model, system, messages, maxTokens, anthropicKey);
    } catch (e) {
      if (!geminiKey) throw e;
    }
  }
  if (geminiKey) {
    const geminiModel = model.startsWith('gemini-') ? model : GEMINI_MODEL;
    return await fetchGemini(geminiModel, system, messages, maxTokens, geminiKey);
  }
  throw new Error('No AI key configured');
}

/** Streaming: yields text deltas from Claude or Gemini. Falls back across providers
 * on failure, just like the non-streaming path — but only if no deltas have been
 * yielded yet. Once the first delta is sent to the client, a mid-stream provider
 * failure is propagated as an error rather than silently concatenated with a full
 * Gemini response. */
export async function* fetchAiStream(
  model: string,
  system: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  anthropicKey?: string,
  geminiKey?: string,
): AsyncIterableIterator<string> {
  if (anthropicKey) {
    try {
      yield* streamClaude(model, system, messages, maxTokens, anthropicKey);
      return;
    } catch (e) {
      if (!geminiKey) throw e;
    }
  }
  if (geminiKey) {
    const geminiModel = model.startsWith("gemini-") ? model : GEMINI_MODEL;
    yield* streamGemini(geminiModel, system, messages, maxTokens, geminiKey);
    return;
  }
  throw new Error("No AI key configured");
}
