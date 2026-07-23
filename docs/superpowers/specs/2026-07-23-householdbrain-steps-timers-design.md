# HouseholdBrain Step-Chunking & Color-Coded Timers — Design

## Goal

Add the two remaining ADHD-first mechanics from the original design-system handoff, building on top of Focus Mode (already shipped): breaking a task into 2-4 concrete steps, and a color-coded (green→yellow→red) work-session countdown timer shown in Focus Mode.

## Why

Focus Mode already removes the "what do I do next" decision. Steps and a timer remove two more: "how do I start this" (a vague task like "clean the garage" is itself a wall; 3 concrete steps aren't) and "how long is this going to take" (time-blindness is a common ADHD friction point — a visible, color-shifting countdown gives an external sense of pacing without requiring the user to self-monitor).

## Data model

Extend the existing `Task` interface in `HouseholdBrain.tsx`:

```ts
interface Task {
  // ...existing fields unchanged...
  steps?: string[];            // 2-4 short strings, AI-suggested at add time, user-editable
  stepsCompleted?: boolean[];  // parallel array (same length/order as steps), per-step check state
  estimatedMinutes?: number;   // AI-suggested default at add time, editable in Focus Mode before starting
}
```

All three fields are optional — a task with none of them behaves exactly as it does today (plain text, Done button, no timer). This is additive, not a breaking change to existing stored tasks.

## Step creation

`addTask()`'s existing single AI call (already made for category/priority/person) is extended to also return `steps` and `estimatedMinutes` in the same JSON response — no second AI round-trip. If the AI call fails or returns malformed data, the task is created with no steps/estimate (identical to today's task-without-steps behavior), not blocked or retried.

Steps and the estimate are editable after creation — exact edit UI (inline in list view vs. a small edit affordance) is an implementation detail for the plan, not pinned down further here, but must exist since AI suggestions won't always be right.

## Where steps appear

- **List view:** a small "N steps" badge, matching the existing badge-row visual pattern (same row as person/category/due-date badges). Not expandable here — collapsed summary only.
- **Focus Mode:** if the current task has `steps`, they render as a checklist under the task text (checkbox + label per step) instead of just plain task text. Tasks without steps show exactly as Focus Mode already renders them today (just the text, Done/Skip buttons).

## Step-to-completion relationship

Checking the last remaining step in Focus Mode automatically triggers the same completion path as clicking Done (calls the parent's existing `completeTask`, unchanged — points/recurrence logic untouched). The Done button remains visible and functional at all times, both for tasks without steps and as a manual override for tasks with steps.

## Timer

- **Purpose:** a work-session countdown (Pomodoro-style "how long should this take"), not a due-date countdown — independent of the existing due-date badge system, which stays as-is.
- **Starts automatically** when a task becomes the current one in Focus Mode's queue.
- **Duration:** `estimatedMinutes` from the task (AI-suggested default, e.g. 15), editable via a small +/- control shown before/during the countdown.
- **Visual:** a circular countdown ring, color-coded by remaining-time zone: green (>50% of estimate remaining), yellow (20-50% remaining), red (<20% remaining or already at/past zero).
- **At zero:** the ring turns/stays red and the timer continues counting *up* past zero (shown as overtime, e.g. "+2:14") rather than stopping, alerting, or blocking further interaction — gentle, not punitive, matching the project's established positive-framing principle (same reasoning already applied to the "Late" stat reframe in the earlier Dashboard retheme work).
- **Resets** when advancing to the next task in the queue (new task, fresh countdown from its own `estimatedMinutes`).

## New library code

**Create: `src/lib/taskTimer.ts`** — pure, independently-testable logic:
- A function computing remaining seconds and color zone (`'green' | 'yellow' | 'red'`) given `estimatedMinutes` and elapsed seconds.
- Overtime handling (elapsed > estimate) returns negative remaining / `'red'` zone rather than clamping at zero or throwing.
- No timer/interval logic itself lives here — this module is the pure math; the interval/tick mechanism lives in the `FocusMode` component, same separation of concerns as `focusQueue.ts` (pure sort logic) vs. `FocusMode.tsx` (the stateful component that uses it).

## Testing

- `taskTimer.ts`'s zone-calculation and overtime logic gets unit tests (green/yellow/red boundaries, overtime), same pattern as `focusQueue.test.ts`.
- Step-completion-triggers-auto-complete and steps-badge-rendering are UI/interaction behavior, covered by manual verification in the implementation plan rather than unit tests, consistent with how Focus Mode's own UI behavior was verified.

## Explicitly out of scope

- Any change to `completeTask`'s points/recurrence logic, or to the due-date badge system.
- Editing steps/estimate outside of task creation + Focus Mode (e.g. no dedicated "edit task" modal is being introduced here beyond what's needed for these two fields).
- Any sound/vibration/notification when the timer hits zero — visual-only (red ring), per the "gentle, not alarming" requirement.
- Retheming `HouseholdBrain.tsx`/`FocusMode.tsx` to the honey/bark palette — both remain in this file's current slate/orange styling, consistent with the prior Focus Mode plan's explicit scope boundary.
