# Hermes Generic Action Registry

## Problem

A user asked Hermes to clear the week's meal plan and Hermes said he couldn't — meal-plan clearing was never one of his hardcoded actions. Investigating surfaced the real gap: `HermesChat.tsx` hardcodes exactly 13 `ActionType` values (`addTask`, `completeTask`, `addShopping`, `addBill`, `addAppointment`, `addPromise`, `logEmotion`, `updateMemory`, and their complete/delete counterparts), each with its own hand-written `if` block in `executeAction`. The app has **24 distinct list-shaped local data domains** (shopping, homework, grades, allowance, medications, pet log, home maintenance, car maintenance, budget, expenses, bucket list, watchlist, games, family messages, ask-parents, moments, quality activities, and more — full catalog below), only 6 of which Hermes can touch today. The user's expectation — "he should be able to functionally change anything in the app" — requires closing that gap for all of them, not adding one more hardcoded case.

## Scope

- **In scope:** every list-shaped (array-of-items) storage domain in the app gets add/update/delete/clear support in Hermes, via one generic mechanism instead of per-domain hand-written code. Plus 3 named actions for flows that aren't plain CRUD: clearing the week's meal plan, marking a meal cooked (real servings-scaling + pantry-decrement logic), and adding a car maintenance entry (nested array).
- **Out of scope:** no new storage layer, no schema migration, no changes to any UI component — every domain keeps rendering exactly as it does today, Hermes just gets a second way to read/write the same `localStorage` keys via the same `loadJSON`/`saveJSON` helpers already in use. No confirmation-step UX for destructive actions (matches existing instant-execute pattern for `deleteTask` etc.). No AI-suggestion or shortfall-calculation logic exposed generically — those stay UI-only except where a named action explicitly wraps them (mark-cooked).

## Domain Catalog

24 domains cataloged from `src/components/familyos/**/*.tsx` and `src/lib/familyos.ts`. 22 are plain arrays and go in the generic registry; 2 (`familyos_meals`, `familyos_cars`) have shapes the generic mechanism can't safely handle and are excluded (see Named Actions below).

| Domain | Storage Key | Match Field | Fields |
|---|---|---|---|
| tasks | `household_tasks` | text | text, person, priority, category, dueEstimate, dueDate |
| shopping | `familyos_shopping` | name | name, category, assignedTo, quantity |
| bills | `familyos_bills` | name | name, amount, dueDate, recurring |
| promises | `family_promises` | text | text, person, priority, dueDate |
| emotions | `emotion_logs` | feeling | person, feeling, context, intensity, category |
| appointments | `familyos_appointments` | type | person, type, doctor, date, notes |
| pantry | `familyos_pantry` | name | name, quantity, unit, category |
| messages | `familyos_messages` | text | author, text |
| askParents | `familyos_ask_parents` | request | kid, request, status |
| moments | `familyos_moments` | caption | caption, emoji, date, author |
| bucketList | `familyos_bucket_list` | text | text |
| watchlist | `familyos_watchlist` | title | title, type, wantsToWatch |
| games | `familyos_games` | name | name |
| medications | `familyos_medications` | name | person, name, dosage, frequency, nextRefill, notes |
| petLog | `familyos_lucy` | type | type, date, notes, nextDue |
| homework | `familyos_homework` | task | kid, subject, task, dueDate, status |
| grades | `familyos_grades` | subject | kid, subject, grade, date, notes |
| kidsActivities | `familyos_activities_kids` | name | kid, name, day, time, location |
| allowance | `familyos_allowance` | reason | kid, amount, type, reason, date |
| expenses | `familyos_expenses` | notes | amount, category, paidBy, date, notes |
| budget | `familyos_budget` | name | name, budgeted, month |
| homeMaintenance | `familyos_home_maintenance` | item | item, category, lastDone, nextDue, notes |
| qualityActivities | `quality_activities` | name | name, person, duration, scheduledAt |

