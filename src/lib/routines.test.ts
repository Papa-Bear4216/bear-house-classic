import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadRoutines,
  saveRoutines,
  loadRoutineRuns,
  startRoutineRun,
  toggleRoutineStep,
  finishRoutineRun,
  createRoutine,
  deleteRoutine,
  DEFAULT_ROUTINES,
} from './routines';
import {
  recordMemberActivityForToday,
  getMemberStreak,
  computeFamilyLeaderboard,
  loadMemberStreaks,
  saveMemberStreaks,
  getYesterdayDateString,
} from './streaks';
import { loadPointsBalance } from './familyos';

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

describe('Shared Routines & Rewards', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads built-in default routines without unconfigured device bindings', () => {
    const routines = loadRoutines();
    expect(routines.length).toBeGreaterThanOrEqual(2);
    expect(routines.some((r) => r.type === 'school_prep')).toBe(true);
    expect(routines.some((r) => r.type === 'bedtime')).toBe(true);
    // Built-in defaults must not assume live smart home entities
    expect(routines.every((r) => r.haTriggerEntityId === undefined)).toBe(true);
  });

  it('starts a routine run and tracks completed steps', async () => {
    const member = { id: 'kid-1', name: 'Leo' };
    const { run, isResume } = await startRoutineRun('routine-morning-prep', member);

    expect(isResume).toBe(false);
    expect(run.memberId).toBe('kid-1');
    expect(run.completedStepIds).toHaveLength(0);
    expect(run.completedAt).toBeUndefined();

    // Toggle step 1
    const updated = await toggleRoutineStep(run.id, 'm-1');
    expect(updated?.completedStepIds).toContain('m-1');

    // Toggle step 2
    const updated2 = await toggleRoutineStep(run.id, 'm-2');
    expect(updated2?.completedStepIds).toEqual(['m-1', 'm-2']);

    // Untoggle step 1
    const updated3 = await toggleRoutineStep(run.id, 'm-1');
    expect(updated3?.completedStepIds).not.toContain('m-1');

    // Resuming active run today returns isResume: true
    const resume = await startRoutineRun('routine-morning-prep', member);
    expect(resume.isResume).toBe(true);
    expect(resume.run.id).toBe(run.id);
  });

  it('rejects finishing an incomplete routine run', async () => {
    const member = { id: 'kid-1', name: 'Leo' };
    const { run } = await startRoutineRun('routine-morning-prep', member);

    // Only complete 1 out of 5 steps
    await toggleRoutineStep(run.id, 'm-1');

    const result = finishRoutineRun(run.id);
    expect(result.ok).toBe(false);
    expect(result.pointsAwarded).toBe(0);
    expect(result.error).toContain('Complete every step');
  });

  it('finishes a fully completed routine run, credits squad points, and prevents step modification afterwards', async () => {
    const member = { id: 'kid-1', name: 'Leo' };
    const { run } = await startRoutineRun('routine-morning-prep', member);

    // Initial points
    const initialPoints = loadPointsBalance()['kid-1'] ?? 0;
    expect(initialPoints).toBe(0);

    // Complete all 5 steps
    await toggleRoutineStep(run.id, 'm-1');
    await toggleRoutineStep(run.id, 'm-2');
    await toggleRoutineStep(run.id, 'm-3');
    await toggleRoutineStep(run.id, 'm-4');
    await toggleRoutineStep(run.id, 'm-5');

    // Complete run
    const result = finishRoutineRun(run.id);
    expect(result.ok).toBe(true);
    expect(result.pointsAwarded).toBe(25);
    expect(result.alreadyClaimedToday).toBe(false);

    // Verify points credited
    const afterPoints = loadPointsBalance()['kid-1'];
    expect(afterPoints).toBe(25);

    // Verify streak updated for today
    const streak = getMemberStreak('kid-1', 'Leo');
    expect(streak.currentStreak).toBe(1);
    expect(streak.activeToday).toBe(true);

    // Cannot modify steps on a finished run
    const postFinishToggle = await toggleRoutineStep(run.id, 'm-1');
    expect(postFinishToggle).toBeNull();

    // Guard against duplicate finish on the same run
    const duplicate = finishRoutineRun(run.id);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error).toContain('already completed');
  });

  it('enforces daily reward policy on replays (second completion awards 0 XP)', async () => {
    const member = { id: 'kid-1', name: 'Leo' };

    // Run 1: First completion today awards 25 XP
    const start1 = await startRoutineRun('routine-morning-prep', member);
    for (const step of ['m-1', 'm-2', 'm-3', 'm-4', 'm-5']) {
      await toggleRoutineStep(start1.run.id, step);
    }
    const res1 = finishRoutineRun(start1.run.id);
    expect(res1.ok).toBe(true);
    expect(res1.pointsAwarded).toBe(25);

    // Run 2: Replay on the same day
    const start2 = await startRoutineRun('routine-morning-prep', member);
    expect(start2.isResume).toBe(false); // New run since run 1 was completed
    for (const step of ['m-1', 'm-2', 'm-3', 'm-4', 'm-5']) {
      await toggleRoutineStep(start2.run.id, step);
    }
    const res2 = finishRoutineRun(start2.run.id);
    expect(res2.ok).toBe(true);
    expect(res2.pointsAwarded).toBe(0); // Replay awards 0 XP
    expect(res2.alreadyClaimedToday).toBe(true);

    // Total points balance remains 25
    expect(loadPointsBalance()['kid-1']).toBe(25);
  });

  it('validates, creates, and deletes custom routines', () => {
    // Empty title rejected
    expect(() =>
      createRoutine({
        title: '   ',
        type: 'custom',
        targetMemberIds: [],
        completionPoints: 10,
        steps: [{ id: 's1', title: 'Step 1' }],
      })
    ).toThrow('title is required');

    const custom = createRoutine({
      title: 'After-School Reset',
      type: 'custom',
      targetMemberIds: [],
      completionPoints: 15,
      steps: [
        { id: 's1', title: 'Hang backpack on hook' },
        { id: 's2', title: 'Put lunchbox on counter' },
      ],
    });

    const routines = loadRoutines();
    expect(routines.some((r) => r.id === custom.id)).toBe(true);
    expect(custom.completionPoints).toBe(15);

    deleteRoutine(custom.id);
    const updated = loadRoutines();
    const found = updated.find((r) => r.id === custom.id);
    expect(found?.deletedAt).toBeDefined();
  });
});

