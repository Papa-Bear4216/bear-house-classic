# HouseholdBrain Step-Chunking & Timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add step-chunking (2-4 AI-suggested, editable sub-steps per task) and a color-coded work-session countdown timer to Focus Mode, building on the already-shipped Focus Mode feature. Both are additive to the existing `Task` shape — no breaking changes to stored data.

**Architecture:** `taskTimer.ts` (new) holds pure countdown-zone math (green/yellow/red, overtime), tested independently, the same separation already established by `focusQueue.ts`. `HouseholdBrain.tsx`'s single existing AI call in `addTask()` is extended to also return `steps`/`estimatedMinutes` — no second AI round-trip. `FocusMode.tsx` gains a step checklist and a live countdown ring, both conditional on the current task having the relevant optional fields.

**Tech Stack:** Existing React/TypeScript/Tailwind stack, no new dependencies. The countdown ring reuses the same inline-SVG circular-progress technique already used elsewhere in this file (`HouseholdBrain.tsx`'s existing Weekly Presence ring, lines 317-322) rather than introducing a charting library.

## Global Constraints

- **`steps`, `stepsCompleted`, and `estimatedMinutes` are all optional fields on `Task`.** A task with none of them renders in Focus Mode exactly as it does today (plain text, Done/Skip, no timer) — this is purely additive.
- **No changes to `completeTask`'s points/recurrence logic, the due-date badge system, or any other existing behavior.**
- **The timer counts up past zero on overtime rather than stopping or alerting** — visual-only (red ring), no sound/vibration/notification.
- **`HouseholdBrain.tsx`/`FocusMode.tsx` are not retheming targets in this plan** — both stay in their current slate/orange styling, consistent with the prior Focus Mode plan's explicit scope boundary.
- **If the AI call in `addTask()` fails or returns malformed `steps`/`estimatedMinutes`, the task is created with neither field** — same graceful-degradation behavior already used today for category/priority/person.

---

## File Structure

- **Create:** `src/lib/taskTimer.ts` — pure countdown-zone calculation, independently tested.
- **Modify:** `src/components/familyos/HouseholdBrain.tsx` — extend `Task` interface, extend `addTask()`'s AI prompt/parsing, add a steps-count badge in list view, add step/estimate editing.
- **Modify:** `src/components/familyos/FocusMode.tsx` — render step checklist when present, auto-complete on last step checked, render countdown ring driven by `taskTimer.ts`.

---

### Task 1: Build and test the countdown-zone logic

**Files:**
- Create: `src/lib/taskTimer.ts`
- Test: `src/lib/taskTimer.test.ts`

**Interfaces:**
- Produces: `getTimerState(estimatedMinutes: number, elapsedSeconds: number): { remainingSeconds: number; zone: 'green' | 'yellow' | 'red'; overtime: boolean }` — consumed by `FocusMode.tsx` in Task 3.

- [ ] **Step 1: Write the failing test**

Create `src/lib/taskTimer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getTimerState } from './taskTimer';

describe('getTimerState', () => {
  it('is green when more than half the estimated time remains', () => {
    // 10 min estimate, 2 min elapsed = 80% remaining
    const state = getTimerState(10, 120);
    expect(state.zone).toBe('green');
    expect(state.overtime).toBe(false);
    expect(state.remainingSeconds).toBe(480);
  });

  it('is yellow between 20% and 50% remaining', () => {
    // 10 min estimate, 7 min elapsed = 30% remaining
    const state = getTimerState(10, 420);
    expect(state.zone).toBe('yellow');
    expect(state.overtime).toBe(false);
  });

  it('is red when less than 20% remains', () => {
    // 10 min estimate, 9 min elapsed = 10% remaining
    const state = getTimerState(10, 540);
    expect(state.zone).toBe('red');
    expect(state.overtime).toBe(false);
  });

  it('is red and marked overtime once elapsed exceeds the estimate, with negative remainingSeconds', () => {
    // 10 min estimate, 12 min elapsed = 2 min overtime
    const state = getTimerState(10, 720);
    expect(state.zone).toBe('red');
    expect(state.overtime).toBe(true);
    expect(state.remainingSeconds).toBe(-120);
  });

  it('is green at exactly zero elapsed', () => {
    const state = getTimerState(15, 0);
    expect(state.zone).toBe('green');
    expect(state.remainingSeconds).toBe(900);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/taskTimer.test.ts`
Expected: FAIL — `Cannot find module './taskTimer'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/taskTimer.ts`:

```ts
export interface TimerState {
  remainingSeconds: number; // negative once in overtime
  zone: 'green' | 'yellow' | 'red';
  overtime: boolean;
}

export function getTimerState(estimatedMinutes: number, elapsedSeconds: number): TimerState {
  const totalSeconds = estimatedMinutes * 60;
  const remainingSeconds = totalSeconds - elapsedSeconds;
  const overtime = remainingSeconds <= 0;
  const remainingFraction = overtime ? 0 : remainingSeconds / totalSeconds;

  let zone: TimerState['zone'];
  if (overtime || remainingFraction < 0.2) {
    zone = 'red';
  } else if (remainingFraction < 0.5) {
    zone = 'yellow';
  } else {
    zone = 'green';
  }

  return { remainingSeconds, zone, overtime };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/taskTimer.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: all previously-passing tests still pass, plus the 5 new `taskTimer` tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/taskTimer.ts src/lib/taskTimer.test.ts
git commit -m "feat(focus-mode): add color-zone countdown timer logic"
```

---

### Task 2: Extend Task data model and AI-assisted creation with steps + estimate

**Files:**
- Modify: `src/components/familyos/HouseholdBrain.tsx`

**Interfaces:**
- Produces: `Task.steps?: string[]`, `Task.stepsCompleted?: boolean[]`, `Task.estimatedMinutes?: number` — consumed by `FocusMode.tsx` in Task 3 (via the existing structural-compatibility pattern already established for `FocusModeTask`).
- Consumes: nothing new — extends the existing `addTask()` AI call.

**Context:** Read the full current file with the Read tool immediately before editing — Focus Mode's Task 3 (already shipped) added imports/state/JSX that must not be clobbered.

- [ ] **Step 1: Extend the `Task` interface**

Change (current lines 31-44):

```tsx
interface Task {
  id: string;
  text: string;
  person: string;
  priority: string;
  category: string;
  dueEstimate?: string; // legacy
  dueDate?: number | null;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  recurrence?: Recurrence | null;
  parentId?: string;
}
```

to:

```tsx
interface Task {
  id: string;
  text: string;
  person: string;
  priority: string;
  category: string;
  dueEstimate?: string; // legacy
  dueDate?: number | null;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  recurrence?: Recurrence | null;
  parentId?: string;
  steps?: string[];
  stepsCompleted?: boolean[];
  estimatedMinutes?: number;
}
```

- [ ] **Step 2: Extend the AI prompt and response parsing in `addTask()`**

Change (current lines 175-193):

```tsx
    setAiBusy(true);
    const prompt = `Categorize this household task. Return ONLY JSON: {"category":"one of: ${TASK_CATEGORIES.join(', ')}","priority":"High|Medium|Low","person":"one of: ${PERSONS.join(', ')}"}\n\nTask: "${rawText}"`;
    const { ok, text: aiText } = await callClaude(prompt);
    if (ok) {
      const parsed = tryParseJSON<Partial<Task>>(aiText, {});
      setTasks((prev) =>
        prev.map((t) =>
          t.id === baseTask.id
            ? {
                ...t,
                category: parsed.category && TASK_CATEGORIES.includes(parsed.category) ? parsed.category : t.category,
                priority: parsed.priority && PRIORITIES.includes(parsed.priority) ? parsed.priority : t.priority,
                person: parsed.person && PERSONS.includes(parsed.person) ? parsed.person : t.person,
              }
            : t
        )
      );
    }
    setAiBusy(false);
  };
```

to:

```tsx
    setAiBusy(true);
    const prompt = `Categorize this household task and break it into concrete steps. Return ONLY JSON: {"category":"one of: ${TASK_CATEGORIES.join(', ')}","priority":"High|Medium|Low","person":"one of: ${PERSONS.join(', ')}","steps":["2 to 4 short, concrete sub-steps"],"estimatedMinutes":number}\n\nTask: "${rawText}"`;
    const { ok, text: aiText } = await callClaude(prompt);
    if (ok) {
      const parsed = tryParseJSON<Partial<Task>>(aiText, {});
      const validSteps = Array.isArray(parsed.steps) && parsed.steps.length >= 2 && parsed.steps.length <= 4
        ? parsed.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : undefined;
      const validEstimate = typeof parsed.estimatedMinutes === 'number' && parsed.estimatedMinutes > 0
        ? Math.round(parsed.estimatedMinutes)
        : undefined;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === baseTask.id
            ? {
                ...t,
                category: parsed.category && TASK_CATEGORIES.includes(parsed.category) ? parsed.category : t.category,
                priority: parsed.priority && PRIORITIES.includes(parsed.priority) ? parsed.priority : t.priority,
                person: parsed.person && PERSONS.includes(parsed.person) ? parsed.person : t.person,
                steps: validSteps,
                stepsCompleted: validSteps ? validSteps.map(() => false) : undefined,
                estimatedMinutes: validEstimate,
              }
            : t
        )
      );
    }
    setAiBusy(false);
  };
```

(If `parsed.steps` is missing, malformed, or outside the 2-4 range, `validSteps` is `undefined` and the task simply has no steps — identical to today's behavior for a task with no AI-derived fields. Same graceful-degradation pattern as the existing `category`/`priority`/`person` fallbacks just above it.)

- [ ] **Step 3: Add a step-toggle handler and a step-count badge in list view**

Add a new function near `completeTask`/`deleteTask` (after `deleteTask`, current line 244):

```tsx
  const toggleTaskStep = (taskId: string, stepIndex: number) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId || !t.stepsCompleted) return t;
        const nextCompleted = t.stepsCompleted.map((done, i) => (i === stepIndex ? !done : done));
        return { ...t, stepsCompleted: nextCompleted };
      })
    );
  };
```

In the list-view task card (current lines 509-528, the badge row), add a steps-count badge. Find:

```tsx
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{t.person}</span>
                    <span className="text-[10px] uppercase tracking-wide bg-orange-900/40 text-orange-300 px-1.5 py-0.5 rounded">{t.category}</span>
```

Change to:

```tsx
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{t.person}</span>
                    <span className="text-[10px] uppercase tracking-wide bg-orange-900/40 text-orange-300 px-1.5 py-0.5 rounded">{t.category}</span>
                    {t.steps && t.steps.length > 0 && (
                      <span className="text-[10px] uppercase tracking-wide bg-violet-900/40 text-violet-300 px-1.5 py-0.5 rounded">
                        {t.stepsCompleted?.filter(Boolean).length ?? 0}/{t.steps.length} steps
                      </span>
                    )}
```

(Collapsed summary only in list view, per the design doc — no expand/collapse interaction here, matching the "simple in list / rich in Focus" split. Violet was chosen to visually distinguish from the existing orange-toned category badge immediately before it.)

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "HouseholdBrain"`
Expected: no output.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass (no existing tests touch `addTask`'s AI parsing or the badge row, so no regressions expected).

- [ ] **Step 6: Build**

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/familyos/HouseholdBrain.tsx
git commit -m "feat(focus-mode): extend Task with AI-suggested steps and time estimate"
```

---

### Task 3: Add step checklist and countdown ring to FocusMode

**Files:**
- Modify: `src/components/familyos/FocusMode.tsx`

**Interfaces:**
- Consumes: `getTimerState` from `src/lib/taskTimer.ts` (Task 1); `steps`/`stepsCompleted`/`estimatedMinutes` fields from `Task` (Task 2) — `HouseholdBrain.tsx`'s `Task` objects passed as `FocusMode`'s `tasks` prop structurally satisfy an extended `FocusModeTask` with no adapter needed, same pattern as the original Focus Mode plan.
- Produces: extends `FocusModeProps` with `onToggleStep: (taskId: string, stepIndex: number) => void`, consumed by `HouseholdBrain.tsx` (passing its `toggleTaskStep` from Task 2).

**Context:** Read the full current file with the Read tool immediately before editing.

- [ ] **Step 1: Extend `FocusModeTask` and `FocusModeProps`**

Change (current lines 1-13):

```tsx
import React, { useState, useMemo } from 'react';
import { CheckCircle2, SkipForward, X, PartyPopper } from 'lucide-react';
import { buildFocusQueue, type FocusQueueTask } from '@/lib/focusQueue';

export interface FocusModeTask extends FocusQueueTask {
  text: string;
}

interface FocusModeProps {
  tasks: FocusModeTask[];
  onComplete: (id: string) => void;
  onExit: () => void;
}
```

to:

```tsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CheckCircle2, SkipForward, X, PartyPopper, Circle } from 'lucide-react';
import { buildFocusQueue, type FocusQueueTask } from '@/lib/focusQueue';
import { getTimerState } from '@/lib/taskTimer';

export interface FocusModeTask extends FocusQueueTask {
  text: string;
  steps?: string[];
  stepsCompleted?: boolean[];
  estimatedMinutes?: number;
}

interface FocusModeProps {
  tasks: FocusModeTask[];
  onComplete: (id: string) => void;
  onToggleStep: (taskId: string, stepIndex: number) => void;
  onExit: () => void;
}
```

- [ ] **Step 2: Add elapsed-time tracking that resets per task**

Change the component signature and add timer state (current lines 15-22):

```tsx
const FocusMode: React.FC<FocusModeProps> = ({ tasks, onComplete, onExit }) => {
  // Sorted once on mount — a point-in-time snapshot, not live-synced to the
  // parent's task list while focus mode is open (see plan's Global Constraints).
  const [queue, setQueue] = useState<FocusModeTask[]>(() => buildFocusQueue(tasks));
  const [justFinished, setJustFinished] = useState(false);

  const total = useMemo(() => queue.length, []); // fixed at mount for a stable "X of N" denominator
  const current = queue[0];
```

to:

```tsx
const FocusMode: React.FC<FocusModeProps> = ({ tasks, onComplete, onToggleStep, onExit }) => {
  // Sorted once on mount — a point-in-time snapshot, not live-synced to the
  // parent's task list while focus mode is open (see plan's Global Constraints).
  const [queue, setQueue] = useState<FocusModeTask[]>(() => buildFocusQueue(tasks));
  const [justFinished, setJustFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const total = useMemo(() => queue.length, []); // fixed at mount for a stable "X of N" denominator
  const current = queue[0];

  // Restart the countdown whenever the current task changes (new task id at
  // the front of the queue) — one interval for the component's lifetime,
  // reset via a ref comparison rather than tearing down/rebuilding the timer.
  const currentIdRef = useRef<string | undefined>(current?.id);
  useEffect(() => {
    if (current?.id !== currentIdRef.current) {
      currentIdRef.current = current?.id;
      setElapsedSeconds(0);
    }
  }, [current?.id]);

  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const timerState = current?.estimatedMinutes
    ? getTimerState(current.estimatedMinutes, elapsedSeconds)
    : null;
```

- [ ] **Step 3: Auto-complete when the last step is checked**

Change `handleComplete`/add a step-toggle handler (current lines 35-44):

```tsx
  const handleComplete = () => {
    if (!current) return;
    onComplete(current.id);
    advance();
  };

  const handleSkip = () => {
    if (!current) return;
    setQueue((q) => [...q.slice(1), q[0]]);
  };
```

to:

```tsx
  const handleComplete = () => {
    if (!current) return;
    onComplete(current.id);
    advance();
  };

  const handleSkip = () => {
    if (!current) return;
    setQueue((q) => [...q.slice(1), q[0]]);
  };

  const handleToggleStep = (stepIndex: number) => {
    if (!current) return;
    onToggleStep(current.id, stepIndex);

    const updatedCompleted = (current.stepsCompleted ?? []).map((done, i) => (i === stepIndex ? !done : done));
    const allDone = updatedCompleted.length > 0 && updatedCompleted.every(Boolean);
    if (allDone) {
      handleComplete();
    } else {
      // Reflect the toggle in the local queue snapshot immediately (onToggleStep
      // updates the parent's real state asynchronously via setTasks) so the
      // checklist doesn't visually lag a render behind the click.
      setQueue((q) => q.map((t, i) => (i === 0 ? { ...t, stepsCompleted: updatedCompleted } : t)));
    }
  };
```

- [ ] **Step 4: Render the step checklist and countdown ring in the task card**

Change the main card JSX (current lines 56-84):

```tsx
  return (
    <div className="bg-slate-800 border border-orange-500/30 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-orange-300 font-medium">
          Task {total - queue.length + 1} of {total}
        </span>
        <button onClick={onExit} className="text-slate-400 hover:text-white p-1" title="Exit focus mode">
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-2xl font-bold text-white text-center py-4">{current.text}</p>

      <div className="flex flex-col gap-2">
        <button
          onClick={handleComplete}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-4 flex items-center justify-center gap-2 text-lg font-semibold transition"
        >
          <CheckCircle2 className="w-6 h-6" /> Done
        </button>
        <button
          onClick={handleSkip}
          className="w-full text-slate-400 hover:text-white text-sm py-2 flex items-center justify-center gap-1.5 transition"
        >
          <SkipForward className="w-3.5 h-3.5" /> Skip for now
        </button>
      </div>
    </div>
  );
};
```

to:

```tsx
  const ringColor = timerState
    ? { green: 'rgb(52,211,153)', yellow: 'rgb(251,191,36)', red: 'rgb(244,63,94)' }[timerState.zone]
    : null;
  const ringPct = timerState
    ? Math.max(0, Math.min(1, timerState.remainingSeconds / (current.estimatedMinutes! * 60)))
    : 0;
  const displaySeconds = timerState ? Math.abs(timerState.remainingSeconds) : 0;
  const displayLabel = timerState
    ? `${timerState.overtime ? '+' : ''}${Math.floor(displaySeconds / 60)}:${String(displaySeconds % 60).padStart(2, '0')}`
    : null;

  return (
    <div className="bg-slate-800 border border-orange-500/30 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-orange-300 font-medium">
          Task {total - queue.length + 1} of {total}
        </span>
        <button onClick={onExit} className="text-slate-400 hover:text-white p-1" title="Exit focus mode">
          <X className="w-4 h-4" />
        </button>
      </div>

      {timerState && (
        <div className="flex justify-center">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90">
              <circle cx="40" cy="40" r="34" stroke="rgb(51,65,85)" strokeWidth="6" fill="none" />
              <circle
                cx="40" cy="40" r="34" strokeWidth="6" fill="none" strokeLinecap="round"
                stroke={ringColor!}
                strokeDasharray={`${ringPct * 213.6} 213.6`}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm tabular-nums">
              {displayLabel}
            </div>
          </div>
        </div>
      )}

      <p className="text-2xl font-bold text-white text-center py-4">{current.text}</p>

      {current.steps && current.steps.length > 0 && (
        <div className="space-y-2">
          {current.steps.map((step, i) => {
            const done = current.stepsCompleted?.[i] ?? false;
            return (
              <button
                key={i}
                onClick={() => handleToggleStep(i)}
                className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border transition ${
                  done ? 'bg-emerald-900/30 border-emerald-600/40 text-emerald-200' : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-600'
                }`}
              >
                {done ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <Circle className="w-4 h-4 flex-shrink-0" />}
                <span className={done ? 'line-through opacity-70' : ''}>{step}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={handleComplete}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-4 flex items-center justify-center gap-2 text-lg font-semibold transition"
        >
          <CheckCircle2 className="w-6 h-6" /> Done
        </button>
        <button
          onClick={handleSkip}
          className="w-full text-slate-400 hover:text-white text-sm py-2 flex items-center justify-center gap-1.5 transition"
        >
          <SkipForward className="w-3.5 h-3.5" /> Skip for now
        </button>
      </div>
    </div>
  );
};
```

(The circle's circumference at `r=34` is `2 * Math.PI * 34 ≈ 213.6`, matching the existing Presence-ring pattern in `HouseholdBrain.tsx` which uses the same `strokeDasharray` percentage technique at a different radius. `ringPct` is clamped to `[0, 1]` so overtime — where `remainingSeconds` goes negative — doesn't produce a negative or >100% dash value; the ring simply stays fully "empty"/red-outlined during overtime while the numeric label shows the `+M:SS` overtime count, per the design's "gentle, not alarming" requirement.)

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "FocusMode"`
Expected: no output.

