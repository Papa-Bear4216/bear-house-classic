import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbCountRecentRepairs, dbLogHermesRepair, dbUpsertHermesWeeklyFeedback } from './_db.js';

describe('Hermes repair helpers', () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('counts failed rows only for the issue type and time window', async () => {
    const fetchMock = vi.fn(async () => new Response('[]', {
      status: 200,
      headers: { 'content-range': '0-0/7' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(dbCountRecentRepairs('house-1', 'memory_write_failed', 24)).resolves.toBe(7);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('issue_type=eq.memory_write_failed');
    expect(url).toContain('success=eq.false');
    expect(url).toContain('created_at=gte.');
  });

  it('flags the current feedback week on the third failed repair', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200, headers: { 'content-range': '0-0/3' } }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await dbLogHermesRepair('house-1', {
      issueType: 'memory_write_failed',
      detail: 'write failed',
      actionTaken: 'queued for retry',
      success: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toMatchObject({ household_id: 'house-1', flagged_for_review: true });
  });

  it('does not count successful recovery rows toward escalation', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await dbLogHermesRepair('house-1', {
      issueType: 'memory_write_failed', detail: 'recovered', actionTaken: 'retry succeeded', success: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('updates the existing global week instead of inserting a duplicate', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'existing-id' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await dbUpsertHermesWeeklyFeedback(null, {
      repairsMade: 4, repairsFailed: 1, suggestedChanges: [],
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('household_id=is.null');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('PATCH');
    expect(String(fetchMock.mock.calls[1][0])).toContain('id=eq.existing-id');
  });
});
