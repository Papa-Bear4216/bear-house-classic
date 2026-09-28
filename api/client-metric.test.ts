import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./_db.js', () => ({ resolveHouseholdId: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_log.js', () => ({ logInfo: vi.fn() }));

import handler from './client-metric';
import { resolveHouseholdId } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';
import { logInfo } from './_log.js';

function req(body: unknown, authorization = 'Bearer valid-token') {
  return new Request('https://example.test/api/client-metric', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveHouseholdId).mockResolvedValue('household-from-session');
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('POST /api/client-metric', () => {
  it('derives rate-limit scope from the verified session, not the body', async () => {
    const res = await handler(req({
      event: 'household_load', totalMs: 100, householdId: 'attacker-household',
      detail: { sessionMs: 40, pullFromCloudMs: 60 },
    }));

    expect(res.status).toBe(204);
    expect(checkRateLimit).toHaveBeenCalledWith('household-from-session', 'client-metric', 60);
    expect(logInfo).toHaveBeenCalledWith('client-metric', 'household_load', {
      totalMs: 100,
      sessionMs: 40,
      pullFromCloudMs: 60,
      householdId: 'household-from-session',
    });
  });

  it('does not log anonymous requests or let them skip the limiter', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ event: 'household_load', totalMs: 100 }, ''));
    expect(res.status).toBe(204);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('drops a bearer token that does not resolve to a household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req({ event: 'household_load', totalMs: 100 }));
    expect(res.status).toBe(204);
    expect(resolveHouseholdId).toHaveBeenCalledWith('valid-token');
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('does not log when the server-side rate limit is exhausted', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    const res = await handler(req({ event: 'household_load', totalMs: 100 }));
    expect(res.status).toBe(204);
    expect(checkRateLimit).toHaveBeenCalledWith('household-from-session', 'client-metric', 60);
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('keeps auth and limiter infrastructure failures best-effort', async () => {
    vi.mocked(resolveHouseholdId).mockRejectedValueOnce(new Error('auth service down'));
    const authFailure = await handler(req({ event: 'household_load', totalMs: 100 }));
    expect(authFailure.status).toBe(204);
    expect(logInfo).not.toHaveBeenCalled();

    vi.mocked(resolveHouseholdId).mockResolvedValue('household-from-session');
    vi.mocked(checkRateLimit).mockRejectedValueOnce(new Error('database down'));
    const limiterFailure = await handler(req({ event: 'household_load', totalMs: 100 }));
    expect(limiterFailure.status).toBe(204);
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('rejects arbitrary metric detail fields', async () => {
    const res = await handler(req({ event: 'household_load', totalMs: 100, detail: { level: 999 } }));
    expect(res.status).toBe(204);
    expect(checkRateLimit).toHaveBeenCalledWith('household-from-session', 'client-metric', 60);
    expect(logInfo).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown event', { event: 'other_event', totalMs: 100 }],
    ['negative duration', { event: 'household_load', totalMs: -1 }],
    ['fractional duration', { event: 'household_load', totalMs: 1.5 }],
    ['oversized duration', { event: 'household_load', totalMs: 120_001 }],
    ['fractional detail', { event: 'household_load', totalMs: 100, detail: { sessionMs: 1.5 } }],
  ])('drops %s', async (_label, body) => {
    const res = await handler(req(body));
    expect(res.status).toBe(204);
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('accepts the documented two-minute timing ceiling', async () => {
    const res = await handler(req({ event: 'household_load', totalMs: 120_000 }));
    expect(res.status).toBe(204);
    expect(logInfo).toHaveBeenCalledWith('client-metric', 'household_load', {
      totalMs: 120_000,
      sessionMs: undefined,
      pullFromCloudMs: undefined,
      householdId: 'household-from-session',
    });
  });

  it('drops oversized bodies before parsing or logging', async () => {
    const body = JSON.stringify({ event: 'household_load', totalMs: 1, detail: { sessionMs: 1 } })
      .padEnd(4097, ' ');
    const res = await handler(new Request('https://example.test/api/client-metric', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body,
    }));
    expect(res.status).toBe(204);
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('bounds total size across streamed chunks', async () => {
    const encoder = new TextEncoder();
    const req = new Request('https://example.test/api/client-metric', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('{"event":"household_load","totalMs":1}'));
          controller.enqueue(encoder.encode(' '.repeat(4100)));
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const res = await handler(req);
    expect(res.status).toBe(204);
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('returns without waiting for a stalled stream cancellation', async () => {
    const encoder = new TextEncoder();
    let cancelCalled = false;
    const req = new Request('https://example.test/api/client-metric', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(' '.repeat(4097)));
        },
        cancel() {
          cancelCalled = true;
          return new Promise<void>(() => {});
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const res = await handler(req);
    expect(res.status).toBe(204);
    expect(cancelCalled).toBe(true);
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('accepts an exactly 4 KiB valid body', async () => {
    const exactBody = JSON.stringify({ event: 'household_load', totalMs: 1 }).padEnd(4096, ' ');
    const exactRes = await handler(new Request('https://example.test/api/client-metric', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: exactBody,
    }));
    expect(exactRes.status).toBe(204);
    expect(logInfo).toHaveBeenCalledTimes(1);
  });

  it('drops malformed JSON without logging', async () => {
    const malformed = await handler(new Request('https://example.test/api/client-metric', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: '{bad json',
    }));
    expect(malformed.status).toBe(204);
    expect(logInfo).not.toHaveBeenCalled();
  });
});