describe('Streaks & Leaderboard Engine', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('advances streak consecutively when active yesterday and today', () => {
    const yesterday = getYesterdayDateString();

    // User was active yesterday with a 3-day streak
    saveMemberStreaks({
      'user-1': {
        memberId: 'user-1',
        memberName: 'Maya',
        currentStreak: 3,
        longestStreak: 5,
        lastActiveDate: yesterday,
        activeToday: false,
      },
    });

    // Before activity today: streak is 3, but not active today yet
    const before = getMemberStreak('user-1', 'Maya');
    expect(before.currentStreak).toBe(3);
    expect(before.activeToday).toBe(false);

    // Record activity today: streak increments to 4!
    const after = recordMemberActivityForToday('user-1', 'Maya');
    expect(after.currentStreak).toBe(4);
    expect(after.longestStreak).toBe(5);
    expect(after.activeToday).toBe(true);

    // Repeating activity today does not duplicate increment
    const dup = recordMemberActivityForToday('user-1', 'Maya');
    expect(dup.currentStreak).toBe(4);
  });

  it('resets streak to 1 after missing more than 1 day', () => {
    // User was last active 4 days ago
    saveMemberStreaks({
      'user-1': {
        memberId: 'user-1',
        memberName: 'Maya',
        currentStreak: 10,
        longestStreak: 10,
        lastActiveDate: '2020-01-01',
        activeToday: false,
      },
    });

    // Before activity today: expired streak is reported as 0
    const before = getMemberStreak('user-1', 'Maya');
    expect(before.currentStreak).toBe(0);
    expect(before.activeToday).toBe(false);

    // Record activity today: starts fresh at 1, while preserving longestStreak
    const after = recordMemberActivityForToday('user-1', 'Maya');
    expect(after.currentStreak).toBe(1);
    expect(after.longestStreak).toBe(10);
    expect(after.activeToday).toBe(true);
  });

  it('computes family leaderboard sorted by points with streak badges', () => {
    const members = [
      { id: 'm-1', name: 'Leo', role: 'child', color: 'indigo' },
      { id: 'm-2', name: 'Maya', role: 'child', color: 'pink' },
      { id: 'm-3', name: 'Dad', role: 'admin', color: 'blue' },
      { id: 'm-4', name: 'Lucy', role: 'pet', color: 'rose' },
    ];

    // Leo has 50 points, Maya has 100 points, Dad has 25 points
    const pointsBalance = {
      'm-1': 50,
      'm-2': 100,
      'm-3': 25,
    };

    recordMemberActivityForToday('m-1', 'Leo');
    recordMemberActivityForToday('m-2', 'Maya');

    const leaderboard = computeFamilyLeaderboard(members, pointsBalance);

    // Pets excluded
    expect(leaderboard.some((e) => e.memberName === 'Lucy')).toBe(false);
    expect(leaderboard).toHaveLength(3);

    // Maya is rank 1 (100 pts)
    expect(leaderboard[0].memberName).toBe('Maya');
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[0].points).toBe(100);
    expect(leaderboard[0].activeToday).toBe(true);

    // Leo is rank 2 (50 pts)
    expect(leaderboard[1].memberName).toBe('Leo');
    expect(leaderboard[1].rank).toBe(2);

    // Dad is rank 3 (25 pts)
    expect(leaderboard[2].memberName).toBe('Dad');
    expect(leaderboard[2].rank).toBe(3);
  });
});
