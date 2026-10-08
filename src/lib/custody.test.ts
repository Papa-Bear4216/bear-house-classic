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
  getCustodyDayDetails,
  DEFAULT_NON_TRADITIONAL_CONFIG,
  type CustodySchedule,
  type CustodySwapRequest,
  type CustomCustodyConfig,
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

  describe('non-traditional split-day & custom custody schedule', () => {
    const nonTraditionalSchedule: CustodySchedule = {
      ...DEFAULT_CUSTODY_SCHEDULE,
      pattern: 'split_day_alternating_weekends',
      startDate: '2026-10-05', // Monday
      primaryParentName: 'Mom',
      secondaryParentName: 'Dad',
      primaryHouseName: "Mom's House",
      secondaryHouseName: "Dad's House",
      customConfig: {
        ...DEFAULT_NON_TRADITIONAL_CONFIG,
        morningSchoolParent: 'secondary', // Dad
        afterSchoolParent: 'primary',     // Mom
        afterSchoolEndTime: '19:30',      // 7:30 PM
        bedtimeOvernightParent: 'secondary', // Dad
        weekendPattern: 'alternating',
        firstWeekendParent: 'secondary',  // Dad weekend 1, Mom weekend 2
        holidayPolicy: 'working_out',
        holidayNotes: 'Holidays working out mutually as they arise.',
      },
    };

    it('correctly calculates overnights across the 14-day cycle for non-traditional schedule', () => {
      // Week 1 (Days 0..6): Mon-Thu Dad overnight, Fri-Sun Dad weekend
      expect(getHouseForDate('2026-10-05', nonTraditionalSchedule)).toBe('secondary'); // Mon
      expect(getHouseForDate('2026-10-06', nonTraditionalSchedule)).toBe('secondary'); // Tue
      expect(getHouseForDate('2026-10-07', nonTraditionalSchedule)).toBe('secondary'); // Wed
      expect(getHouseForDate('2026-10-08', nonTraditionalSchedule)).toBe('secondary'); // Thu
      expect(getHouseForDate('2026-10-09', nonTraditionalSchedule)).toBe('secondary'); // Fri (Dad weekend)
      expect(getHouseForDate('2026-10-10', nonTraditionalSchedule)).toBe('secondary'); // Sat (Dad weekend)
      expect(getHouseForDate('2026-10-11', nonTraditionalSchedule)).toBe('secondary'); // Sun (Dad weekend)

      // Week 2 (Days 7..13): Mon-Thu Dad overnight, Fri-Sun Mom weekend
      expect(getHouseForDate('2026-10-12', nonTraditionalSchedule)).toBe('secondary'); // Mon
      expect(getHouseForDate('2026-10-13', nonTraditionalSchedule)).toBe('secondary'); // Tue
      expect(getHouseForDate('2026-10-14', nonTraditionalSchedule)).toBe('secondary'); // Wed
      expect(getHouseForDate('2026-10-15', nonTraditionalSchedule)).toBe('secondary'); // Thu
      expect(getHouseForDate('2026-10-16', nonTraditionalSchedule)).toBe('primary');   // Fri (Mom weekend)
      expect(getHouseForDate('2026-10-17', nonTraditionalSchedule)).toBe('primary');   // Sat (Mom weekend)
      expect(getHouseForDate('2026-10-18', nonTraditionalSchedule)).toBe('primary');   // Sun (Mom weekend)

      // Week 3 (Cycle repeats): Mon Dad overnight
      expect(getHouseForDate('2026-10-19', nonTraditionalSchedule)).toBe('secondary');
    });

    it('returns rich intra-day breakdown from getCustodyDayDetails on split weekdays', () => {
      // Monday Oct 5: Split weekday
      const details = getCustodyDayDetails('2026-10-05', nonTraditionalSchedule);

      expect(details.isSplitDay).toBe(true);
      expect(details.isWeekend).toBe(false);
      expect(details.house).toBe('secondary'); // Overnight with Dad
      expect(details.parentName).toBe('Dad');
      expect(details.afterSchoolHandoff?.parentName).toBe('Mom');
      expect(details.afterSchoolHandoff?.endTime).toBe('19:30');
      expect(details.summaryLabel).toContain('Dad (School & Bed)');
      expect(details.summaryLabel).toContain('Mom (After-School till 7:30 PM)');

      expect(details.segments).toBeDefined();
      expect(details.segments).toHaveLength(3);
      expect(details.segments![0].periodLabel).toBe('Wake up & School');
      expect(details.segments![0].parentName).toBe('Dad');
      expect(details.segments![1].periodLabel).toBe('After-School Care');
      expect(details.segments![1].parentName).toBe('Mom');
      expect(details.segments![2].periodLabel).toBe('Bedtime & Overnight');
      expect(details.segments![2].parentName).toBe('Dad');
    });

    it('returns weekend details for Mom weekend vs Dad weekend', () => {
      // Saturday Oct 10: Dad's weekend
      const dadWknd = getCustodyDayDetails('2026-10-10', nonTraditionalSchedule);
      expect(dadWknd.isSplitDay).toBe(false);
      expect(dadWknd.isWeekend).toBe(true);
      expect(dadWknd.house).toBe('secondary');
      expect(dadWknd.summaryLabel).toBe("Dad's Weekend");

      // Saturday Oct 17: Mom's weekend
      const momWknd = getCustodyDayDetails('2026-10-17', nonTraditionalSchedule);
      expect(momWknd.isSplitDay).toBe(false);
      expect(momWknd.isWeekend).toBe(true);
      expect(momWknd.house).toBe('primary');
      expect(momWknd.summaryLabel).toBe("Mom's Weekend");
    });

    it('preserves holiday notes in day details', () => {
      const details = getCustodyDayDetails('2026-10-05', nonTraditionalSchedule);
      expect(details.holidayNote).toBe('Holidays working out mutually as they arise.');
    });

    it('calculates overnights and split daytime visits correctly over 14 days', () => {
      const metrics = calculateOvernights('2026-10-05', '2026-10-18', nonTraditionalSchedule);
      expect(metrics.total).toBe(14);
      expect(metrics.secondary).toBe(11); // 11 Dad overnights
      expect(metrics.primary).toBe(3);    // 3 Mom overnights (weekend 2)
      expect(metrics.splitDaysCount).toBe(9); // 4 in W1 + 1 Fri W1 + 4 in W2
      expect(metrics.primaryAfterSchoolVisits).toBe(9); // Mom after-school on all split days
    });

    it('saves and loads custom custody configuration without data loss', () => {
      saveCustodySchedule(nonTraditionalSchedule);
      const loaded = loadCustodySchedule();

      expect(loaded.pattern).toBe('split_day_alternating_weekends');
      expect(loaded.customConfig?.afterSchoolEndTime).toBe('19:30');
      expect(loaded.customConfig?.holidayPolicy).toBe('working_out');
      expect(loaded.customConfig?.morningSchoolParent).toBe('secondary');
    });
  });
});
