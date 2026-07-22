# Hermes Generic Action Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Hermes (the in-app AI assistant, `src/components/familyos/HermesChat.tsx`) the ability to add/update/delete/clear items in all 22 remaining list-shaped local data domains via one generic registry-driven mechanism, plus two named actions (`markMealCooked`, `addCarMaintenanceEntry`) for flows with real business logic a generic CRUD can't express.

**Architecture:** A new `src/lib/hermesActions.ts` module exports a `DOMAIN_REGISTRY` array (22 entries, one per storage key) and a single `runGenericAction(domain, op, params)` function that does the load/mutate/save using the existing `loadJSON`/`saveJSON`/`uid` helpers from `src/lib/familyos.ts`. `HermesChat.tsx` gains one new `ActionType` (`'genericAction'`) that dispatches into this function, plus two named actions with their own hand-written logic. `clearWeekMeals` (the third named action from the spec) is already shipped from a prior session and is not part of this plan.

**Tech Stack:** TypeScript, React, Vitest (`environment: 'node'` — no jsdom, no real `localStorage` global; tests must shim it).

## Global Constraints

- No new storage layer, no schema migration — every domain keeps using its existing `localStorage` key via the existing `loadJSON`/`saveJSON` from `src/lib/familyos.ts`.
- No UI component changes — this only adds a second way (Hermes) to read/write data that UI components already read/write.
- No confirmation-step UX for destructive actions — `clear`/`delete` execute instantly, matching every existing Hermes action (`deleteTask`, etc.).
- `runGenericAction`'s `delete` does a hard array-splice, not each domain's own `deletedAt` soft-delete convention — this is a deliberate, documented inconsistency (see spec's Open Questions), not a bug to fix here.
- `familyos_meals` (not an array — `Record<Day, DayPlan>`) and `familyos_cars` (array with nested `entries[]`) are excluded from `DOMAIN_REGISTRY` — they're out of scope for the generic mechanism by design.

---

## File Structure

- **Create:** `src/lib/hermesActions.ts` — `DomainSpec` interface, `DOMAIN_REGISTRY` (22 entries), `runGenericAction()`, `markMealCookedAction()`, `addCarMaintenanceEntryAction()`.
- **Create:** `src/lib/hermesActions.test.ts` — unit tests for `runGenericAction` (add/update/delete/clear/not-found paths on two representative domains) and the two named-action functions.
- **Modify:** `src/components/familyos/sections/MealPlanner.tsx` — extract the pure scale+decrement+stamp logic out of the closure-bound `markCooked` handler into an exported pure function `applyMealCooked(plan, day, meal, ingredients, fromServings, toServings)` that both the UI button and `markMealCookedAction()` call.
- **Modify:** `src/components/familyos/sections/CarMaintenance.tsx` — export `CARS_STORAGE_KEY` (currently a local `const STORAGE_KEY = 'familyos_cars'`) so `hermesActions.ts` can target the same key without hardcoding a duplicate string.
- **Modify:** `src/components/familyos/HermesChat.tsx` — add `'genericAction' | 'markMealCooked' | 'addCarMaintenanceEntry'` to `ActionType`, three new branches in `executeAction`, prompt text update, icon map update.

---

## Task 1: Domain registry + generic executor

**Files:**
- Create: `src/lib/hermesActions.ts`
- Test: `src/lib/hermesActions.test.ts`

**Interfaces:**
- Produces: `interface DomainSpec { domain: string; storageKey: string; matchField: string; fields: string[] }`
- Produces: `DOMAIN_REGISTRY: DomainSpec[]` (22 entries — exact list below)
- Produces: `runGenericAction(domain: string, op: 'add'|'update'|'delete'|'clear', params: Record<string, any>): { result: string; ok: boolean }` — consumed by Task 3 (`HermesChat.tsx`).
- Consumes: `loadJSON`, `saveJSON`, `uid` from `@/lib/familyos` (exact signatures: `loadJSON<T>(key: string, fallback: T): T`, `saveJSON(key: string, value: unknown): void`, `uid(): string`).

This task is pure TypeScript, fully testable without any UI component.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/hermesActions.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { runGenericAction, DOMAIN_REGISTRY } from './hermesActions';

// vitest.config.ts uses environment: 'node' — no real localStorage global.
// Minimal in-memory shim, reset before each test.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
});

