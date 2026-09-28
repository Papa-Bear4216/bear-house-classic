import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../server/streamBody.js', () => ({ fetchAi: vi.fn() }));
vi.mock('./_aiKeys.js', () => ({ resolveAiKeys: vi.fn() }));

import { categorize } from './_categorize';
import { fetchAi } from '../server/streamBody.js';
import { resolveAiKeys } from './_aiKeys.js';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: 'sk-ant-x', geminiKey: undefined });
});

describe('categorize', () => {
  it('classifies uncached merchants and caches the result', async () => {
    vi.mocked(fetchAi).mockResolvedValue({
      text: '{"STARBUCKS": "Food"}',
      stopReason: 'end_turn',
      usage: { cacheRead: 0, cacheCreated: 0 },
    });
    const cache: Record<string, string> = {};
    const result = await categorize('h1', [{ notes: 'Starbucks #123' }], cache);
    expect(result[0].category).toBe('Food');
    expect(fetchAi).toHaveBeenCalledTimes(1);
  });

  it('does not call the model for already-cached merchants', async () => {
    const cache: Record<string, string> = { STARBUCKS: 'Food' };
    const result = await categorize('h1', [{ notes: 'Starbucks #123' }], cache);
    expect(result[0].category).toBe('Food');
    expect(fetchAi).not.toHaveBeenCalled();
  });

  it('does NOT permanently cache a merchant as Other when no AI key is configured', async () => {
    // Regression guard: the old self-fetch to /api/chat sent no auth header,
    // 401'd every time, and cached every merchant as 'Other' forever. Now a
    // missing/failed classification is left uncached so the next sync retries.
    vi.mocked(resolveAiKeys).mockResolvedValue({ anthropicKey: undefined, geminiKey: undefined });
    const cache: Record<string, string> = {};
    const result = await categorize('h1', [{ notes: 'Starbucks #123' }], cache);
    expect(result[0].category).toBe('Other'); // falls back for THIS response
    expect(cache).toEqual({}); // but nothing was persisted to the cache
  });

  it('does not cache a result when the model call throws', async () => {
    vi.mocked(fetchAi).mockRejectedValue(new Error('network error'));
    const cache: Record<string, string> = {};
    await categorize('h1', [{ notes: 'Starbucks #123' }], cache);
    expect(cache).toEqual({});
  });

  it('does not cache a result when the model returns unparseable output', async () => {
    vi.mocked(fetchAi).mockResolvedValue({
      text: 'not json at all',
      stopReason: 'end_turn',
      usage: { cacheRead: 0, cacheCreated: 0 },
    });
    const cache: Record<string, string> = {};
    await categorize('h1', [{ notes: 'Starbucks #123' }], cache);
    expect(cache).toEqual({});
  });

  it('falls back to Other for a merchant the model omitted or mis-categorized', async () => {
    vi.mocked(fetchAi).mockResolvedValue({
      text: '{"STARBUCKS": "NotARealCategory"}',
      stopReason: 'end_turn',
      usage: { cacheRead: 0, cacheCreated: 0 },
    });
    const cache: Record<string, string> = {};
    const result = await categorize('h1', [{ notes: 'Starbucks #123' }], cache);
    expect(result[0].category).toBe('Other');
    expect(cache.STARBUCKS).toBe('Other'); // this one IS a real model response, so it's cached
  });
});
