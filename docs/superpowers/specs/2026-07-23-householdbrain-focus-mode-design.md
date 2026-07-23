# HouseholdBrain Focus Mode — Design

## Goal

Add a one-task-at-a-time "Focus Mode" to `HouseholdBrain.tsx` (the household task/chore list) — the first of the ADHD-first mechanics flagged as missing in the original design-system handoff. Reduces cognitive load by showing exactly one task instead of a full list, with a large complete action, a skip option, and a visible progress counter.

This pass is scoped to **focus mode only** — step-chunking (breaking a task into 2-4 sub-steps) and color-coded countdown timers are explicitly out of scope, left as separate future work if wanted.

## Why

The current task list shows every open task in the active tab at once. For an ADHD user, a flat list of N tasks is itself a source of overwhelm — deciding what to do next is its own executive-function cost. Focus mode removes that decision entirely: the app picks the next task (priority, then soonest due), shows only that one, and the user's only choices are "done" or "skip."

## Data model

**No changes.** Focus mode operates entirely on the existing `Task[]` array and the existing `completeTask(id)` function in `HouseholdBrain.tsx` — it doesn't add fields, doesn't change storage, and doesn't touch points/recurrence logic (both already live correctly in `completeTask`).

## Components

**Create: `src/components/familyos/FocusMode.tsx`**

```ts
interface FocusModeProps {
  tasks: Task[];           // already-filtered queue from the parent (current tab's filteredTasks)
  onComplete: (id: string) => void;  // parent's existing completeTask
  onExit: () => void;
}
```

- Internally sorts the incoming `tasks` prop once on mount: `priority` (High > Medium > Low) then soonest `dueDate` (tasks with no due date sort last).
- Owns a local `queue: Task[]` (the sorted copy, shrinking as tasks are skipped/completed) and `justCompleted: boolean` (for the brief celebration state).
- Skip: removes the current task from the local `queue` and advances — does NOT mark it completed or touch parent state at all, purely a local "come back to this later" reorder.
- Complete: calls `onComplete(id)` (parent's real `completeTask`, unchanged), then removes it from the local queue and advances.
- When `queue` is empty: renders a brief "All done!" celebratory state (checkmark icon + encouraging copy, honey/sage accent) for ~1.5s via a `setTimeout`, then calls `onExit()` automatically.
- If `tasks` prop changes while focus mode is open (e.g. a new task added elsewhere) — out of scope for this pass to reconcile; focus mode's local queue is a point-in-time snapshot taken at open time, matching the "one clear thing to do" simplicity goal rather than trying to live-sync a queue mid-session.

**Modify: `src/components/familyos/HouseholdBrain.tsx`**

- Add `const [focusMode, setFocusMode] = useState(false);` alongside existing state.
- Add a "Focus" toggle button in the existing tab-bar row (next to the "Overdue" button, using the existing `bg-orange-900/40 border border-orange-500/30 text-orange-300` pill style already used there, swapped for the honey-token equivalent already established elsewhere in this codebase's retheme).
- When `focusMode` is true, render `<FocusMode tasks={filteredTasks} onComplete={completeTask} onExit={() => setFocusMode(false)} />` in place of the existing task-list `<div>` block (lines ~463-515) — the tab bar and "Add task" input above it stay visible/functional; only the list-vs-focus-card area swaps.
- No changes to `completeTask`, `deleteTask`, `filteredTasks`, tab switching, or any other existing behavior.

## Focus card contents

- Task text, large and prominent (the single most important thing on screen).
- Progress indicator: "Task 2 of 5" style counter, updating as the queue shrinks.
- Large complete button (bigger than the small checkmark icon used in list view) — primary visual focus of the card.
- Smaller "Skip for now" button/link below or beside the complete button — clearly secondary, not competing for attention.
- Explicitly NOT shown: priority/category/due badges (kept off per your selection, to keep the card visually decluttered rather than replicating list-view chrome).

## Testing

- `FocusMode.tsx`'s sort/queue logic (priority-then-due-date ordering, skip-doesn't-complete, queue-empties-triggers-exit) is pure/testable logic separable from the JSX shell — the implementation plan should extract that ordering function so it has a unit test independent of rendering.
- No changes to existing `HouseholdBrain.tsx` tests are anticipated since `completeTask`/`filteredTasks`/tab behavior are untouched; a new manual-verification pass (click through: enter focus, complete a task, skip a task, empty the queue, exit) covers the new UI itself since it's JSX/interaction, not pure logic.

## Explicitly out of scope

- Step-chunking (multi-step tasks) — separate future spec.
- Color-coded countdown timers — separate future spec.
- Live-updating the focus queue if tasks change elsewhere while focus mode is open — snapshot-at-open-time is intentional for this pass.
- Any change to `Task`'s data shape, storage, or `completeTask`'s points/recurrence behavior.