describe('DOMAIN_REGISTRY', () => {
  it('has exactly 22 domains', () => {
    expect(DOMAIN_REGISTRY.length).toBe(22);
  });

  it('every domain has a unique name and storage key', () => {
    const domains = DOMAIN_REGISTRY.map(d => d.domain);
    const keys = DOMAIN_REGISTRY.map(d => d.storageKey);
    expect(new Set(domains).size).toBe(domains.length);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('runGenericAction', () => {
  it('returns ok:false for an unknown domain', () => {
    const result = runGenericAction('nonexistent', 'add', {});
    expect(result.ok).toBe(false);
    expect(result.result).toContain('Unknown domain');
  });

  it('adds an item to bucketList and persists it', () => {
    const add = runGenericAction('bucketList', 'add', { text: 'Visit Japan' });
    expect(add.ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('Visit Japan');
    expect(stored[0].id).toBeTruthy();
    expect(stored[0].createdAt).toBeTypeOf('number');
  });

  it('only writes fields declared in the domain spec', () => {
    runGenericAction('bucketList', 'add', { text: 'Visit Japan', notAField: 'ignored' });
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    expect(stored[0].notAField).toBeUndefined();
  });

  it('updates an item matched by fuzzy text on the domain matchField', () => {
    runGenericAction('homework', 'add', { kid: 'Sam', subject: 'Math', task: 'Fractions worksheet', dueDate: '2026-07-25', status: 'pending' });
    const update = runGenericAction('homework', 'update', { match: 'fractions', status: 'done' });
    expect(update.ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem('familyos_homework')!);
    expect(stored[0].status).toBe('done');
  });

  it('returns ok:false when update match finds nothing', () => {
    const result = runGenericAction('homework', 'update', { match: 'nope', status: 'done' });
    expect(result.ok).toBe(false);
  });

  it('deletes an item matched by fuzzy text', () => {
    runGenericAction('bucketList', 'add', { text: 'Visit Japan' });
    runGenericAction('bucketList', 'add', { text: 'Learn guitar' });
    const del = runGenericAction('bucketList', 'delete', { match: 'japan' });
    expect(del.ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('Learn guitar');
  });

  it('clears an entire domain to an empty array', () => {
    runGenericAction('bucketList', 'add', { text: 'Visit Japan' });
    const clear = runGenericAction('bucketList', 'clear', {});
    expect(clear.ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    expect(stored).toEqual([]);
  });

  it('matches by id when params.id is provided, ignoring match text', () => {
    runGenericAction('bucketList', 'add', { text: 'Visit Japan' });
    const stored = JSON.parse(localStorage.getItem('familyos_bucket_list')!);
    const itemId = stored[0].id;
    const del = runGenericAction('bucketList', 'delete', { id: itemId, match: 'totally different text' });
    expect(del.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/hermesActions.test.ts`
Expected: FAIL — `Cannot find module './hermesActions'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/hermesActions.ts
import { loadJSON, saveJSON, uid } from './familyos';

export interface DomainSpec {
  domain: string;
  storageKey: string;
  matchField: string;
  fields: string[];
}

export const DOMAIN_REGISTRY: DomainSpec[] = [
  { domain: 'shopping', storageKey: 'familyos_shopping', matchField: 'name',
    fields: ['name', 'category', 'assignedTo', 'quantity'] },
  { domain: 'bills', storageKey: 'familyos_bills', matchField: 'name',
    fields: ['name', 'amount', 'dueDate', 'recurring'] },
  { domain: 'appointments', storageKey: 'familyos_appointments', matchField: 'type',
    fields: ['person', 'type', 'doctor', 'date', 'notes'] },
  { domain: 'pantry', storageKey: 'familyos_pantry', matchField: 'name',
    fields: ['name', 'quantity', 'unit', 'category'] },
  { domain: 'messages', storageKey: 'familyos_messages', matchField: 'text',
    fields: ['author', 'text'] },
  { domain: 'askParents', storageKey: 'familyos_ask_parents', matchField: 'request',
    fields: ['kid', 'request', 'status'] },
  { domain: 'moments', storageKey: 'familyos_moments', matchField: 'caption',
    fields: ['caption', 'emoji', 'date', 'author'] },
  { domain: 'bucketList', storageKey: 'familyos_bucket_list', matchField: 'text',
    fields: ['text'] },
  { domain: 'watchlist', storageKey: 'familyos_watchlist', matchField: 'title',
    fields: ['title', 'type', 'wantsToWatch'] },
  { domain: 'games', storageKey: 'familyos_games', matchField: 'name',
    fields: ['name'] },
  { domain: 'medications', storageKey: 'familyos_medications', matchField: 'name',
    fields: ['person', 'name', 'dosage', 'frequency', 'nextRefill', 'notes'] },
  { domain: 'petLog', storageKey: 'familyos_lucy', matchField: 'type',
    fields: ['type', 'date', 'notes', 'nextDue'] },
  { domain: 'homework', storageKey: 'familyos_homework', matchField: 'task',
    fields: ['kid', 'subject', 'task', 'dueDate', 'status'] },
  { domain: 'grades', storageKey: 'familyos_grades', matchField: 'subject',
    fields: ['kid', 'subject', 'grade', 'date', 'notes'] },
  { domain: 'kidsActivities', storageKey: 'familyos_activities_kids', matchField: 'name',
    fields: ['kid', 'name', 'day', 'time', 'location'] },
  { domain: 'allowance', storageKey: 'familyos_allowance', matchField: 'reason',
    fields: ['kid', 'amount', 'type', 'reason', 'date'] },
  { domain: 'expenses', storageKey: 'familyos_expenses', matchField: 'notes',
    fields: ['amount', 'category', 'paidBy', 'date', 'notes'] },
  { domain: 'budget', storageKey: 'familyos_budget', matchField: 'name',
    fields: ['name', 'budgeted', 'month'] },
  { domain: 'homeMaintenance', storageKey: 'familyos_home_maintenance', matchField: 'item',
    fields: ['item', 'category', 'lastDone', 'nextDue', 'notes'] },
  { domain: 'qualityActivities', storageKey: 'quality_activities', matchField: 'name',
    fields: ['name', 'person', 'duration', 'scheduledAt'] },
  { domain: 'promises', storageKey: 'family_promises', matchField: 'text',
    fields: ['text', 'person', 'priority', 'dueDate'] },
  { domain: 'emotions', storageKey: 'emotion_logs', matchField: 'feeling',
    fields: ['person', 'feeling', 'context', 'intensity', 'category'] },
];

function pick(obj: Record<string, any>, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function runGenericAction(
  domain: string,
  op: 'add' | 'update' | 'delete' | 'clear',
  params: Record<string, any>
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

  const match = (params.match || '').toLowerCase();
  const idx = items.findIndex(
    (i) => (params.id && i.id === params.id) || (match && String(i[spec.matchField] ?? '').toLowerCase().includes(match))
  );
  if (idx === -1) return { result: `No ${spec.domain} item matching "${params.match ?? params.id}"`, ok: false };

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/hermesActions.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hermesActions.ts src/lib/hermesActions.test.ts
git commit -m "feat(hermes): add generic domain-registry action executor"
```

---

## Task 2: Extract pure mark-cooked logic + export car storage key

**Files:**
- Modify: `src/components/familyos/sections/MealPlanner.tsx`
- Modify: `src/components/familyos/sections/CarMaintenance.tsx`
- Test: `src/components/familyos/sections/mealCooked.test.ts`

**Interfaces:**
- Produces: `applyMealCooked(plan: WeekPlan, day: Day, meal: MealType, ingredients: {name:string;quantity:number;unit:string}[], fromServings: number, toServings: number): WeekPlan` — pure, no side effects on pantry/storage. Consumed by Task 3's `markMealCookedAction`.
- Produces: `WeekPlan`, `Day`, `MealType` types, exported from `MealPlanner.tsx` (currently declared but NOT exported — `type Day`/`type MealType`/`type WeekPlan` at lines 11/13/41) — consumed by Task 3, which needs them to type `loadJSON<WeekPlan>(...)` and cast incoming chat params.
- Produces: `CARS_STORAGE_KEY = 'familyos_cars'` exported from `CarMaintenance.tsx` — consumed by Task 3's `addCarMaintenanceEntryAction`.
- Consumes: `scaleIngredients` (already exported from `MealPlanner.tsx`, signature: `scaleIngredients(ingredients, fromServings, toServings): {name;quantity;unit}[]`).

**Why this extraction is necessary:** `MealPlanner.tsx`'s current `markCooked` (line 354) is a closure over component state (`plan`, `suggestions`, `servingsOverride`, `save`) — it cannot be called from outside the component, and its servings-override behavior depends on ephemeral React state that Hermes (invoked from a different component with no access to that state) cannot replicate. `applyMealCooked` factors out only the pure plan-transformation logic (stamps `cookedAt`, does not touch pantry) so both call sites can share it: the UI passes its live `servingsOverride` value, Hermes passes the recipe's own default servings (no override available to it).

Pantry decrementing (`loadPantry`/`decrementPantry`/`savePantry`) stays a separate step at each call site — it already is in the current `markCooked`, and `Task 3` calls it explicitly for the Hermes path too.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/familyos/sections/mealCooked.test.ts
import { describe, it, expect } from 'vitest';
import { applyMealCooked, defaultPlan } from './MealPlanner';

describe('applyMealCooked', () => {
  it('stamps cookedAt for the given day/meal without mutating the input plan', () => {
    const plan = defaultPlan();
    const before = Date.now();
    const result = applyMealCooked(
      plan, 'Monday', 'Dinner',
      [{ name: 'Flour', quantity: 2, unit: 'cups' }],
      4, 4
    );
    expect(result.Monday.cookedAt?.Dinner).toBeGreaterThanOrEqual(before);
    expect(plan.Monday.cookedAt).toBeUndefined(); // original untouched
  });

  it('leaves other days/meals untouched', () => {
    const plan = defaultPlan();
    const result = applyMealCooked(plan, 'Tuesday', 'Lunch', [], 2, 2);
    expect(result.Monday).toEqual(plan.Monday);
    expect(result.Tuesday.cookedAt?.Lunch).toBeTypeOf('number');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/familyos/sections/mealCooked.test.ts`
Expected: FAIL — `applyMealCooked` is not exported from `./MealPlanner`.

- [ ] **Step 3: Export `Day`, `MealType`, `WeekPlan` and add `applyMealCooked`**

In `src/components/familyos/sections/MealPlanner.tsx`, change the three currently-unexported type declarations:

```ts
type Day = typeof DAYS[number];
```
```ts
type MealType = typeof MEALS[number];
```
```ts
type WeekPlan = Record<Day, DayPlan>;
```

to:

```ts
export type Day = typeof DAYS[number];
```
```ts
export type MealType = typeof MEALS[number];
```
```ts
export type WeekPlan = Record<Day, DayPlan>;
```

(each stays exactly where it already is in the file — lines 11, 13, and 41 respectively — only the `export` keyword is added.)

Then add this new exported function near `scaleIngredients` (after its definition, since it's used by `applyMealCooked`):

```ts
export function applyMealCooked(
  plan: WeekPlan,
  day: Day,
  meal: MealType,
  ingredients: { name: string; quantity: number; unit: string }[],
  fromServings: number,
  toServings: number
): WeekPlan {
  return {
    ...plan,
    [day]: { ...plan[day], cookedAt: { ...plan[day].cookedAt, [meal]: Date.now() } },
  };
}
```

(`ingredients`/`fromServings`/`toServings` are accepted for interface symmetry with the pantry-decrement step callers perform separately, but `applyMealCooked` itself only stamps the timestamp — scaling happens via the already-exported `scaleIngredients` at the call site before pantry decrement, exactly as the existing UI code already does.)

Then replace the existing `markCooked` function body (lines 354-369) to call it:

```ts
  const markCooked = (day: Day, meal: MealType) => {
    const ingredients = plan[day].cookedIngredients?.[meal];
    if (!ingredients) return;
    const key = suggestionKey(day, meal);
    const recipeServings = suggestions[key]?.servings ?? 1;
    const chosenServings = servingsOverride[key] ?? recipeServings;
    const scaled = scaleIngredients(ingredients, recipeServings, chosenServings);

    const pantryItems = loadPantry();
    savePantry(decrementPantry(pantryItems, scaled));

    save(applyMealCooked(plan, day, meal, ingredients, recipeServings, chosenServings));
  };
```

- [ ] **Step 4: Export the cars storage key**

In `src/components/familyos/sections/CarMaintenance.tsx`, change:

```ts
const STORAGE_KEY = 'familyos_cars';
```

to:

```ts
export const CARS_STORAGE_KEY = 'familyos_cars';
const STORAGE_KEY = CARS_STORAGE_KEY;
```

(keeps the local `STORAGE_KEY` name used throughout the rest of the file unchanged, just backs it with the exported constant.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/familyos/sections/mealCooked.test.ts`
Expected: PASS — both tests green.

Run: `npm run build`
Expected: build succeeds (confirms `CarMaintenance.tsx`'s local `STORAGE_KEY` references still resolve).

- [ ] **Step 6: Commit**

```bash
git add src/components/familyos/sections/MealPlanner.tsx src/components/familyos/sections/CarMaintenance.tsx src/components/familyos/sections/mealCooked.test.ts
git commit -m "refactor(meal-planner): extract applyMealCooked as a pure, exported function"
```

---

## Task 3: Wire generic + named actions into HermesChat

**Files:**
- Modify: `src/components/familyos/HermesChat.tsx`

**Interfaces:**
- Consumes: `runGenericAction` from `@/lib/hermesActions` (Task 1).
- Consumes: `applyMealCooked`, `scaleIngredients`, `defaultPlan`, `MEALS_STORAGE_KEY` from `@/components/familyos/sections/MealPlanner` (Task 2; `defaultPlan`/`MEALS_STORAGE_KEY` already imported from a prior session's `clearWeekMeals` work).
- Consumes: `CARS_STORAGE_KEY` from `@/components/familyos/sections/CarMaintenance` (Task 2).
- Consumes: `loadPantry`, `decrementPantry`, `savePantry`, `loadJSON`, `saveJSON`, `uid` from `@/lib/familyos`.

No new automated test for this task — `executeAction`'s dispatch branches are thin wrappers around already-tested logic (`runGenericAction` tested in Task 1, `applyMealCooked` tested in Task 2); this matches the existing convention where `executeAction`'s branches for `addTask` etc. have no dedicated tests either. Verified via build + manual chat interaction in Task 4.

- [ ] **Step 1: Add new action types**

In `src/components/familyos/HermesChat.tsx`, change:

```ts
type ActionType =
  | 'addTask' | 'completeTask' | 'uncompleteTask' | 'deleteTask'
  | 'addShopping' | 'completeShoppingItem'
  | 'addBill' | 'markBillPaid'
  | 'addAppointment'
  | 'addPromise' | 'completePromise'
  | 'logEmotion'
  | 'updateMemory'
  | 'clearWeekMeals';
```

to:

```ts
type ActionType =
  | 'addTask' | 'completeTask' | 'uncompleteTask' | 'deleteTask'
  | 'addShopping' | 'completeShoppingItem'
  | 'addBill' | 'markBillPaid'
  | 'addAppointment'
  | 'addPromise' | 'completePromise'
  | 'logEmotion'
  | 'updateMemory'
  | 'clearWeekMeals'
  | 'genericAction' | 'markMealCooked' | 'addCarMaintenanceEntry';
```

- [ ] **Step 2: Add the imports**

Change the existing import line:

```ts
import { defaultPlan, MEALS_STORAGE_KEY } from '@/components/familyos/sections/MealPlanner';
```

to:

```ts
import { defaultPlan, MEALS_STORAGE_KEY, applyMealCooked, scaleIngredients, type Day, type MealType, type WeekPlan } from '@/components/familyos/sections/MealPlanner';
import { CARS_STORAGE_KEY } from '@/components/familyos/sections/CarMaintenance';
import { runGenericAction } from '@/lib/hermesActions';
import { loadPantry, decrementPantry, savePantry } from '@/lib/familyos';
```

(`loadJSON`, `saveJSON`, `uid` are already imported in the existing `import { KEYS, loadJSON, saveJSON, uid, ... } from '@/lib/familyos';` line — no change needed there.)

- [ ] **Step 3: Add the three new `executeAction` branches**

In `executeAction`, add these branches right after the existing `clearWeekMeals` branch:

```ts
    if (action.type === 'genericAction') {
      return runGenericAction(p.domain, p.op, p.params ?? p);
    }

    if (action.type === 'markMealCooked') {
      const day = p.day as Day;
      const meal = p.meal as MealType;
      const weekPlan = loadJSON<WeekPlan>(MEALS_STORAGE_KEY, defaultPlan());
      const ingredients = weekPlan[day]?.cookedIngredients?.[meal];
      if (!ingredients) return { result: `No recipe recorded for ${day} ${meal} — plan it from the Meals tab first`, ok: false };

      const pantryItems = loadPantry();
      savePantry(decrementPantry(pantryItems, ingredients));

      const updated = applyMealCooked(weekPlan, day, meal, ingredients, ingredients.length, ingredients.length);
      saveJSON(MEALS_STORAGE_KEY, updated);
      return { result: `Marked ${meal} cooked for ${day} and updated the pantry`, ok: true };
    }

    if (action.type === 'addCarMaintenanceEntry') {
      const cars = loadJSON<any[]>(CARS_STORAGE_KEY, []);
      const match = (p.carMatch || '').toLowerCase();
      const idx = cars.findIndex((c) => String(c.name ?? '').toLowerCase().includes(match));
      if (idx === -1) return { result: `No car matching "${p.carMatch}"`, ok: false };

      const entry = {
        id: uid(), createdAt: Date.now(),
        type: p.type || 'Other', date: p.date || '', mileage: p.mileage || '', notes: p.notes || '',
      };
      cars[idx] = { ...cars[idx], entries: [entry, ...(cars[idx].entries || [])] };
      saveJSON(CARS_STORAGE_KEY, cars);
      return { result: `Logged ${entry.type} for ${cars[idx].name}`, ok: true };
    }
```

**Note on `markMealCooked`'s servings:** unlike the UI button (which can use a live `servingsOverride`), Hermes has no access to that ephemeral React state, so it always uses the recipe's ingredients as-recorded (`ingredients.length, ingredients.length` passed to `applyMealCooked` is a no-op scale factor — 1:1 — since `applyMealCooked` itself doesn't rescale, only `scaleIngredients` does, and this path intentionally skips rescaling to use exactly what was already recorded in `cookedIngredients`).

- [ ] **Step 4: Update the system prompt's action list**

Change:

```ts
logEmotion: {type, params: {person, emotion, intensity: 1-5, note}}
updateMemory: {type, params: {memory: "thing to remember about this family"}}
clearWeekMeals: {type, params: {}} — resets the entire week's meal plan (all days/meals/cook assignments) back to empty
```

to:

```ts
logEmotion: {type, params: {person, emotion, intensity: 1-5, note}}
updateMemory: {type, params: {memory: "thing to remember about this family"}}
clearWeekMeals: {type, params: {}} — resets the entire week's meal plan (all days/meals/cook assignments) back to empty
markMealCooked: {type, params: {day: "Monday".."Sunday", meal: "Breakfast"|"Lunch"|"Dinner"}} — decrements pantry by that meal's recorded ingredients and marks it cooked
addCarMaintenanceEntry: {type, params: {carMatch: "partial car name", type, date: "YYYY-MM-DD", mileage, notes}}
genericAction: {type, params: {domain, op: "add"|"update"|"delete"|"clear", ...fields}}
  Use this for anything not covered by a specific action above. Valid domains and their fields:
  shopping(name,category,assignedTo,quantity) · bills(name,amount,dueDate,recurring) ·
  appointments(person,type,doctor,date,notes) · pantry(name,quantity,unit,category) ·
  messages(author,text) · askParents(kid,request,status) · moments(caption,emoji,date,author) ·
  bucketList(text) · watchlist(title,type,wantsToWatch) · games(name) ·
  medications(person,name,dosage,frequency,nextRefill,notes) · petLog(type,date,notes,nextDue) ·
  homework(kid,subject,task,dueDate,status) · grades(kid,subject,grade,date,notes) ·
  kidsActivities(kid,name,day,time,location) · allowance(kid,amount,type,reason,date) ·
  expenses(amount,category,paidBy,date,notes) · budget(name,budgeted,month) ·
  homeMaintenance(item,category,lastDone,nextDue,notes) · qualityActivities(name,person,duration,scheduledAt) ·
  promises(text,person,priority,dueDate) · emotions(person,feeling,context,intensity,category)
  For update/delete, pass {match: "partial text to find the item"} instead of full fields.
```

- [ ] **Step 5: Update the action icon map**

Change:

```ts
  logEmotion: '💭',
  updateMemory: '🧠',
  clearWeekMeals: '🍽️',
};
```

to:

```ts
  logEmotion: '💭',
  updateMemory: '🧠',
  clearWeekMeals: '🍽️',
  markMealCooked: '✅',
  addCarMaintenanceEntry: '🚗',
  genericAction: '⚡',
};
```

- [ ] **Step 6: Build to verify no type errors**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/familyos/HermesChat.tsx
git commit -m "feat(hermes): wire generic action registry and mark-cooked/car-maintenance into chat"
```

---

## Task 4: Full verification

**Files:** none (verification-only task).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the 9 new `hermesActions.test.ts` tests and 2 new `mealCooked.test.ts` tests, plus all pre-existing tests (60 as of the last full run in this repo).

- [ ] **Step 2: Full web build**

Run: `npm run build`
Expected: `vite build` succeeds, no errors.

- [ ] **Step 3: Manual smoke test in the running app**

This cannot be automated — Hermes calls a real `/api/chat` endpoint backed by a live model, and the app requires Google auth to reach any real screen. Once deployed/running with real credentials:
1. Open Hermes chat, ask: "add 'buy dog food' to the bucket list" — confirm a chat card shows success and the item appears in Family Hub's Bucket List.
2. Ask: "clear the bucket list" — confirm it empties.
3. Ask: "add a homework item for Sam: finish the book report, due Friday" — confirm it appears in Kids → Homework.
4. If a car is already added in Car Maintenance, ask: "log an oil change for [car name] today" — confirm an entry appears under that car.

- [ ] **Step 4: No commit needed**

Verification-only; nothing to commit if all checks pass.

---

## Self-Review Notes

- **Spec coverage:** all 22 registry domains from the spec's catalog table are present in `DOMAIN_REGISTRY` (Task 1) with matching storage keys, match fields, and fields. `markMealCooked` and `addCarMaintenanceEntry` (Task 3) cover the spec's two remaining named actions. `clearWeekMeals` (spec's third named action) was already shipped in a prior session and is explicitly called out as out of this plan's scope.
- **Type consistency:** `runGenericAction`'s signature (`domain, op, params`) defined in Task 1 is called identically in Task 3's `genericAction` branch. `applyMealCooked`'s signature defined in Task 2 is called identically in Task 3's `markMealCooked` branch. `CARS_STORAGE_KEY`/`MEALS_STORAGE_KEY` names match between their export site (Task 2 / prior session) and import site (Task 3).
- **Deviation from spec:** the spec's `runGenericAction` pseudocode didn't handle the case where `params.id` is provided without `params.match` — Task 1's real implementation handles both independently (`id` matches take priority, `match` is the fallback), which is a strict improvement, not a behavior change from what the spec described in prose ("locate by id or fuzzy match").
- **Known limitation carried from spec:** `markMealCooked`'s servings always uses the as-recorded `cookedIngredients` with no rescaling, since Hermes has no access to the UI's ephemeral `servingsOverride` state. This is documented inline in Task 3 Step 3 rather than silently glossed over.
