import { describe, it, expect, beforeEach } from 'vitest';
import {
  getHouseForDate,
  calculateOvernights,
  createCustodySwap,
  respondToCustodySwap,
  loadCustodySchedule,
  saveCustodySchedule,
  loadCustodySwaps,
  saveCustodySwaps,
  formatLocalDateKey,
  DEFAULT_CUSTODY_SCHEDULE,
  type CustodySchedule,
  type CustodySwapRequest,
} from './custody';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  [name: string]: any;
}

const mockLocalStorage = new MemoryStorage();
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
} catch {
  (globalThis as any).localStorage = mockLocalStorage;
}

describe('custody library', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  describe('pattern calculations', () => {
    it('correctly calculates alternating weeks', () => {
      const schedule: CustodySchedule = {
        ...DEFAULT_CUSTODY_SCHEDULE,
        pattern: 'alternating_weeks',
        startDate: '2026-10-05', // Monday
      };

      // Day 0-6 (first week): Primary
      expect(getHouseForDate('2026-10-05', schedule)).toBe('primary');
      expect(getHouseForDate('2026-10-11', schedule)).toBe('primary');

      // Day 7-13 (second week): Secondary
      expect(getHouseForDate('2026-10-12', schedule)).toBe('secondary');
      expect(getHouseForDate('2026-10-18', schedule)).toBe('secondary');

      // Day 14 (third week): Primary again
      expect(getHouseForDate('2026-10-19', schedule)).toBe('primary');
    });

    it('correctly calculates 2-2-3 schedule', () => {
      const schedule: CustodySchedule = {
        ...DEFAULT_CUSTODY_SCHEDULE,
        pattern: '2-2-3',
        startDate: '2026-10-05',
      };

      // Week 1: 2P, 2S, 3P
      expect(getHouseForDate('2026-10-05', schedule)).toBe('primary'); // day 0
      expect(getHouseForDate('2026-10-06', schedule)).toBe('primary'); // day 1
      expect(getHouseForDate('2026-10-07', schedule)).toBe('secondary'); // day 2
      expect(getHouseForDate('2026-10-08', schedule)).toBe('secondary'); // day 3
      expect(getHouseForDate('2026-10-09', schedule)).toBe('primary'); // day 4
      expect(getHouseForDate('2026-10-10', schedule)).toBe('primary'); // day 5
      expect(getHouseForDate('2026-10-11', schedule)).toBe('primary'); // day 6

      // Week 2: 2S, 2P, 3S
      expect(getHouseForDate('2026-10-12', schedule)).toBe('secondary'); // day 7
      expect(getHouseForDate('2026-10-13', schedule)).toBe('secondary'); // day 8
      expect(getHouseForDate('2026-10-14', schedule)).toBe('primary'); // day 9
      expect(getHouseForDate('2026-10-15', schedule)).toBe('primary'); // day 10
      expect(getHouseForDate('2026-10-16', schedule)).toBe('secondary'); // day 11
      expect(getHouseForDate('2026-10-17', schedule)).toBe('secondary'); // day 12
      expect(getHouseForDate('2026-10-18', schedule)).toBe('secondary'); // day 13
    });

    it('correctly calculates 2-2-5-5 schedule', () => {
      const schedule: CustodySchedule = {
        ...DEFAULT_CUSTODY_SCHEDULE,
        pattern: '2-2-5-5',
        startDate: '2026-10-05',
      };

      // 2P, 2S, 5P, 5S
      expect(getHouseForDate('2026-10-05', schedule)).toBe('primary'); // day 0
      expect(getHouseForDate('2026-10-06', schedule)).toBe('primary'); // day 1
      expect(getHouseForDate('2026-10-07', schedule)).toBe('secondary'); // day 2
      expect(getHouseForDate('2026-10-08', schedule)).toBe('secondary'); // day 3
      expect(getHouseForDate('2026-10-09', schedule)).toBe('primary'); // day 4 (start of 5P)
      expect(getHouseForDate('2026-10-13', schedule)).toBe('primary'); // day 8 (end of 5P)
      expect(getHouseForDate('2026-10-14', schedule)).toBe('secondary'); // day 9 (start of 5S)
      expect(getHouseForDate('2026-10-18', schedule)).toBe('secondary'); // day 13 (end of 5S)
      expect(getHouseForDate('2026-10-19', schedule)).toBe('primary'); // day 14 (next cycle)
    });

    it('handles negative date offset (dates before startDate)', () => {
      const schedule: CustodySchedule = {
        ...DEFAULT_CUSTODY_SCHEDULE,
        pattern: 'alternating_weeks',
        startDate: '2026-10-12', // Monday Week 2
      };

      // Exactly 1 day before startDate (2026-10-11) is the last day of week 1 (index 13 = 'S')
      expect(getHouseForDate('2026-10-11', schedule)).toBe('secondary');
      // Exactly 7 days before startDate (2026-10-05) is index 7 = 'S'
      expect(getHouseForDate('2026-10-05', schedule)).toBe('secondary');
      // 8 days before (2026-10-04) is index 6 = 'P'
      expect(getHouseForDate('2026-10-04', schedule)).toBe('primary');
    });

    it('handles invalid anchor date gracefully by falling back to primary without crashing', () => {
      const schedule: CustodySchedule = {
        ...DEFAULT_CUSTODY_SCHEDULE,
        startDate: 'invalid-date',
      };
      expect(getHouseForDate('2026-10-05', schedule)).toBe('primary');
    });
  });

  describe('manual overrides and swap requests', () => {
    it('prioritizes calendar overrides above patterns', () => {
      const schedule: CustodySchedule = {
        ...DEFAULT_CUSTODY_SCHEDULE,
        pattern: 'alternating_weeks',
        startDate: '2026-10-05',
        overrides: {
          '2026-10-05': 'secondary',
        },
      };

      expect(getHouseForDate('2026-10-05', schedule)).toBe('secondary');
      expect(getHouseForDate('2026-10-06', schedule)).toBe('primary');
    });

    it('applies approved swap request correctly with child isolation', () => {
      const schedule: CustodySchedule = {
        ...DEFAULT_CUSTODY_SCHEDULE,
        pattern: 'alternating_weeks',
        startDate: '2026-10-05',
      };

      const swaps: CustodySwapRequest[] = [
        {
          id: 'swap-1',
          childName: 'Emma',
          requesterId: 'user-dad',
          requesterName: 'Dad',
          targetHouse: 'secondary',
          currentDate: '2026-10-06',
          makeupDate: '2026-10-13',
          status: 'approved',
          createdAt: Date.now() - 10000,
          resolvedAt: Date.now() - 5000,
        },
      ];

      // Emma's schedule on 2026-10-06 was primary, but targetHouse is secondary
      expect(getHouseForDate('2026-10-06', schedule, swaps, 'Emma')).toBe('secondary');

      // Leo's schedule on 2026-10-06 is UNTOUCHED (still primary) because swap was isolated to Emma!
      expect(getHouseForDate('2026-10-06', schedule, swaps, 'Leo')).toBe('primary');

      // Emma's makeup date returns to primary (opposite of secondary)
      expect(getHouseForDate('2026-10-13', schedule, swaps, 'Emma')).toBe('primary');

      // Global query without childName only applies whole-family swaps, preserving baseline
      expect(getHouseForDate('2026-10-06', schedule, swaps)).toBe('primary');
    });

    it('ignores pending or declined swaps', () => {
      const schedule: CustodySchedule = {
        ...DEFAULT_CUSTODY_SCHEDULE,
        pattern: 'alternating_weeks',
        startDate: '2026-10-05',
      };

      const swaps: CustodySwapRequest[] = [
        {
          id: 'swap-1',
          childName: 'Emma',
          requesterId: 'user-mom',
          requesterName: 'Mom',
          targetHouse: 'primary',
          currentDate: '2026-10-12',
          status: 'pending',
          createdAt: Date.now(),
        },
      ];

      expect(getHouseForDate('2026-10-12', schedule, swaps, 'Emma')).toBe('secondary');
    });
  });

  describe('swap response authorization and conflict prevention', () => {
    it('blocks requester from approving their own request', () => {
      const res = createCustodySwap({
        childName: 'Emma',
        requesterId: 'user-dad',
        requesterName: 'Dad',
        targetHouse: 'secondary',
        currentDate: '2026-10-20',
      });
      expect(res.ok).toBe(true);
      const swap = res.swap!;

      // Attempt self-approval as Dad
      const attempt = respondToCustodySwap({
        swapId: swap.id,
        decision: 'approved',
        responderId: 'user-dad',
        responderName: 'Dad',
      });

      expect(attempt.ok).toBe(false);
      expect(attempt.error).toContain('cannot approve or decline their own swap');
    });

    it('allows requester to cancel their own pending request', () => {
      const res = createCustodySwap({
        childName: 'Emma',
        requesterId: 'user-dad',
        requesterName: 'Dad',
        targetHouse: 'secondary',
        currentDate: '2026-10-20',
      });
      const swap = res.swap!;

      const cancelRes = respondToCustodySwap({
        swapId: swap.id,
        decision: 'cancelled',
        responderId: 'user-dad',
        responderName: 'Dad',
      });

      expect(cancelRes.ok).toBe(true);
      expect(cancelRes.swap?.status).toBe('cancelled');
    });

    it('allows co-parent to approve request and guards against double response', () => {
      const res = createCustodySwap({
        childName: 'Emma',
        requesterId: 'user-dad',
        requesterName: 'Dad',
        targetHouse: 'secondary',
        currentDate: '2026-10-20',
      });
      const swap = res.swap!;

      // Mom approves
      const response = respondToCustodySwap({
        swapId: swap.id,
        decision: 'approved',
        responderId: 'user-mom',
        responderName: 'Mom',
        responderRole: 'admin',
        responseNote: 'Sounds good',
      });

      expect(response.ok).toBe(true);
      expect(response.swap?.status).toBe('approved');
      expect(response.swap?.responderName).toBe('Mom');

      // Attempt to resolve again fails
      const duplicateAttempt = respondToCustodySwap({
        swapId: swap.id,
        decision: 'declined',
        responderId: 'user-mom',
        responderName: 'Mom',
      });
      expect(duplicateAttempt.ok).toBe(false);
      expect(duplicateAttempt.error).toContain('already approved');
    });

    it('detects and rejects conflicting overlapping swaps for the same child', () => {
      const res1 = createCustodySwap({
        childName: 'Emma',
        requesterId: 'user-dad',
        requesterName: 'Dad',
        targetHouse: 'secondary',
        currentDate: '2026-10-20',
      });
      const res2 = createCustodySwap({
        childName: 'Emma',
        requesterId: 'user-mom',
        requesterName: 'Mom',
        targetHouse: 'primary',
        currentDate: '2026-10-20',
      });

      // Approve swap 1
      respondToCustodySwap({
        swapId: res1.swap!.id,
        decision: 'approved',
        responderId: 'user-mom',
        responderName: 'Mom',
        responderRole: 'admin',
      });

      // Attempt to approve swap 2 for the same date & child
      const conflictAttempt = respondToCustodySwap({
        swapId: res2.swap!.id,
        decision: 'approved',
        responderId: 'user-dad',
        responderName: 'Dad',
        responderRole: 'admin',
      });

      expect(conflictAttempt.ok).toBe(false);
      expect(conflictAttempt.error).toContain('Conflicting swap already approved');
    });
  });

  describe('calculateOvernights', () => {
    it('accurately counts overnights and split percentage over a 14-day cycle', () => {
      const schedule: CustodySchedule = {
        ...DEFAULT_CUSTODY_SCHEDULE,
        pattern: '2-2-3',
        startDate: '2026-10-05',
      };

      const result = calculateOvernights('2026-10-05', '2026-10-18', schedule);
      expect(result.total).toBe(14);
      expect(result.primary).toBe(7);
      expect(result.secondary).toBe(7);
      expect(result.primaryPercent).toBe(50);
      expect(result.secondaryPercent).toBe(50);
    });
  });

  describe('formatLocalDateKey', () => {
    it('formats local Date object into strict YYYY-MM-DD string without UTC shift', () => {
      const date = new Date(2026, 9, 5); // Oct 5, 2026 local
      expect(formatLocalDateKey(date)).toBe('2026-10-05');
    });
  });
});
