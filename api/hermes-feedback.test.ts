import { beforeEach, describe, expect, it, vi } from 'vitest';

const allHouseholdIds = vi.fn();
const dbArchiveExpiredMemory = vi.fn();
const dbGetHermesRepairSummary = vi.fn();
const dbLogHermesRepair = vi.fn();
const dbUpsertHermesWeeklyFeedback = vi.fn();
vi.mock('./_db.js', () => ({
  allHouseholdIds: (...args: unknown[]) => allHouseholdIds(...args),
  dbArchiveExpiredMemory: (...args: unknown[]) => dbArchiveExpiredMemory(...args),
  dbGetHermesRepairSummary: (...args: unknown[]) => dbGetHermesRepairSummary(...args),
  dbLogHermesRepair: (...args: unknown[]) => dbLogHermesRepair(...args),
  dbUpsertHermesWeeklyFeedback: (...args: unknown[]) => dbUpsertHermesWeeklyFeedback(...args),
}));

import handler from './hermes-feedback';

const request = (method = 'GET', secret = 'cron-secret') => new Request('https://example.test/api/hermes-feedback', {
  method, headers: { authorization: `Bearer ${secret}` },
});

describe('hermes-feedback weekly endpoint', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    vi.resetAllMocks();
    allHouseholdIds.mockResolvedValue(['house-1', 'house-2']);
    dbArchiveExpiredMemory.mockResolvedValue(0);
    dbGetHermesRepairSummary.mockResolvedValue({ repairsMade: 2, repairsFailed: 1, byType: { tool_degraded: { made: 2, failed: 1 } } });
    dbLogHermesRepair.mockResolvedValue(undefined);
    dbUpsertHermesWeeklyFeedback.mockResolvedValue(undefined);
  });

  it('rejects callers without the cron secret', async () => {
    const res = await handler(request('GET', 'wrong'));
    expect(res.status).toBe(401);
  });

  it('rolls up every household and upserts a global developer-only summary', async () => {
    dbArchiveExpiredMemory.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const res = await handler(request('POST'));
    expect(res.status).toBe(200);
    expect(allHouseholdIds).toHaveBeenCalledOnce();
    expect(dbGetHermesRepairSummary).toHaveBeenCalledTimes(2);
    expect(dbLogHermesRepair).toHaveBeenCalledWith('house-1', expect.objectContaining({ issueType: 'memory_expired', success: true }));
    expect(dbUpsertHermesWeeklyFeedback).toHaveBeenCalledTimes(3);
    expect(dbUpsertHermesWeeklyFeedback).toHaveBeenLastCalledWith(null, expect.objectContaining({
      repairsMade: 4,
      repairsFailed: 2,
      suggestedChanges: [expect.objectContaining({ issueType: 'tool_degraded', failures: 2 })],
    }));
    expect(await res.json()).toMatchObject({ households: 2, repairsMade: 4, repairsFailed: 2, expiredArchived: 2 });
  });
});
