import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateWeeklyRoundup,
  formatWeeklyRoundupText,
  WeeklyRoundupData,
} from './weeklyRoundup';
import { saveJSON, KEYS, HouseholdMember } from './familyos';
import { CustodyScheduleSettings } from './custody';

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

describe('Weekly Family Digest & Logistics Roundup', () => {
  const members: HouseholdMember[] = [
    { id: 'm-1', name: 'Maya', role: 'child', color: 'pink' },
    { id: 'm-2', name: 'Leo', role: 'child', color: 'indigo' },
    { id: 'm-3', name: 'Dad', role: 'admin', color: 'blue' },
  ];

  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('aggregates kid chores, streak days, and points over the past 7 days', () => {
    const now = Date.now();
    saveJSON(KEYS.tasks, [
      { id: 't1', text: 'Clean bedroom', person: 'Maya', completed: true, completedAt: now - 3600000 },
      { id: 't2', text: 'Feed cat', person: 'Maya', completed: true, completedAt: now - 7200000 },
      { id: 't3', text: 'Math homework', person: 'Leo', completed: true, completedAt: now - 10000000 },
      { id: 't4', text: 'Old chore', person: 'Maya', completed: true, completedAt: now - 10 * 86400000 }, // > 7 days ago
    ]);

    saveJSON(KEYS.memberStreaks, {
      'm-1': { memberId: 'm-1', memberName: 'Maya', currentStreak: 5, longestStreak: 7, lastActiveDate: '2026-10-01', activeToday: true },
      'm-2': { memberId: 'm-2', memberName: 'Leo', currentStreak: 3, longestStreak: 3, lastActiveDate: '2026-10-01', activeToday: true },
    });

    saveJSON(KEYS.points, {
      'm-1': 150,
      'm-2': 90,
    });

    const data = generateWeeklyRoundup(members);
    expect(data.choresAndStreaks.totalChoresCompleted).toBe(3);

    const maya = data.choresAndStreaks.activeKids.find((k) => k.name === 'Maya');
    expect(maya?.choresDone).toBe(2);
    expect(maya?.streakDays).toBe(5);
    expect(maya?.xpBalance).toBe(150);

    const leo = data.choresAndStreaks.activeKids.find((k) => k.name === 'Leo');
    expect(leo?.choresDone).toBe(1);
    expect(leo?.streakDays).toBe(3);
    expect(leo?.xpBalance).toBe(90);
  });

  it('computes upcoming custody overnights and transitions when schedule is configured', () => {
    const custodySettings: CustodyScheduleSettings = {
      template: 'alternating_weeks',
      startDate: '2026-10-01',
      primaryHouseholdName: 'Bear House (Dad)',
      secondaryHouseholdName: 'Cedar Cabin (Mom)',
      transitionDay: 'Friday',
      transitionTime: '17:00',
      transitionLocation: 'School Pickup',
    };
    saveJSON(KEYS.custodySchedules, custodySettings);

    const data = generateWeeklyRoundup(members);
    expect(data.custody.primaryHouseName).toBe('Bear House (Dad)');
    expect(data.custody.secondaryHouseName).toBe('Cedar Cabin (Mom)');
    expect(data.custody.primaryOvernights + data.custody.secondaryOvernights).toBe(7);
  });

  it('reads canonical CustodySchedule and incorporates approved custody swaps', () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    saveJSON(KEYS.custodySchedule, {
      id: 'canonical-schedule',
      pattern: 'alternating_weeks',
      startDate: todayStr,
      primaryHouseName: 'North Lake Cottage',
      secondaryHouseName: 'South Valley Home',
      primaryParentName: 'Dad',
      secondaryParentName: 'Mom',
      transitionTime: '17:00',
    });

    // Baseline: With alternating_weeks starting today, all 7 coming days are primary
    const baseline = generateWeeklyRoundup(members);
    expect(baseline.custody.primaryHouseName).toBe('North Lake Cottage');
    expect(baseline.custody.secondaryHouseName).toBe('South Valley Home');
    expect(baseline.custody.primaryOvernights).toBe(7);
    expect(baseline.custody.secondaryOvernights).toBe(0);

    // Now save an approved swap giving tomorrow to the secondary house
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    saveJSON(KEYS.custodySwaps, [
      {
        id: 'swap-1',
        childName: 'All Children',
        requesterId: 'm-3',
        requesterName: 'Dad',
        targetHouse: 'secondary',
        currentDate: tomorrowStr,
        status: 'approved',
        createdAt: Date.now() - 3600000,
        resolvedAt: Date.now() - 1800000,
      },
    ]);

    const withSwap = generateWeeklyRoundup(members);
    expect(withSwap.custody.primaryOvernights).toBe(6);
    expect(withSwap.custody.secondaryOvernights).toBe(1);
    // Handoff to secondary occurred on tomorrowStr
    expect(withSwap.custody.transitions.some((t) => t.date === tomorrowStr)).toBe(true);
  });

  it('aggregates medications and excludes soft-deleted dose records', () => {
    const now = Date.now();
    saveJSON(KEYS.medications, [
      { id: 'med-1', name: 'Amoxicillin', person: 'Maya', dosage: '5ml', createdAt: now - 86400000 },
      { id: 'med-2', name: 'Old Med', person: 'Leo', dosage: '10mg', createdAt: now - 86400000, deletedAt: now },
    ]);

    saveJSON(KEYS.medDoses, [
      { id: 'd-1', medicationId: 'med-1', person: 'Maya', dosage: '5ml', timestamp: now - 3600000, givenBy: 'Dad' },
      { id: 'd-2', medicationId: 'med-1', person: 'Maya', dosage: '5ml', timestamp: now - 7200000, givenBy: 'Mom' },
      { id: 'd-3', medicationId: 'med-1', person: 'Maya', dosage: '5ml', timestamp: now - 1800000, givenBy: 'Dad', deletedAt: now }, // Deleted dose
    ]);

    const data = generateWeeklyRoundup(members);
    expect(data.health.activeMedications).toHaveLength(1);
    expect(data.health.activeMedications[0].medName).toBe('Amoxicillin');
    expect(data.health.activeMedications[0].dosesLoggedLast7Days).toBe(2);
  });

  it('formats weekly digest into a clean, respectful, child-centered message', () => {
    const dummyData: WeeklyRoundupData = {
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      generatedAt: Date.now(),
      custody: {
        primaryHouseName: 'Dad’s House',
        secondaryHouseName: 'Mom’s House',
        primaryOvernights: 4,
        secondaryOvernights: 3,
        transitions: [
          {
            date: '2026-10-04',
            dayOfWeek: 'Sunday',
            toHousehold: 'Mom’s House',
            location: 'School Parking Lot',
          },
        ],
      },
      choresAndStreaks: {
        totalChoresCompleted: 8,
        activeKids: [
          { name: 'Maya', choresDone: 5, streakDays: 4, xpBalance: 120 },
          { name: 'Leo', choresDone: 3, streakDays: 2, xpBalance: 60 },
        ],
      },
      health: {
        activeMedications: [
          { medName: 'Inhaler', kidName: 'Leo', dosage: '2 puffs as needed', dosesLoggedLast7Days: 2 },
        ],
      },
      upcomingEvents: [
        { title: 'Maya Soccer Tournament', date: '2026-10-03', time: '10:00 AM' },
      ],
    };

    const text = formatWeeklyRoundupText(dummyData);
    expect(text).toContain('Weekly Kid Logistics Digest');
    expect(text).toContain('Dad’s House: 4 overnights');
    expect(text).toContain('Mom’s House: 3 overnights');
    expect(text).toContain('Hand-off to Mom’s House @ School Parking Lot');
    expect(text).toContain('Leo: Inhaler (2 puffs as needed) — 2 doses logged this week');
    expect(text).toContain('Maya: 5 chores completed | 🔥 4d streak | 120 Squad XP');
    expect(text).toContain('Maya Soccer Tournament');
    expect(text).toContain('Have a smooth and positive week!');
  });
});
