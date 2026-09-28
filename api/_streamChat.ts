/**
 * Streaming chat handler — SSE endpoint for /api/chat?stream=true.
 *
 * Thin wrapper over:
 *  - resolveChatInput (postChat.ts) — body parse, auth, rate-limit, model selection, triad routing
 *  - streamBody.fetchAiStream — provider streaming (Claude SSE-proxied, Gemini streamed)
 *  - sse (responders.ts) — SSE framing
 *
 * Non-streaming path is unchanged in chat.ts.
 */

import { sse } from './_responders.js';
import { resolveChatInput } from './_postChat.js';
import { fetchAiStream } from './_streamBody.js';

export async function handleStreamingChat(req: Request): Promise<Response> {
  const resolution = await resolveChatInput(req);

  if (resolution.kind === 'error') {
    const { status, body } = resolution;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    });
  }

  if (resolution.kind === 'triad') {
    // Triad queries are diagnostics, not chat — they do not support streaming.
    // Use the non-streaming /api/chat endpoint instead.
    return new Response(
      JSON.stringify({ error: 'Triad queries do not support streaming. Use the non-streaming /api/chat endpoint.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } },
    );
  }

  const { input } = resolution;
  const { messages, effectiveSystem, tokens, chosenModel, anthropicKey, geminiKey } = input;
  let fullText = '';

  return sse(async (emit) => {
    try {
      for await (const delta of fetchAiStream(chosenModel, effectiveSystem, messages, tokens, anthropicKey, geminiKey)) {
        fullText += delta;
        emit({ text: delta, done: false });
      }

      emit({ text: '', done: true, model: chosenModel, fullText });
    } catch (err) {
      emit({ error: (err as Error).message || String(err) }, 'error');
    }
  });
}
