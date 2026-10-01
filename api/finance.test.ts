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
    const liveConn = { accessUrl: 'https://beta-bridge.simplefin.org/access/live', institutions: [], person: 'Alice', connectedAt: 1 };

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
    const liveConn = { accessUrl: 'https://beta-bridge.simplefin.org/access/live', institutions: [], person: 'Alice', connectedAt: 1 };
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
    const oldConn = { accessUrl: 'https://beta-bridge.simplefin.org/access/old', institutions: [], person: 'Alice', connectedAt: 1 };
    const newConn = { accessUrl: 'https://beta-bridge.simplefin.org/access/new', institutions: [], person: 'Alice', connectedAt: 2 };
    vi.mocked(dbGet)
      .mockResolvedValueOnce(oldConn)
      .mockResolvedValueOnce(newConn); // reconnected with a different accessUrl in between
    vi.mocked(fetchAccounts).mockResolvedValue([{ id: 'acc-old', org: { name: 'Old Bank' }, name: 'Old Bank' } as any]);

    await handler(req({ action: 'accounts' }));
    expect(dbSet).not.toHaveBeenCalled();
  });
});

describe('POST /api/finance — recategorize', () => {
  it('rejects an invalid category with 400', async () => {
    const res = await handler(req({
      action: 'recategorize',
      merchant: 'Starbucks',
      category: 'FakeCategory',
    }));
    expect(res.status).toBe(400);
  });

  it('updates merchant category cache and matching unreviewed simplefin expenses', async () => {
    vi.mocked(dbGet).mockImplementation(async (key: string) => {
      if (key === 'merchant_category_cache_m1') {
        return { TARGET: 'Food' };
      }
      if (key === 'familyos_expenses_m1') {
        return [
          { id: 'tx-1', notes: 'STARBUCKS #1234', category: 'Other', needsReview: true, reviewed: false, source: 'simplefin' },
          { id: 'tx-2', notes: 'STARBUCKS #5678', category: 'Other', needsReview: true, reviewed: false, source: 'simplefin' },
          // Manual entry for Starbucks - must NOT be overwritten
          { id: 'tx-manual', notes: 'STARBUCKS #9999', category: 'Entertainment', needsReview: false, reviewed: false, source: 'manual' },
          // Already reviewed entry with specific category - must NOT be overwritten
          { id: 'tx-reviewed', notes: 'STARBUCKS #0000', category: 'Entertainment', needsReview: false, reviewed: true, source: 'simplefin' },
          { id: 'tx-3', notes: 'TARGET STORE', category: 'Food', needsReview: false, reviewed: true, source: 'simplefin' },
        ];
      }
      return null;
    });

    const res = await handler(req({
      action: 'recategorize',
      merchant: 'STARBUCKS #1234',
      category: 'Food',
      transactionId: 'tx-1',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.updatedCount).toBe(2);
    expect(body.updatedIds).toEqual(['tx-1', 'tx-2']);

    // Verifies cache was updated
    expect(dbSet).toHaveBeenCalledWith(
      'merchant_category_cache_m1',
      'h1',
      { TARGET: 'Food', STARBUCKS: 'Food' },
      'm1'
    );

    // Verifies matching expenses were updated and marked reviewed without stomping manual or already-reviewed rows
    expect(dbSet).toHaveBeenCalledWith(
      'familyos_expenses_m1',
      'h1',
      [
        expect.objectContaining({ id: 'tx-1', category: 'Food', reviewed: true, needsReview: false }),
        expect.objectContaining({ id: 'tx-2', category: 'Food', reviewed: true, needsReview: false }),
        expect.objectContaining({ id: 'tx-manual', category: 'Entertainment', source: 'manual' }),
        expect.objectContaining({ id: 'tx-reviewed', category: 'Entertainment', reviewed: true }),
        expect.objectContaining({ id: 'tx-3', category: 'Food' }),
      ],
      'm1'
    );
  });

  it('does NOT poison cache when recategorizing to Other', async () => {
    vi.mocked(dbGet).mockImplementation(async (key: string) => {
      if (key === 'merchant_category_cache_m1') return { SAFE_MERCHANT: 'Food' };
      if (key === 'familyos_expenses_m1') {
        return [{ id: 'tx-1', notes: 'MYSTERY VENDOR', category: 'Other', needsReview: true, reviewed: false, source: 'simplefin' }];
      }
      return null;
    });

    const res = await handler(req({
      action: 'recategorize',
      merchant: 'MYSTERY VENDOR',
      category: 'Other',
      transactionId: 'tx-1',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.updatedCount).toBe(1);

    // Cache write should NOT be called for 'Other'
    expect(dbSet).not.toHaveBeenCalledWith(
      'merchant_category_cache_m1',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('supports batch recategorization in a single operation', async () => {
    vi.mocked(dbGet).mockImplementation(async (key: string) => {
      if (key === 'merchant_category_cache_m1') return {};
      if (key === 'familyos_expenses_m1') {
        return [
          { id: 'tx-1', notes: 'SHELL OIL #10', category: 'Other', needsReview: true, reviewed: false, source: 'simplefin' },
          { id: 'tx-2', notes: 'KROGER #20', category: 'Other', needsReview: true, reviewed: false, source: 'simplefin' },
        ];
      }
      return null;
    });

    const res = await handler(req({
      action: 'recategorize',
      items: [
        { merchant: 'SHELL OIL', category: 'Transportation', transactionId: 'tx-1' },
        { merchant: 'KROGER', category: 'Food', transactionId: 'tx-2' },
      ],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.updatedCount).toBe(2);
    expect(body.updatedIds).toEqual(['tx-1', 'tx-2']);

    expect(dbSet).toHaveBeenCalledWith(
      'merchant_category_cache_m1',
      'h1',
      { 'SHELL OIL': 'Transportation', KROGER: 'Food' },
      'm1'
    );
  });

  it('prioritizes exact transactionId match over same-merchant match in batch updates', async () => {
    vi.mocked(dbGet).mockImplementation(async (key: string) => {
      if (key === 'merchant_category_cache_m1') return {};
      if (key === 'familyos_expenses_m1') {
        return [
          { id: 'tx-A', notes: 'STARBUCKS #1', category: 'Other', needsReview: true, reviewed: false, source: 'simplefin' },
          { id: 'tx-B', notes: 'STARBUCKS #2', category: 'Other', needsReview: true, reviewed: false, source: 'simplefin' },
        ];
      }
      return null;
    });

    const res = await handler(req({
      action: 'recategorize',
      items: [
        { merchant: 'STARBUCKS', category: 'Food', transactionId: 'tx-A' },
        { merchant: 'STARBUCKS', category: 'Entertainment', transactionId: 'tx-B' },
      ],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.updatedCount).toBe(2);

    expect(dbSet).toHaveBeenCalledWith(
      'familyos_expenses_m1',
      'h1',
      [
        expect.objectContaining({ id: 'tx-A', category: 'Food', reviewed: true }),
        expect.objectContaining({ id: 'tx-B', category: 'Entertainment', reviewed: true }),
      ],
      'm1'
    );
  });
});