**Excluded (named actions instead):**
- `familyos_meals` — not an array; `Record<Day, DayPlan>` keyed by weekday. "Clear" means reset all 7 days to empty, not empty an array.
- `familyos_cars` — array of cars, each with a *nested* `entries[]` array of maintenance records. Generic single-level CRUD can't address "add a maintenance entry to car #2."

## Architecture

```
HermesChat.tsx (buildSystemPrompt, executeAction)
        │
        ├── generic path ──────────────────────────────┐
        │   action.type === 'genericAction'             │
        │   params: { domain, op, ...fields }            │
        ▼                                                ▼
src/lib/hermesActions.ts                    DOMAIN_REGISTRY: DomainSpec[]
  runGenericAction(domain, op, params)  ───► (24 entries, one per table row above)
        │
        │ loadJSON/saveJSON (existing helpers, unchanged)
        ▼
   localStorage[storageKey]

        └── named-action path (unchanged pattern) ──────┐
            clearWeekMeals, markMealCooked,               │
            addCarMaintenanceEntry                         │
            → hand-written, same as today's addTask etc.   │
```

### `src/lib/hermesActions.ts` (new file)

```ts
export interface DomainSpec {
  domain: string;
  storageKey: string;
  matchField: string;
  fields: string[];
}

export const DOMAIN_REGISTRY: DomainSpec[] = [
  { domain: 'shopping', storageKey: 'familyos_shopping', matchField: 'name',
    fields: ['name', 'category', 'assignedTo', 'quantity'] },
  // ...21 more, directly from the catalog table above
];

function pick(obj: Record<string, any>, keys: string[]) {
  const out: Record<string, any> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function runGenericAction(
  domain: string, op: 'add' | 'update' | 'delete' | 'clear', params: Record<string, any>
): { result: string; ok: boolean } {
  const spec = DOMAIN_REGISTRY.find((d) => d.domain === domain);
  if (!spec) return { result: `Unknown domain: "${domain}"`, ok: false };

  if (op === 'clear') {
    saveJSON(spec.storageKey, []);
    return { result: `Cleared ${spec.domain}`, ok: true };
  }

  const items = loadJSON<any[]>(spec.storageKey, []);

  if (op === 'add') {
    const item = { id: uid(), createdAt: Date.now(), source: 'hermes', ...pick(params, spec.fields) };
    saveJSON(spec.storageKey, [item, ...items]);
    return { result: `Added to ${spec.domain}: "${item[spec.matchField] ?? item.id}"`, ok: true };
  }

  // update/delete both locate by fuzzy match against matchField, same
  // pattern as today's completeTask/deleteTask (params.match, case-insensitive includes)
  const match = (params.match || '').toLowerCase();
  const idx = items.findIndex(
    (i) => i.id === params.id || String(i[spec.matchField] ?? '').toLowerCase().includes(match)
  );
  if (idx === -1) return { result: `No ${spec.domain} item matching "${params.match}"`, ok: false };

  if (op === 'delete') {
    const [removed] = items.splice(idx, 1);
    saveJSON(spec.storageKey, items);
    return { result: `Removed from ${spec.domain}: "${removed[spec.matchField] ?? removed.id}"`, ok: true };
  }

  // update
  items[idx] = { ...items[idx], ...pick(params, spec.fields) };
  saveJSON(spec.storageKey, items);
  return { result: `Updated ${spec.domain}: "${items[idx][spec.matchField] ?? items[idx].id}"`, ok: true };
}
```

Deliberately **not** using each domain's `deletedAt`-based soft-delete convention that some sections use for their own UI (undo/trash patterns) — `runGenericAction`'s delete does a hard splice, matching the simpler behavior of today's `deleteTask`. This is a real, intentional inconsistency with a few domains' own UI-level soft-delete, documented so it isn't mistaken for an oversight; reconciling it is out of scope (see Open Questions).

