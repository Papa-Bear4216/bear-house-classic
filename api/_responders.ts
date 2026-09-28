/**
 * Shared response helpers for non-JSON payloads + SSE.
 *
 * `_responseHelpers.ts` covers the JSON envelope (`json`, `error`, `serverError`,
 * etc.). This module covers the two other shapes routes need:
 *
 * - `text(body, status)` — a `text/plain` response with CORS headers, for routes
 *   like briefing.ts that return plain text. Closes the documented drift where
 *   briefing.ts inlined `new Response(..., { headers: { 'Content-Type': 'text/plain' } })`
 *   without CORS headers.
 * - `sse(body)` — a `text/event-stream` response for SSE endpoints (chat streaming).
 */

import { CORS_HEADERS } from './_cors.js';

export function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
  });
}

/** Encode a single SSE event line per the EventSource spec. */
function encodeSseEvent(data: unknown, event?: string, id?: string): string {
  const chunks: string[] = [];
  if (id) chunks.push(`id: ${id}`);
  if (event) chunks.push(`event: ${event}`);
  chunks.push(`data: ${JSON.stringify(data)}`);
  chunks.push('');
  return chunks.join('\n');
}

/**
 * Wrap a publisher as a `text/event-stream` Response.
 *
 * `publisher` is called once with an `emit` function; each `emit(data, event?)`
 * writes a correctly formatted SSE event block to the stream. When `publisher`
 * returns or throws, the stream is closed.
 */
export function sse(
  publisher: (emit: (data: unknown, event?: string, id?: string) => void) => Promise<void>,
  options?: { retry?: number; event?: string; id?: string },
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let encodeError: unknown = undefined;
      try {
        await publisher((data, event, id) => {
          try {
            controller.enqueue(new TextEncoder().encode(encodeSseEvent(data, event ?? options?.event, id ?? options?.id)));
          } catch (e) {
            encodeError = e;
            controller.error(e);
          }
        });
      } catch (e) {
        if (!encodeError) {
          try {
            controller.enqueue(new TextEncoder().encode(encodeSseEvent({ error: (e as Error).message || String(e) }, 'error')));
          } catch {}
        }
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    ...CORS_HEADERS,
  };
  if (options?.retry != null) headers['retry'] = String(options.retry);

  return new Response(stream, { headers });
}
