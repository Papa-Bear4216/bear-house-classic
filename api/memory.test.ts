import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveHouseholdId: vi.fn(),
  dbGetHouseholdMemory: vi.fn(),
  dbAddHouseholdMemory: vi.fn(),
  dbClearHouseholdMemory: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './memory';
import {
  resolveHouseholdId,
  dbGetHouseholdMemory,
  dbAddHouseholdMemory,
  dbClearHouseholdMemory,
} from './_db.js';
import { checkRateLimit } from './_rateLimit.js';

function req(method = 'GET', body?: unknown, auth = 'Bearer valid-token') {
  const init: RequestInit = {
    method,
    headers: {
      authorization: auth,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  return new Request('https://example.com/api/memory', init);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe('GET /api/memory', () => {
  it('rejects with 401 when there is no authorization header', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req('GET', undefined, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when token is invalid or does not map to household', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue(null);
    const res = await handler(req('GET', undefined, 'Bearer bad-token'));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limit is exceeded', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-123');
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 15 });
    const res = await handler(req('GET'));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('15s');
  });

  it('returns notes array with 200 on success', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-123');
    const mockNotes = [
      { id: '1', text: 'Trash goes out on Tuesday', source: 'manual', created_at: '2026-09-01T00:00:00Z' },
    ];
    vi.mocked(dbGetHouseholdMemory).mockResolvedValue(mockNotes);

    const res = await handler(req('GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ notes: mockNotes });
    expect(dbGetHouseholdMemory).toHaveBeenCalledWith('household-123');
  });

  it('returns 500 when db query throws', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-123');
    vi.mocked(dbGetHouseholdMemory).mockRejectedValue(new Error('DB failure'));

    const res = await handler(req('GET'));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/memory', () => {
  it('rejects with 400 when body is invalid', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-123');
    const res = await handler(req('POST', { action: 'unknown_action' }));
    expect(res.status).toBe(400);
  });

  it('rejects with 400 when action is add but text is missing', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-123');
    const res = await handler(req('POST', { action: 'add' }));
    expect(res.status).toBe(400);
  });

  it('adds a memory note and returns 200', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-123');
    vi.mocked(dbAddHouseholdMemory).mockResolvedValue(undefined);

    const res = await handler(req('POST', { action: 'add', text: 'Filter is 20x25x1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(dbAddHouseholdMemory).toHaveBeenCalledWith('household-123', 'Filter is 20x25x1', 'auto');
  });

  it('clears memory notes and returns 200 when action is clear', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-123');
    vi.mocked(dbClearHouseholdMemory).mockResolvedValue(undefined);

    const res = await handler(req('POST', { action: 'clear' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(dbClearHouseholdMemory).toHaveBeenCalledWith('household-123');
  });

  it('returns 500 when adding memory note throws an error', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-123');
    vi.mocked(dbAddHouseholdMemory).mockRejectedValue(new Error('Insert error'));

    const res = await handler(req('POST', { action: 'add', text: 'Test text' }));
    expect(res.status).toBe(500);
  });
});

describe('Other methods on /api/memory', () => {
  it('rejects PUT/DELETE with 405 Method not allowed', async () => {
    vi.mocked(resolveHouseholdId).mockResolvedValue('household-123');
    const res = await handler(req('DELETE'));
    expect(res.status).toBe(405);
  });
});