### Named actions (3 new, same hand-written pattern as existing `ActionType`s)

- **`clearWeekMeals`**: `params: {}`. Resets `familyos_meals` to `defaultPlan()` — same shape `MealPlanner.tsx` already produces for a fresh week. This is the action that directly fixes the reported bug.
- **`markMealCooked`**: `params: { day, meal }`. Calls the exact same logic already implemented in `MealPlanner.tsx`'s `markCooked` handler (scale by servings, `decrementPantry`, `savePantry`, stamp `cookedAt`) — factored out so both the UI button and Hermes call one shared function instead of duplicating the math.
- **`addCarMaintenanceEntry`**: `params: { carMatch, type, date, mileage, notes }`. Finds the car by fuzzy name match, pushes into its nested `entries[]`.

### `HermesChat.tsx` changes

- `ActionType` union gains `'genericAction' | 'clearWeekMeals' | 'markMealCooked' | 'addCarMaintenanceEntry'`.
- `executeAction` gains one new branch: `if (action.type === 'genericAction') return runGenericAction(p.domain, p.op, p.params ?? p);` plus 3 small branches for the named actions.
- `buildSystemPrompt`'s `AVAILABLE ACTIONS` block gains:
  ```
  genericAction: {type, params: {domain, op: add|update|delete|clear, ...fields}}
    domains: shopping, bills, homework, grades, allowance, medications, petLog,
    homeMaintenance, budget, expenses, bucketList, watchlist, games, messages,
    askParents, moments, qualityActivities, promises(existing), appointments(existing),
    emotions(existing), tasks(existing), pantry
  clearWeekMeals: {type, params: {}}
  markMealCooked: {type, params: {day, meal}}
  addCarMaintenanceEntry: {type, params: {carMatch, type, date, mileage, notes}}
  ```
  (existing `addTask`/`completeTask`/etc. entries stay as-is for backward compatibility and because they're already well-tuned — no need to migrate them onto the generic path)

## Data flow / error handling

- `runGenericAction` never throws — unknown domain, no match, and missing fields all return `{ok: false, result: "..."}`, matching `executeAction`'s existing try/catch-and-report pattern.
- No new field validation beyond `pick()` (only known fields get written) — same trust level as existing actions, which also accept whatever shape the AI sends.
- No confirmation step for `clear`/`delete` — instant-execute, consistent with every existing destructive action today. A chat message showing what was cleared/deleted (via the existing `ExecutedAction` card UI) is the only safety net, same as today.

## Testing

- `src/lib/hermesActions.test.ts`: unit tests for `runGenericAction` against a couple of representative registry entries (one simple domain like `bucketList`, one with more fields like `homework`) covering add/update/delete/clear and the not-found paths. Mocks `localStorage` the same way `familyos.pantry.test.ts` already does.
- `DOMAIN_REGISTRY` completeness isn't unit-tested beyond a smoke test (`expect(DOMAIN_REGISTRY.length).toBe(22)`) — the catalog above is the source of truth, verified by hand during implementation.
- `clearWeekMeals`, `markMealCooked`, `addCarMaintenanceEntry` are tested the same way existing named actions are (none currently have dedicated tests — `executeAction`'s branches are exercised only through the running app). Consistent with existing test coverage; not introducing a new testing gap.

## Open Questions (flagged, not blocking)

1. **Soft-delete inconsistency**: several domains (shopping, homework, moments, etc.) have their own UI-level `deletedAt` soft-delete/undo convention; `runGenericAction`'s delete hard-splices instead. This means a Hermes-initiated delete won't show up in that domain's "recently deleted" UI if one exists. Not reconciled here — would require auditing each domain's soft-delete semantics individually, a separate scoped effort.
2. **No confirmation on destructive ops** — explicitly decided against for consistency with existing behavior, but worth revisiting if a "clear shopping list" mistake actually happens in practice.
