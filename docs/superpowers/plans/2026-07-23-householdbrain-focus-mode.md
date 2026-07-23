# HouseholdBrain Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-task-at-a-time "Focus Mode" to `HouseholdBrain.tsx` — the first ADHD-first mechanic from the original design-system handoff (step-chunking and color-coded timers are separate, out-of-scope future work). A toggle button swaps the current tab's task list for a single-task card with a progress counter, a large complete action, and a skip option.

**Architecture:** A new, self-contained `FocusMode.tsx` component takes the current tab's already-filtered task array as a prop and manages its own local queue (sorted priority-then-due-date, shrinking as tasks are completed or skipped). It calls back into `HouseholdBrain.tsx`'s existing, unmodified `completeTask` for actual completion (points/recurrence logic untouched) and an `onExit` callback when the queue empties or the user exits manually. The sort/queue-building logic is extracted as a plain, independently testable function.

**Tech Stack:** Existing React/TypeScript/Tailwind stack, no new dependencies.

## Global Constraints

- **No changes to the `Task` interface, storage format (`KEYS.tasks` / `saveJSON`), or `completeTask`'s points/recurrence logic.** Focus mode is a new rendering mode over existing data, not a data-model change.
- **`HouseholdBrain.tsx` is currently untouched by the app's honey/bark/cream/sage retheme** (it was explicitly out of scope in that work) — it still uses slate/orange/rose styling throughout. This plan's new component matches `HouseholdBrain.tsx`'s *current* styling (slate/orange), not the honey palette used elsewhere in the app, so this change doesn't create a new mismatch to sort out later. Retheming this file is separate, future work.
- **Focus mode's queue is a point-in-time snapshot** taken when focus mode is opened — it does not live-sync if tasks are added/removed elsewhere while it's open. This is an intentional simplicity choice from the design, not an oversight.
- **Skip does not mark a task completed** — it only reorders the local queue (moves the task to the back), leaving `completeTask`/parent state completely untouched until the user explicitly completes something.

---

## File Structure

- **Create:** `src/lib/focusQueue.ts` — pure function(s) for sorting tasks into focus-mode order; independently unit-testable.
- **Create:** `src/components/familyos/FocusMode.tsx` — the single-task card UI, queue state, skip/complete/exit behavior.
- **Modify:** `src/components/familyos/HouseholdBrain.tsx` — add a `focusMode` toggle button in the tab-bar row and conditionally render `<FocusMode>` in place of the task-list block.

---

### Task 1: Extract and test the focus-queue ordering logic

**Files:**
- Create: `src/lib/focusQueue.ts`
- Test: `src/lib/focusQueue.test.ts`

**Interfaces:**
- Produces: `buildFocusQueue(tasks: FocusQueueTask[]): FocusQueueTask[]` — sorts by priority (High > Medium > Low) then soonest `dueDate` (nulls last) — consumed by `FocusMode.tsx` in Task 2.
- `FocusQueueTask` is a minimal shape (`{ id: string; priority: string; dueDate?: number | null }`) rather than importing `HouseholdBrain.tsx`'s full `Task` interface, so this module has no dependency on that file and stays independently testable/reusable.

- [ ] **Step 1: Write the failing test**

Create `src/lib/focusQueue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFocusQueue, type FocusQueueTask } from './focusQueue';

describe('buildFocusQueue', () => {
  it('sorts High priority before Medium before Low', () => {
    const tasks: FocusQueueTask[] = [
      { id: '1', priority: 'Low', dueDate: null },
      { id: '2', priority: 'High', dueDate: null },
      { id: '3', priority: 'Medium', dueDate: null },
    ];
    expect(buildFocusQueue(tasks).map(t => t.id)).toEqual(['2', '3', '1']);
  });

  it('within the same priority, sorts soonest dueDate first', () => {
    const tasks: FocusQueueTask[] = [
      { id: 'later', priority: 'Medium', dueDate: 2000 },
      { id: 'sooner', priority: 'Medium', dueDate: 1000 },
    ];
    expect(buildFocusQueue(tasks).map(t => t.id)).toEqual(['sooner', 'later']);
  });

  it('sorts tasks with no dueDate after tasks with a dueDate, within the same priority', () => {
    const tasks: FocusQueueTask[] = [
      { id: 'no-date', priority: 'Medium', dueDate: null },
      { id: 'has-date', priority: 'Medium', dueDate: 5000 },
    ];
    expect(buildFocusQueue(tasks).map(t => t.id)).toEqual(['has-date', 'no-date']);
  });

  it('does not mutate the input array', () => {
    const tasks: FocusQueueTask[] = [
      { id: '1', priority: 'Low', dueDate: null },
      { id: '2', priority: 'High', dueDate: null },
    ];
    const original = [...tasks];
    buildFocusQueue(tasks);
    expect(tasks).toEqual(original);
  });

  it('returns an empty array for an empty input', () => {
    expect(buildFocusQueue([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/focusQueue.test.ts`
