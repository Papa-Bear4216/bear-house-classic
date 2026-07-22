import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, any>();

vi.mock('./_db.js', () => ({
  dbGet: vi.fn(async (key: string, householdId: string) => store.get(`${key}:${householdId}`) ?? null),
  dbSet: vi.fn(async (key: string, householdId: string, value: any) => { store.set(`${key}:${householdId}`, value); }),
}));

import { checkRateLimit } from './_rateLimit';

beforeEach(() => {
  store.clear();
  vi.useRealTimers();
});

describe('checkRateLimit', () => {
  it('allows the first request in a new window', async () => {
    const result = await checkRateLimit('household-1', 'chat', 30);
    expect(result.allowed).toBe(true);
  });

  it('allows requests under the limit', async () => {
    for (let i = 0; i < 29; i++) await checkRateLimit('household-1', 'chat', 30);
    const result = await checkRateLimit('household-1', 'chat', 30);
    expect(result.allowed).toBe(true);
  });

  it('blocks the request that would exceed the limit', async () => {
    for (let i = 0; i < 30; i++) await checkRateLimit('household-1', 'chat', 30);
    const result = await checkRateLimit('household-1', 'chat', 30);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('does not share a budget between different households', async () => {
    for (let i = 0; i < 30; i++) await checkRateLimit('household-1', 'chat', 30);
    const blocked = await checkRateLimit('household-1', 'chat', 30);
    expect(blocked.allowed).toBe(false);

    const other = await checkRateLimit('household-2', 'chat', 30);
    expect(other.allowed).toBe(true);
  });

  it('does not share a budget between different endpoints for the same household', async () => {
    for (let i = 0; i < 30; i++) await checkRateLimit('household-1', 'chat', 30);
    const chatBlocked = await checkRateLimit('household-1', 'chat', 30);
    expect(chatBlocked.allowed).toBe(false);

    const visionAllowed = await checkRateLimit('household-1', 'vision', 15);
    expect(visionAllowed.allowed).toBe(true);
  });

  it('resets the window after it expires', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    for (let i = 0; i < 30; i++) await checkRateLimit('household-1', 'chat', 30);
    const blocked = await checkRateLimit('household-1', 'chat', 30);
    expect(blocked.allowed).toBe(false);

    vi.setSystemTime(now + 61_000); // 1 second past the 60s window
    const result = await checkRateLimit('household-1', 'chat', 30);
    expect(result.allowed).toBe(true);
    vi.useRealTimers();
  });
});
