// src/lib/routines.ts
// Shared Daily Routines & Reward Triggers for Hot Mess Express / FamilyOS
import { loadJSON, saveJSON, uid, KEYS, awardPoints } from './familyos';
import { triggerHaDevice } from './familyos';
import { recordMemberActivityForToday } from './streaks';

export type RoutineType = 'morning' | 'bedtime' | 'school_prep' | 'custom';

export interface RoutineStep {
  id: string;
  title: string;
  description?: string;
  durationMinutes?: number;
  haEntityId?: string; // e.g. 'scene.bedtime_wind_down' or 'light.kids_bedroom'
  haAction?: 'turn_on' | 'turn_off' | 'toggle';
}

export interface Routine {
  id: string;
  title: string;
  type: RoutineType;
  targetMemberIds: string[]; // empty array = whole household
  steps: RoutineStep[];
  haTriggerEntityId?: string; // Scene/light to trigger on routine start
  completionPoints: number; // XP points awarded upon finishing all steps
  createdAt: number;
  deletedAt?: number;
}

export interface RoutineRun {
  id: string;
  routineId: string;
  memberId: string;
  memberName: string;
  completedStepIds: string[];
  startedAt: number;
  completedAt?: number;
  pointsAwarded?: number;
  date: string; // YYYY-MM-DD
}

export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: 'routine-morning-prep',
    title: 'Morning School-Prep',
    type: 'school_prep',
    targetMemberIds: [],
    completionPoints: 25,
    createdAt: 1700000000000,
    steps: [
      { id: 'm-1', title: 'Make bed & open blinds', durationMinutes: 5 },
      { id: 'm-2', title: 'Brush teeth & wash face', durationMinutes: 5 },
      { id: 'm-3', title: 'Get dressed & shoes on', durationMinutes: 5 },
      { id: 'm-4', title: 'Pack backpack & water bottle', durationMinutes: 5 },
      { id: 'm-5', title: 'Eat a good breakfast', durationMinutes: 15 },
    ],
  },
  {
    id: 'routine-bedtime-winddown',
    title: 'Bedtime Wind-Down',
    type: 'bedtime',
    targetMemberIds: [],
    completionPoints: 25,
    createdAt: 1700000000000,
    steps: [
      { id: 'b-1', title: 'Pick up toys & clear bedroom floor', durationMinutes: 5 },
      { id: 'b-2', title: 'Pajamas on & clothes in hamper', durationMinutes: 5 },
      { id: 'b-3', title: 'Brush teeth for 2 full minutes', durationMinutes: 3 },
      { id: 'b-4', title: 'Lay out tomorrow’s clothes & backpack', durationMinutes: 5 },
      { id: 'b-5', title: 'Bedtime story or quiet reading time', durationMinutes: 10 },
    ],
  },
];

export function getLocalDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function loadRoutines(): Routine[] {
  const stored = loadJSON<Routine[]>(KEYS.routines, []);
  if (stored && stored.length > 0) {
    return stored;
  }
  // Initialize with built-in defaults
  saveJSON(KEYS.routines, DEFAULT_ROUTINES);
  return DEFAULT_ROUTINES;
}

export function saveRoutines(routines: Routine[]): void {
  saveJSON(KEYS.routines, routines);
}

export function loadRoutineRuns(): RoutineRun[] {
  return loadJSON<RoutineRun[]>(KEYS.routineRuns, []);
}

export function saveRoutineRuns(runs: RoutineRun[]): void {
  saveJSON(KEYS.routineRuns, runs);
}

export interface StartRoutineResult {
  run: RoutineRun;
  isResume: boolean;
  haResult?: { ok: boolean; error?: string };
}

/**
 * Starts a new routine run for a specific member today (or returns active run).
 */
export async function startRoutineRun(
  routineId: string,
  member: { id: string; name: string }
): Promise<StartRoutineResult> {
  const routines = loadRoutines();
  const routine = routines.find((r) => r.id === routineId && !r.deletedAt);
  if (!routine) {
    throw new Error('Routine not found or deleted');
  }

  const todayStr = getLocalDateString();
  const currentRuns = loadRoutineRuns();

  // Find if run already active today for this member
  const existing = currentRuns.find(
    (r) => r.routineId === routineId && r.memberId === member.id && r.date === todayStr && !r.completedAt
  );
  if (existing) {
    return { run: existing, isResume: true };
  }

  // Trigger optional routine-level HA scene/light with explicit 'turn_on'
  let haResult: { ok: boolean; error?: string } | undefined;
  if (routine.haTriggerEntityId) {
    haResult = await triggerHaDevice(routine.haTriggerEntityId, 'turn_on').catch((err) => ({
      ok: false,
      error: err?.message || 'Failed to trigger device',
    }));
  }

  const newRun: RoutineRun = {
    id: uid(),
    routineId: routine.id,
    memberId: member.id,
    memberName: member.name,
    completedStepIds: [],
    startedAt: Date.now(),
    date: todayStr,
  };

  saveRoutineRuns([newRun, ...currentRuns]);
  return { run: newRun, isResume: false, haResult };
}