Expected: FAIL — `Cannot find module './focusQueue'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/focusQueue.ts`:

```ts
export interface FocusQueueTask {
  id: string;
  priority: string;
  dueDate?: number | null;
}

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export function buildFocusQueue<T extends FocusQueueTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const rankDiff = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (rankDiff !== 0) return rankDiff;

    const aDate = a.dueDate ?? Infinity;
    const bDate = b.dueDate ?? Infinity;
    return aDate - bDate;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/focusQueue.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: all previously-passing tests still pass, plus the 5 new `focusQueue` tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/focusQueue.ts src/lib/focusQueue.test.ts
git commit -m "feat(focus-mode): add priority/due-date focus queue ordering"
```

---

### Task 2: Build the FocusMode component

**Files:**
- Create: `src/components/familyos/FocusMode.tsx`

**Interfaces:**
- Consumes: `buildFocusQueue` from `src/lib/focusQueue.ts` (Task 1).
- Produces: `FocusMode` component with props `{ tasks: Task[]; onComplete: (id: string) => void; onExit: () => void }`, where `Task` is a local, minimal-but-compatible shape (see Step 1) — consumed by `HouseholdBrain.tsx` in Task 3, which passes its own `Task` objects and its existing `completeTask` function directly (structurally compatible, no adapter needed).

- [ ] **Step 1: Write the component**

Create `src/components/familyos/FocusMode.tsx`:

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

