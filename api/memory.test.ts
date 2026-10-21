import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  resolveCallerMember: vi.fn(),
  dbGetHouseholdMemory: vi.fn(),
  dbAddHouseholdMemory: vi.fn(),
  dbClearHouseholdMemory: vi.fn(),
  dbGetPendingMemories: vi.fn(),
  dbSetMemoryStatus: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './memory';
import {
  resolveCallerMember,
  dbGetHouseholdMemory,
  dbAddHouseholdMemory,
  dbClearHouseholdMemory,
  dbGetPendingMemories,
  dbSetMemoryStatus,
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
  vi.mocked(resolveCallerMember).mockResolvedValue({ householdId: 'household-123', memberId: 'member-1', role: 'admin', canControlDevices: true });
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

const setAdmin = () => vi.mocked(resolveCallerMember).mockResolvedValue({ householdId: 'household-123', memberId: 'member-1', role: 'admin', canControlDevices: true });

describe('GET /api/memory', () => {
  it('rejects with 401 when there is no authorization header', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req('GET', undefined, ''));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when token is invalid or does not map to household', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue(null);
    const res = await handler(req('GET', undefined, 'Bearer bad-token'));
    expect(res.status).toBe(401);
  });

  it('rejects with 429 when rate limit is exceeded', async () => {
    setAdmin();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 15 });
    const res = await handler(req('GET'));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain('15s');
  });

  it('returns notes array with 200 on success', async () => {
    setAdmin();
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
    setAdmin();
    vi.mocked(dbGetHouseholdMemory).mockRejectedValue(new Error('DB failure'));

    const res = await handler(req('GET'));
    expect(res.status).toBe(500);
  });

  it('does not expose household memory to child or pet accounts', async () => {
    vi.mocked(resolveCallerMember).mockResolvedValue({ householdId: 'household-123', memberId: '00000000-0000-4000-8000-000000000002', role: 'child', canControlDevices: false });
    const res = await handler(req('GET'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: [] });
    expect(dbGetHouseholdMemory).not.toHaveBeenCalled();
  });
});

describe('POST /api/memory', () => {
  it('rejects with 400 when body is invalid', async () => {
    setAdmin();
    const res = await handler(req('POST', { action: 'unknown_action' }));
    expect(res.status).toBe(400);
  });

  it('rejects with 400 when action is add but text is missing', async () => {
    setAdmin();
    const res = await handler(req('POST', { action: 'add' }));
    expect(res.status).toBe(400);
  });

  it('adds a memory note and returns 200', async () => {
    setAdmin();
    vi.mocked(dbAddHouseholdMemory).mockResolvedValue('inserted');

    const res = await handler(req('POST', { action: 'add', text: 'Filter is 20x25x1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, result: 'inserted', status: 'active' });
    expect(dbAddHouseholdMemory).toHaveBeenCalledWith('household-123', 'Filter is 20x25x1', {
      source: 'manual', memberId: 'member-1', subjectMemberId: undefined, kind: 'fact', importance: undefined, status: 'active',
    });
  });

  it('queues inferred patterns for review', async () => {
    setAdmin();
    vi.mocked(dbAddHouseholdMemory).mockResolvedValue('inserted');
    const res = await handler(req('POST', { action: 'add', text: 'Lucy often prefers quiet activities', kind: 'pattern', subjectMemberId: '00000000-0000-4000-8000-000000000003', inferred: true }));
    expect(res.status).toBe(200);
    expect(dbAddHouseholdMemory).toHaveBeenCalledWith('household-123', 'Lucy often prefers quiet activities', expect.objectContaining({
      memberId: 'member-1', subjectMemberId: '00000000-0000-4000-8000-000000000003', kind: 'pattern', status: 'pending_review',
    }));
  });

  it('lists and updates pending notes only inside the caller household', async () => {
    setAdmin();
    vi.mocked(dbGetPendingMemories).mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000004', text: 'Pattern', status: 'pending_review' }] as any);
    const listRes = await handler(req('POST', { action: 'listPending' }));
    expect(listRes.status).toBe(200);
    expect(dbGetPendingMemories).toHaveBeenCalledWith('household-123');
    vi.mocked(dbSetMemoryStatus).mockResolvedValue(undefined);
    const updateRes = await handler(req('POST', { action: 'setStatus', id: '00000000-0000-4000-8000-000000000004', status: 'active' }));
    expect(updateRes.status).toBe(200);
    expect(dbSetMemoryStatus).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000004', 'household-123', 'active');
  });

  it('clears memory notes and returns 200 when action is clear', async () => {
    setAdmin();
    vi.mocked(dbClearHouseholdMemory).mockResolvedValue(undefined);

    const res = await handler(req('POST', { action: 'clear' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(dbClearHouseholdMemory).toHaveBeenCalledWith('household-123');
  });

  it('returns 500 when adding memory note throws an error', async () => {
    setAdmin();
    vi.mocked(dbAddHouseholdMemory).mockRejectedValue(new Error('Insert error'));

    const res = await handler(req('POST', { action: 'add', text: 'Test text' }));
    expect(res.status).toBe(500);
  });
});

describe('Other methods on /api/memory', () => {
  it('rejects PUT/DELETE with 405 Method not allowed', async () => {
    setAdmin();
    const res = await handler(req('DELETE'));
    expect(res.status).toBe(405);
  });
});
