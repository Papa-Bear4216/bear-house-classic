import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
  resolveHouseholdId: vi.fn(),
}));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));

import handler from './classroom';
import { dbGet, dbSet, resolveHouseholdId } from './_db.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/classroom', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockGoogleClassroom(fetchMock: ReturnType<typeof vi.fn>, assignmentId: string, courseId = 'c1') {
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => ({ courses: [{ id: courseId, name: 'Math' }] }) } as Response)
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ courseWork: [{ id: assignmentId, title: 'Worksheet 1', courseId, dueDate: null }] }),
    } as Response);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.mocked(resolveHouseholdId).mockResolvedValue('h1');
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(dbGet).mockResolvedValue([]);
});

describe('POST /api/classroom', () => {
  it('creates separate tasks for two different students syncing the same assignment', async () => {
    // Regression guard: two household members enrolled in the same course
    // must each get their own task for the same courseWork id, not have
    // the second sync reassign or skip the first student's task.
    const fetchMock = vi.mocked(fetch);
    mockGoogleClassroom(fetchMock, 'assignment-1');
    const resAlice = await handler(req({ accessToken: 'tok-a', person: 'Alice' }));
    expect(resAlice.status).toBe(200);
    const afterAlice = vi.mocked(dbSet).mock.calls[0][2] as any[];
    expect(afterAlice).toHaveLength(1);
    expect(afterAlice[0].person).toBe('Alice');

    // Second sync (Bob) sees Alice's task already in the "existing tasks" store.
    vi.mocked(dbGet).mockResolvedValue(afterAlice);
    mockGoogleClassroom(fetchMock, 'assignment-1');
    const resBob = await handler(req({ accessToken: 'tok-b', person: 'Bob' }));
    expect(resBob.status).toBe(200);

    const afterBob = vi.mocked(dbSet).mock.calls[1][2] as any[];
    expect(afterBob).toHaveLength(2);
    expect(afterBob.some(t => t.person === 'Alice' && t.gcClassroomId === 'assignment-1')).toBe(true);
    expect(afterBob.some(t => t.person === 'Bob' && t.gcClassroomId === 'assignment-1')).toBe(true);
  });

  it('does not let one student\'s completed assignment block the other\'s task creation', async () => {
    vi.mocked(dbGet).mockResolvedValue([
      { id: 't1', gcClassroomId: 'assignment-1', person: 'Alice', completed: true },
    ]);
    const fetchMock = vi.mocked(fetch);
    mockGoogleClassroom(fetchMock, 'assignment-1');

    const res = await handler(req({ accessToken: 'tok-b', person: 'Bob' }));
    expect(res.status).toBe(200);
    const written = vi.mocked(dbSet).mock.calls[0][2] as any[];
    expect(written.some(t => t.person === 'Bob' && t.gcClassroomId === 'assignment-1')).toBe(true);
    // Alice's completed task is untouched.
    expect(written.find(t => t.person === 'Alice')?.completed).toBe(true);
  });

  it('updates the same student\'s existing task instead of duplicating it', async () => {
    vi.mocked(dbGet).mockResolvedValue([
      { id: 't1', gcClassroomId: 'assignment-1', person: 'Alice', completed: false, text: '[Math] Old title' },
    ]);
    const fetchMock = vi.mocked(fetch);
    mockGoogleClassroom(fetchMock, 'assignment-1');

    const res = await handler(req({ accessToken: 'tok-a', person: 'Alice' }));
    expect(res.status).toBe(200);
    const written = vi.mocked(dbSet).mock.calls[0][2] as any[];
    expect(written).toHaveLength(1);
    expect(written[0].id).toBe('t1');
    expect(written[0].text).toBe('[Math] Worksheet 1');
  });
});