const FocusMode: React.FC<FocusModeProps> = ({ tasks, onComplete, onExit }) => {
  // Sorted once on mount — a point-in-time snapshot, not live-synced to the
  // parent's task list while focus mode is open (see plan's Global Constraints).
  const [queue, setQueue] = useState<FocusModeTask[]>(() => buildFocusQueue(tasks));
  const [justFinished, setJustFinished] = useState(false);

  const total = useMemo(() => queue.length, []); // fixed at mount for a stable "X of N" denominator
  const current = queue[0];

  const advance = () => {
    setQueue((q) => {
      const next = q.slice(1);
      if (next.length === 0) {
        setJustFinished(true);
        setTimeout(onExit, 1500);
      }
      return next;
    });
  };

  const handleComplete = () => {
    if (!current) return;
    onComplete(current.id);
    advance();
  };

  const handleSkip = () => {
    if (!current) return;
    setQueue((q) => [...q.slice(1), q[0]]);
  };

  if (justFinished || !current) {
    return (
      <div className="bg-slate-800 border border-emerald-500/30 rounded-2xl p-10 text-center">
        <PartyPopper className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
        <p className="text-xl font-bold text-white">All done!</p>
        <p className="text-sm text-slate-400 mt-1">Nice work clearing the queue.</p>
      </div>
    );
  }

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

export default FocusMode;
```

Note on the progress counter: `total` is captured once (empty dependency array) so it stays fixed at the queue's starting size even as `queue.length` shrinks — this is what makes "Task 2 of 5" count up correctly instead of the denominator shrinking alongside the numerator. `total - queue.length + 1` gives the 1-indexed position of the current task.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "FocusMode"`
Expected: no output.

- [ ] **Step 3: Run build**

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds (this component isn't wired into the app yet, but must compile standalone).

- [ ] **Step 4: Commit**

```bash
git add src/components/familyos/FocusMode.tsx
git commit -m "feat(focus-mode): add FocusMode single-task card component"
```

---

### Task 3: Wire Focus Mode into HouseholdBrain

**Files:**
- Modify: `src/components/familyos/HouseholdBrain.tsx`

**Interfaces:**
- Consumes: `FocusMode` component from `src/components/familyos/FocusMode.tsx` (Task 2), passing this file's own `filteredTasks`, `completeTask`, and a new `setFocusMode(false)` as `onExit`.
- Produces: no new exports — internal state and conditional-render change only.

**Context:** Read the full current file with the Read tool immediately before editing. `HouseholdBrain.tsx`'s `Task` interface (`id, text, priority, dueDate`, plus other fields) is structurally compatible with `FocusModeTask` (`id, priority, dueDate, text`) — no adapter/mapping needed, `filteredTasks` can be passed directly as `FocusMode`'s `tasks` prop.

- [ ] **Step 1: Import `FocusMode` and add toggle state**

Add to the imports (near the top of the file, alongside the existing `AlertModal` import):

```tsx
import FocusMode from './FocusMode';
```

Add alongside the existing `useState` declarations (near `const [showScanner, setShowScanner] = useState(false);`):

```tsx
  const [focusMode, setFocusMode] = useState(false);
```

- [ ] **Step 2: Add the Focus toggle button to the tab-bar row**

Find the existing "Overdue" button at the end of the tab-bar row:

```tsx
        <button onClick={overdueAlert} className="ml-auto bg-rose-900/40 border border-rose-500/30 text-rose-300 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Overdue
        </button>
      </div>
```

Change to (adding the Focus toggle immediately before it, inside the same flex row):

```tsx
        <button
          onClick={() => setFocusMode((f) => !f)}
          disabled={filteredTasks.length === 0}
          className={`ml-auto px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition disabled:opacity-40 disabled:cursor-not-allowed ${
            focusMode ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Focus
        </button>
        <button onClick={overdueAlert} className="bg-rose-900/40 border border-rose-500/30 text-rose-300 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Overdue
        </button>
      </div>
```

(Moved `ml-auto` from the Overdue button to the new Focus button, since Focus now comes first in the row and needs to be the one pushed right; Overdue follows immediately after without its own `ml-auto`. Focus mode is disabled when there are no tasks in the current tab, since there'd be nothing to focus on — same "All clear here" empty state already handles that case in list view.)

- [ ] **Step 3: Conditionally render FocusMode in place of the task list**

Find the existing task-list block:

```tsx
      {/* Task list */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
```

Change to:

```tsx
      {/* Task list */}
      {focusMode ? (
        <FocusMode
          tasks={filteredTasks}
          onComplete={completeTask}
          onExit={() => setFocusMode(false)}
        />
      ) : (
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
```

And find the closing of that same block (the end of the task-list `<div>`, right before the component's final `</div>` and closing brace):

```tsx
          })
        )}
      </div>
    </div>
  );
};
```

Change to:

```tsx
          })
        )}
      </div>
      )}
    </div>
  );
};
```

(This wraps the existing list-rendering block in a conditional without touching any of its internals — `filteredTasks.map(...)`, the empty state, and every task-card element stay byte-for-byte the same; only whether that whole block or `<FocusMode>` renders is new.)

- [ ] **Step 4: Exit focus mode automatically when switching tabs**

Since `filteredTasks` changes when `tab` changes, and focus mode's queue is a point-in-time snapshot (per Global Constraints), leaving focus mode open while switching tabs would show a stale queue from the previous tab. Add a `useEffect` alongside the component's other effects:

```tsx
  useEffect(() => {
    setFocusMode(false);
  }, [tab]);
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "HouseholdBrain"`
Expected: no output.

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass (no existing `HouseholdBrain.tsx` tests are affected, since `completeTask`/`filteredTasks`/tab logic are unmodified).

- [ ] **Step 7: Build**

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 8: Manual verification**

Requires the running app (`npm run dev`, logged in, on the Household tab with at least 2-3 open tasks, ideally with mixed priorities). Confirm:
1. Clicking "Focus" swaps the task list for a single-task card showing the highest-priority (or soonest-due) task first, with a "Task 1 of N" counter.
2. Clicking "Done" completes that task (verify it actually leaves the underlying list — exit focus mode and confirm the task is gone/marked complete, points awarded as before) and advances to the next task, counter updating to "Task 2 of N".
3. Clicking "Skip for now" moves to the next task without completing the skipped one — exit focus mode and confirm the skipped task is still open in the list.
4. Completing/skipping through the entire queue shows the "All done!" celebration, then automatically returns to list view after ~1.5s.
5. The manual "X" exit button in the focus card returns to list view immediately at any point.
6. Switching tabs while focus mode is open exits focus mode automatically (no stale queue shown).
7. The Focus button is disabled (grayed out, unclickable) when the current tab has zero open tasks.

- [ ] **Step 9: Commit**

```bash
git add src/components/familyos/HouseholdBrain.tsx
git commit -m "feat(focus-mode): wire Focus toggle and single-task view into HouseholdBrain"
```

---

## Self-Review Notes

- **Spec coverage:** all sections of the design doc covered — queue ordering (Task 1), single-task card UI with progress/skip/complete (Task 2), toggle + integration + tab-switch safety (Task 3). Explicitly out of scope per the design doc (step-chunking, color-coded timers, live-syncing the queue) — no task attempts these.
- **Placeholder scan:** no TBD/TODO/vague-instruction language found on review.
- **Type consistency:** `FocusQueueTask` (Task 1) is a strict subset of `FocusModeTask` (Task 2, adds `text`), and `HouseholdBrain.tsx`'s own `Task` interface (already has `id, text, priority, dueDate` among other fields) structurally satisfies `FocusModeTask` without any adapter — verified by reading the existing `Task` interface before writing Task 3.
- **No data-model or storage changes anywhere in this plan** — `completeTask`, `Task`, `KEYS.tasks` are all read, never modified.
