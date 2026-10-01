import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./householdAuth', () => ({
  authedFetch: vi.fn(),
}));

import {
  normalizeMerchantName,
  isUncertainTransaction,
  filterUncertainTransactions,
  recategorizeTransaction,
  recategorizeBatchTransactions,
  CATEGORIES,
} from './transactionReview';
import { authedFetch } from './householdAuth';

describe('transactionReview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('normalizeMerchantName', () => {
    it('normalizes merchant names and strips noise identically to backend', () => {
      expect(normalizeMerchantName('WAL-MART #1234 BENTONVILLE AR')).toBe('WAL MART BENTONVILLE AR');
      expect(normalizeMerchantName('NETFLIX.COM PAYMENT 98765')).toBe('NETFLIX');
      expect(normalizeMerchantName('TRADER JOE\'S #543 POS PURCHASE')).toBe('TRADER JOE S');
      expect(normalizeMerchantName('SPOTIFY USA LLC DEBIT AUTOPAY')).toBe('SPOTIFY USA');
    });

    it('matches backend normalizeMerchant output exactly across diverse merchant strings', async () => {
      const { normalizeMerchant } = await import('../../api/_subscriptions');
      const testCases = [
        'WAL-MART #1234 BENTONVILLE AR',
        'NETFLIX.COM PAYMENT 98765',
        'TRADER JOE\'S #543 POS PURCHASE',
        'SPOTIFY USA LLC DEBIT AUTOPAY',
        'TARGET INC 4432',
        'CHEVRON 00234123 DEBIT',
        'APPLE.COM/BILL 800-275-2273',
        'WHOLEFDS 10243 AUSTIN TX',
        'UBER *TRIP 12345 HELP.UBER.COM',
        'SQ *LOCAL COFFEE SHOP',
        'AMZN Mktp US*2A4B6C8D',
        'SHELL OIL 12344555 HOUSTON',
        'COSTCO WHSE #0124',
        'HOMEDEPOT.COM #999',
        '',
        '   ',
      ];
      for (const tc of testCases) {
        expect(normalizeMerchantName(tc)).toBe(normalizeMerchant(tc));
      }
    });

    it('handles empty or edge inputs gracefully', () => {
      expect(normalizeMerchantName('')).toBe('');
      expect(normalizeMerchantName('   ')).toBe('');
      expect(normalizeMerchantName(null as any)).toBe('');
      expect(normalizeMerchantName(undefined as any)).toBe('');
    });
  });

  describe('isUncertainTransaction', () => {
    it('returns false if transaction is already marked reviewed', () => {
      expect(isUncertainTransaction({ source: 'simplefin', category: 'Other', reviewed: true, needsReview: true })).toBe(false);
      expect(isUncertainTransaction({ source: 'simplefin', category: 'Food', reviewed: true })).toBe(false);
    });

    it('returns true if needsReview is explicitly true regardless of source', () => {
      expect(isUncertainTransaction({ source: 'manual', category: 'Food', needsReview: true, reviewed: false })).toBe(true);
      expect(isUncertainTransaction({ source: 'simplefin', category: 'Utilities', needsReview: true })).toBe(true);
    });

    it('returns true for simplefin (bank-synced) transactions when category is Other, uncategorized, or missing', () => {
      expect(isUncertainTransaction({ source: 'simplefin', category: 'Other' })).toBe(true);
      expect(isUncertainTransaction({ source: 'simplefin', category: 'other' })).toBe(true);
      expect(isUncertainTransaction({ source: 'simplefin', category: 'uncategorized' })).toBe(true);
      expect(isUncertainTransaction({ source: 'simplefin', category: '' })).toBe(true);
      expect(isUncertainTransaction({ source: 'simplefin' })).toBe(true);
    });

    it('does NOT flag manual transactions as uncertain when category is Other without needsReview flag', () => {
      // Manual transactions chosen by parent should not flood review queue
      expect(isUncertainTransaction({ source: 'manual', category: 'Other' })).toBe(false);
      expect(isUncertainTransaction({ source: 'manual', category: 'Food' })).toBe(false);
    });

    it('returns false for confident, non-Other simplefin categories when needsReview is not true', () => {
      expect(isUncertainTransaction({ source: 'simplefin', category: 'Food', needsReview: false })).toBe(false);
      expect(isUncertainTransaction({ source: 'simplefin', category: 'Housing' })).toBe(false);
    });
  });

  describe('filterUncertainTransactions', () => {
    it('filters out deleted transactions and non-uncertain transactions', () => {
      const expenses = [
        { id: '1', notes: 'Starbucks', category: 'Other', amount: 5.5, source: 'simplefin' },
        { id: '2', notes: 'Target', category: 'Food', amount: 45.0, needsReview: true, source: 'simplefin' },
        { id: '3', notes: 'Kroger', category: 'Food', amount: 80.0, reviewed: true, source: 'simplefin' },
        { id: '4', notes: 'Electric Bill', category: 'Utilities', amount: 120.0, source: 'simplefin' },
        { id: '5', notes: 'Unknown', category: 'Other', amount: 15.0, deletedAt: 123456789, source: 'simplefin' },
        { id: '6', notes: 'Manual Misc', category: 'Other', amount: 20.0, source: 'manual' }, // manual Other -> ignored
      ];

      const uncertain = filterUncertainTransactions(expenses);
      expect(uncertain).toHaveLength(2);
      expect(uncertain.map((e) => e.id)).toEqual(['1', '2']);
    });
  });

  describe('recategorizeTransaction & recategorizeBatchTransactions', () => {
    it('sends recategorize request to /api/finance with items payload', async () => {
      vi.mocked(authedFetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, updatedCount: 3, updatedIds: ['tx-1', 'tx-2', 'tx-3'] }),
      } as any);

      const res = await recategorizeTransaction({
        merchant: 'Starbucks #1234',
        category: 'Food',
        transactionId: 'txn-1',
      });

      expect(authedFetch).toHaveBeenCalledWith('/api/finance', {
        method: 'POST',
        body: JSON.stringify({
          action: 'recategorize',
          items: [{
            merchant: 'Starbucks #1234',
            category: 'Food',
            transactionId: 'txn-1',
          }],
        }),
      });
      expect(res.ok).toBe(true);
      expect(res.updatedCount).toBe(3);
      expect(res.updatedIds).toEqual(['tx-1', 'tx-2', 'tx-3']);
    });

    it('sends batch recategorization in a single network call', async () => {
      vi.mocked(authedFetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, updatedCount: 2, updatedIds: ['tx-1', 'tx-2'] }),
      } as any);

      const res = await recategorizeBatchTransactions([
        { merchant: 'Shell', category: 'Transportation', transactionId: 'tx-1' },
        { merchant: 'Kroger', category: 'Food', transactionId: 'tx-2' },
      ]);

      expect(authedFetch).toHaveBeenCalledWith('/api/finance', {
        method: 'POST',
        body: JSON.stringify({
          action: 'recategorize',
          items: [
            { merchant: 'Shell', category: 'Transportation', transactionId: 'tx-1' },
            { merchant: 'Kroger', category: 'Food', transactionId: 'tx-2' },
          ],
        }),
      });
      expect(res.ok).toBe(true);
      expect(res.updatedCount).toBe(2);
    });

    it('returns error when server responds with failure', async () => {
      vi.mocked(authedFetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid category' }),
      } as any);

      const res = await recategorizeTransaction({
        merchant: 'Starbucks',
        category: 'InvalidCat',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe('Invalid category');
    });

    it('handles network throw gracefully', async () => {
      vi.mocked(authedFetch).mockRejectedValueOnce(new Error('Connection timed out'));

      const res = await recategorizeTransaction({
        merchant: 'Target',
        category: 'Clothing',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe('Connection timed out');
    });

    it('returns empty result immediately when items array is empty', async () => {
      const res = await recategorizeBatchTransactions([]);
      expect(res.ok).toBe(true);
      expect(res.updatedCount).toBe(0);
      expect(authedFetch).not.toHaveBeenCalled();
    });
  });

  describe('CATEGORIES', () => {
    it('contains all 12 standard household budget categories', () => {
      expect(CATEGORIES).toHaveLength(12);
      expect(CATEGORIES).toContain('Food');
      expect(CATEGORIES).toContain('Kids');
      expect(CATEGORIES).toContain('Other');
    });
  });
});
