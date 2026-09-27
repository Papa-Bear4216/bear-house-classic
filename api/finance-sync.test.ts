import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  allHouseholdIds: vi.fn(),
  dbGetHouseholdMembersByHouseholdId: vi.fn(),
}));
vi.mock('./daily-brain.js', () => ({ runDailyBrainChecks: vi.fn() }));
vi.mock('./_notify.js', () => ({ notifyPush: vi.fn() }));
vi.mock('./_financeCore.js', () => ({ syncMemberFinance: vi.fn() }));

import handler from './finance-sync';
import { allHouseholdIds, dbGetHouseholdMembersByHouseholdId } from './_db.js';
import { runDailyBrainChecks } from './daily-brain.js';
import { notifyPush } from './_notify.js';
import { syncMemberFinance } from './_financeCore.js';

function req(auth = 'Bearer test-cron-secret', method = 'GET') {
  return new Request('https://example.com/api/finance-sync', {
    method,
    headers: { authorization: auth },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = 'test-cron-secret';
  vi.mocked(allHouseholdIds).mockResolvedValue([]);
  vi.mocked(runDailyBrainChecks).mockResolvedValue({
    shoppingAdded: [], tasksAdded: [], carMaintenanceAdded: [], gmailTasksAdded: [],
  } as any);
});

describe('GET /api/finance-sync', () => {
  it('rejects with 401 when there is no bearer token', async () => {
    const res = await handler(req(''));
    expect(res.status).toBe(401);
    expect(vi.mocked(allHouseholdIds)).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the token does not match CRON_SECRET', async () => {
    const res = await handler(req('Bearer wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const res = await handler(req());
    expect(res.status).toBe(401);
  });

  it('rejects with 405 for a non-GET method', async () => {
    const res = await handler(req('Bearer test-cron-secret', 'POST'));
    expect(res.status).toBe(405);
  });

  it('fans out over every household with no linked accounts and returns a message', async () => {
    vi.mocked(allHouseholdIds).mockResolvedValue(['h1']);
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([]);

    const res = await handler(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.households).toHaveLength(1);
    expect(body.households[0].message).toBe('No linked accounts');
    expect(notifyPush).not.toHaveBeenCalled();
  });

  it('sends a daily summary push when the daily brain found something', async () => {
    vi.mocked(allHouseholdIds).mockResolvedValue(['h1']);
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([]);
    vi.mocked(runDailyBrainChecks).mockResolvedValue({
      shoppingAdded: ['milk'], tasksAdded: [], carMaintenanceAdded: [], gmailTasksAdded: [],
    } as any);

    const res = await handler(req());
    expect(res.status).toBe(200);
    expect(notifyPush).toHaveBeenCalledWith('h1', expect.stringContaining('1 thing'), expect.stringContaining('shopping list'));
  });

  it('syncs each member with a linked account', async () => {
    vi.mocked(allHouseholdIds).mockResolvedValue(['h1']);
    vi.mocked(dbGetHouseholdMembersByHouseholdId).mockResolvedValue([{ id: 'm1' } as any]);
    vi.mocked(syncMemberFinance).mockResolvedValue({ accounts: 1, synced: 2, subscriptions: 0 } as any);

    const res = await handler(req());
    const body = await res.json();
    expect(body.households[0].synced).toBe(2);
    expect(syncMemberFinance).toHaveBeenCalledWith(expect.any(String), 'h1', 'm1', 30);
  });
});
