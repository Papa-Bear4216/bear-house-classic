import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./_db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
  resolveCallerMember: vi.fn(),
  resolveHouseholdIdByWebhookToken: vi.fn(),
  dbGetHouseholdMembersByHouseholdId: vi.fn(),
}));
vi.mock('./_simplefin.js', () => ({ claimAccessUrl: vi.fn(), fetchAccounts: vi.fn() }));
vi.mock('./_rateLimit.js', () => ({ checkRateLimit: vi.fn() }));
vi.mock('./_financeCore.js', () => ({ syncMemberFinance: vi.fn() }));

import handler from './finance';
import { dbGet, dbSet, resolveCallerMember } from './_db.js';
import { fetchAccounts } from './_simplefin.js';
import { checkRateLimit } from './_rateLimit.js';

function req(body: unknown, auth = 'Bearer valid-token') {
  return new Request('https://example.com/api/finance', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(resolveCallerMember).mockResolvedValue({ householdId: 'h1', memberId: 'm1', role: 'admin', canControlDevices: false } as any);
});

describe('POST /api/finance — accounts (institution probe)', () => {
  it('does not resurrect a connection that was disconnected while fetchAccounts was in flight', async () => {
    // Regression guard: the first dbGet reads the live connection; a
    // disconnect (dbSet {}) lands on the same key while fetchAccounts is
    // still awaiting; the re-check before writing must see the cleared
    // connection and skip the write, instead of resurrecting the old
    // accessUrl.
    const liveConn = { accessUrl: 'https://simplefin.example/access/live', institutions: [], person: 'Alice', connectedAt: 1 };
    vi.mocked(dbGet)
      .mockResolvedValueOnce(liveConn) // initial read
      .mockResolvedValueOnce({}); // re-check right before write — disconnected in between
    vi.mocked(fetchAccounts).mockResolvedValue([{ id: 'acc-1', org: { name: 'Bank' }, name: 'Bank' } as any]);

    const res = await handler(req({ action: 'accounts' }));
    expect(res.status).toBe(200);

    // The response still reflects what was probed (best-effort for this one
    // request), but nothing was persisted back to the now-cleared connection.
    expect(dbSet).not.toHaveBeenCalled();
  });

  it('writes the probed institutions back when the connection is unchanged', async () => {
    const liveConn = { accessUrl: 'https://simplefin.example/access/live', institutions: [], person: 'Alice', connectedAt: 1 };
    vi.mocked(dbGet)
      .mockResolvedValueOnce(liveConn)
      .mockResolvedValueOnce(liveConn); // unchanged on re-check
    vi.mocked(fetchAccounts).mockResolvedValue([{ id: 'acc-1', org: { name: 'Bank' }, name: 'Bank' } as any]);

    const res = await handler(req({ action: 'accounts' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0].institutionName).toBe('Bank');

    expect(dbSet).toHaveBeenCalledWith(
      'simplefin_access_m1', 'h1',
      expect.objectContaining({ institutions: [{ id: 'acc-1', name: 'Bank' }] }),
      'm1'
    );
  });

  it('does not overwrite when the connection was reconnected (different accessUrl) while probing', async () => {
    const oldConn = { accessUrl: 'https://simplefin.example/access/old', institutions: [], person: 'Alice', connectedAt: 1 };
    const newConn = { accessUrl: 'https://simplefin.example/access/new', institutions: [], person: 'Alice', connectedAt: 2 };
    vi.mocked(dbGet)
      .mockResolvedValueOnce(oldConn)
      .mockResolvedValueOnce(newConn); // reconnected with a different accessUrl in between
    vi.mocked(fetchAccounts).mockResolvedValue([{ id: 'acc-old', org: { name: 'Old Bank' }, name: 'Old Bank' } as any]);

    await handler(req({ action: 'accounts' }));
    expect(dbSet).not.toHaveBeenCalled();
  });
});