/**
 * Toggles completion status of a routine step. If an HA device is tied to the step, triggers it.
 */
export async function toggleRoutineStep(
  runId: string,
  stepId: string
): Promise<RoutineRun | null> {
  const runs = loadRoutineRuns();
  const runIdx = runs.findIndex((r) => r.id === runId);
  if (runIdx === -1) return null;

  const run = runs[runIdx];
  if (run.completedAt) {
    // Cannot modify steps of an already finished routine run
    return null;
  }

  const routines = loadRoutines();
  const routine = routines.find((r) => r.id === run.routineId && !r.deletedAt);
  if (!routine) return null;

  // Validate stepId belongs to this routine
  const step = routine.steps.find((s) => s.id === stepId);
  if (!step) return null;

  const isCompleted = run.completedStepIds.includes(stepId);
  const nextCompleted = isCompleted
    ? run.completedStepIds.filter((id) => id !== stepId)
    : [...run.completedStepIds, stepId];

  // If newly completed, trigger any tied HA action (defaults to turn_on)
  if (!isCompleted && step.haEntityId) {
    triggerHaDevice(step.haEntityId, step.haAction || 'turn_on').catch(() => {});
  }

  const updatedRun: RoutineRun = {
    ...run,
    completedStepIds: nextCompleted,
  };

  runs[runIdx] = updatedRun;
  saveRoutineRuns(runs);
  return updatedRun;
}

export interface FinishRoutineResult {
  ok: boolean;
  pointsAwarded: number;
  alreadyClaimedToday?: boolean;
  run?: RoutineRun;
  error?: string;
}

/**
 * Finishes a routine run, awards squad XP points, and updates the member's daily activity streak.
 * Enforces:
 * - All routine steps must be completed.
 * - Daily reward limit: only 1 XP award per (member, routine, date). Replays grant 0 XP.
 * - Atomic persistence order.
 */
export function finishRoutineRun(runId: string): FinishRoutineResult {
  const runs = loadRoutineRuns();
  const runIdx = runs.findIndex((r) => r.id === runId);
  if (runIdx === -1) {
    return { ok: false, pointsAwarded: 0, error: 'Run not found' };
  }

  const run = runs[runIdx];
  if (run.completedAt) {
    return { ok: false, pointsAwarded: 0, error: 'Routine already completed' };
  }

  const routines = loadRoutines();
  const routine = routines.find((r) => r.id === run.routineId && !r.deletedAt);
  if (!routine) {
    return { ok: false, pointsAwarded: 0, error: 'Routine unavailable or deleted' };
  }

  // Validate all steps are completed
  const completedSet = new Set(run.completedStepIds);
  if (
    routine.steps.length === 0 ||
    !routine.steps.every((step) => completedSet.has(step.id))
  ) {
    return { ok: false, pointsAwarded: 0, error: 'Complete every step before claiming reward' };
  }

  // Check if this member has already claimed reward points for this routine today
  const alreadyClaimed = runs.some(
    (r) =>
      r.id !== runId &&
      r.memberId === run.memberId &&
      r.routineId === run.routineId &&
      r.date === run.date &&
      r.completedAt &&
      (r.pointsAwarded ?? 0) > 0
  );

  const points = alreadyClaimed ? 0 : Math.max(0, Math.floor(routine.completionPoints ?? 25));

  // 1. Mark Run Completed First
  const updatedRun: RoutineRun = {
    ...run,
    completedAt: Date.now(),
    pointsAwarded: points,
  };

  runs[runIdx] = updatedRun;
  saveRoutineRuns(runs);

  // 2. Credit Points if not already claimed today
  if (points > 0) {
    awardPoints(run.memberId, points);
  }

  // 3. Advance Member Streak
  recordMemberActivityForToday(run.memberId, run.memberName);

  return {
    ok: true,
    pointsAwarded: points,
    alreadyClaimedToday: alreadyClaimed,
    run: updatedRun,
  };
}

/**
 * Creates and saves a new routine.
 */
export function createRoutine(
  routineData: Omit<Routine, 'id' | 'createdAt'>
): Routine {
  const title = (routineData.title || '').trim();
  if (!title) {
    throw new Error('Routine title is required');
  }
  const completionPoints = Math.max(
    0,
    Math.floor(Number(routineData.completionPoints) || 0)
  );
  const routines = loadRoutines();
  const newRoutine: Routine = {
    ...routineData,
    title,
    completionPoints,
    id: `routine-${uid()}`,
    createdAt: Date.now(),
  };
  saveRoutines([...routines, newRoutine]);
  return newRoutine;
}

/**
 * Soft-deletes a routine.
 */
export function deleteRoutine(routineId: string): void {
  const routines = loadRoutines();
  const updated = routines.map((r) =>
    r.id === routineId ? { ...r, deletedAt: Date.now() } : r
  );
  saveRoutines(updated);
}