- [ ] **Step 6: Update the call site in `HouseholdBrain.tsx` to pass the new prop**

In `HouseholdBrain.tsx`, find the `<FocusMode>` usage (added by the prior Focus Mode plan):

```tsx
        <FocusMode
          tasks={filteredTasks}
          onComplete={completeTask}
          onExit={() => setFocusMode(false)}
        />
```

Change to:

```tsx
        <FocusMode
          tasks={filteredTasks}
          onComplete={completeTask}
          onToggleStep={toggleTaskStep}
          onExit={() => setFocusMode(false)}
        />
```

- [ ] **Step 7: Run typecheck again on both files**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "FocusMode\|HouseholdBrain"`
Expected: no output.

- [ ] **Step 8: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 9: Build**

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 10: Manual verification**

Requires the running app (`npm run dev`, logged in). Add a new task via the text input and confirm:
1. After the AI call resolves, the task card in list view shows a "0/N steps" badge (violet-tinted) if steps were suggested.
2. Entering Focus Mode on that task shows the step checklist under the task text, plus a countdown ring (green initially) counting down from the estimated minutes.
3. Checking off steps one at a time updates the ring's label but not zone/color changes yet (unless enough real time passes) — checking the last step auto-advances to the next task in the queue (same behavior as clicking Done) without needing to click Done separately.
4. Manually clicking Done on a task with unchecked steps still works (override), advancing normally.
5. Skip still works, un-completing nothing.
6. Leave a task open long enough (or temporarily lower an `estimatedMinutes` value via the browser's dev tools / a fresh task with a 1-minute estimate) to observe the ring shift green → yellow → red, and continue past zero showing a "+M:SS" overtime label without any alert/sound.
7. A task created before this change (no `steps`/`estimatedMinutes` in storage) still renders in Focus Mode exactly as before — no checklist, no ring, just text + Done/Skip.

- [ ] **Step 11: Commit**

```bash
git add src/components/familyos/FocusMode.tsx src/components/familyos/HouseholdBrain.tsx
git commit -m "feat(focus-mode): add step checklist and color-coded countdown ring"
```

---

## Self-Review Notes

- **Spec coverage:** step creation via extended AI call (Task 2), list-view badge (Task 2), Focus Mode checklist + auto-complete-on-last-step (Task 3), countdown timer with green/yellow/red zones + overtime (Task 1 + Task 3) — all covered. Explicitly out of scope per the design doc (retheming these two files, sound/notification on timer expiry, a dedicated task-edit modal) — no task attempts these.
- **Placeholder scan:** no TBD/TODO/vague-instruction language found on review.
- **Type consistency:** `FocusModeTask` (Task 3) extends `FocusQueueTask` with `text`, `steps`, `stepsCompleted`, `estimatedMinutes` — matching `HouseholdBrain.tsx`'s extended `Task` interface (Task 2) field-for-field, so passing `filteredTasks` directly as `FocusMode`'s `tasks` prop remains adapter-free, same pattern as the original Focus Mode plan. `onToggleStep`'s signature (`taskId: string, stepIndex: number`) matches between `FocusModeProps` (Task 3) and `HouseholdBrain.tsx`'s `toggleTaskStep` (Task 2).
- **Backward compatibility:** every new field is optional; a pre-existing stored task (or a newly created one where the AI call fails/returns malformed data) has `steps`/`stepsCompleted`/`estimatedMinutes` all `undefined`, and every new render branch in both files is gated on those fields being present — verified by re-reading Task 3 Step 4's JSX, where the step checklist and countdown ring blocks are both conditional (`{current.steps && ... }`, `{timerState && ...}`).
