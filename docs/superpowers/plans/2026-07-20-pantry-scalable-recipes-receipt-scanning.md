# Pantry, Scalable Recipes, and Receipt Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover and finish three related features from a prior version of this app: a real Pantry with on-hand quantities, serving-size scaling on AI recipe suggestions (with pantry-aware shopping-list shortfall), and a camera-based receipt/grocery-photo scanner that populates the pantry.

**Architecture:** One new `family_data` key (`familyos_pantry`) holding an array of `PantryItem`s, read/written via the existing client-side `loadJSON`/`saveJSON` pattern — same as every other feature in this app, no new Supabase tables. `MealPlanner.tsx`'s existing AI-suggestion flow gains structured ingredients (quantity+unit, not bare strings) and a serving-size stepper. A new `ReceiptScanner.tsx` component reuses `ChoreScanner.tsx`'s proven camera-capture skeleton with a different AI prompt and confirm target.

**Tech Stack:** React/TypeScript client-side only — no new API routes, no new Supabase schema. Reuses `callClaudeVision`/`callGeminiVision` (`src/lib/familyos.ts`, already auth-fixed) for the receipt scanner, and the existing `/api/chat` proxy (already auth-fixed) for recipe suggestions.

## Global Constraints

- All pantry/shopping/meal-plan reads and writes go through `loadJSON`/`saveJSON` from `src/lib/familyos.ts` — never `dbGet`/`dbSet` (server-only, `api/_db.ts`, not importable from `src/`). This was the exact architecture correction made in the sibling preferences-profile plan; the same correction applies here.
- `ShoppingItem`'s real shape (`src/components/familyos/sections/Shopping.tsx`) is `{ id, name, category: 'Groceries'|'Household'|'School'|'Other', assignedTo, quantity: string, completed, createdAt, completedAt?, deletedAt?, deletedBy? }` — **not** the pantry-style category set. Shopping-list categories and pantry categories are two separate, unrelated enums; do not conflate them anywhere in this plan.
- Pantry categories: `'produce' | 'meat' | 'dairy' | 'bakery' | 'pantry' | 'frozen' | 'beverages' | 'household' | 'personal-care' | 'other'` (matches the recovered old app's `PantryCategory`, per the approved spec).
- Ingredient/pantry-item matching for shortfall and decrement math is **exact-match on `name.toLowerCase()` + `unit`** — no fuzzy matching, no unit conversion. This is a known, accepted limitation carried over from the spec, not a bug to fix in this plan.
- No new test framework — this repo has Vitest (`vitest.config.ts`). Add `.test.ts` files for pure logic (scaling math, shortfall calculation, ingredient merging) — no Supabase mocking needed since these are pure functions.
- Follow this app's established camera-capture pattern from `src/components/familyos/ChoreScanner.tsx` for the receipt scanner — single-capture mode (no live-scan loop, unlike ChoreScanner's optional live mode; receipts are one static photo).
- The `MemberPreferences`/`loadMemberPreferences`/`buildFoodPreferencePrompt` functions this plan's Task 3 consumes were added in the sibling preferences-profile plan (`docs/superpowers/plans/2026-07-20-member-preferences-profile.md`) — that plan must be complete before this one starts (it already is, as of this session).

---

### Task 1: Pantry data model and pure logic functions

**Files:**
- Modify: `src/lib/familyos.ts`
- Test: `src/lib/familyos.pantry.test.ts`

**Interfaces:**
- Produces: `PantryCategory` type, `PANTRY_CATEGORY_EMOJI` constant, `PantryItem` interface, `loadPantry(): PantryItem[]`, `savePantry(items: PantryItem[]): void`, `findPantryItem(items: PantryItem[], name: string, unit: string): PantryItem | undefined`, `mergeIntoPantry(items: PantryItem[], incoming: { name: string; quantity: number; unit: string; category: PantryCategory }[]): PantryItem[]`, `decrementPantry(items: PantryItem[], ingredients: { name: string; quantity: number; unit: string }[]): PantryItem[]`, `calculateShortfall(pantryItems: PantryItem[], needed: { name: string; quantity: number; unit: string }[]): { name: string; quantity: number; unit: string }[]`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/familyos.pantry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  findPantryItem, mergeIntoPantry, decrementPantry, calculateShortfall,
  type PantryItem,
} from './familyos';

function item(overrides: Partial<PantryItem> = {}): PantryItem {
  return { id: 'i1', name: 'Flour', quantity: 2, unit: 'cups', category: 'pantry', updatedAt: 0, ...overrides };
}

describe('findPantryItem', () => {
  it('matches on name (case-insensitive) and unit', () => {
    const items = [item({ name: 'Flour', unit: 'cups' })];
    expect(findPantryItem(items, 'flour', 'cups')).toBe(items[0]);
  });

  it('does not match when the unit differs', () => {
    const items = [item({ name: 'Flour', unit: 'cups' })];
    expect(findPantryItem(items, 'Flour', 'lb')).toBeUndefined();
  });

  it('returns undefined when no item matches the name', () => {
    const items = [item({ name: 'Flour' })];
    expect(findPantryItem(items, 'Sugar', 'cups')).toBeUndefined();
  });
});

describe('mergeIntoPantry', () => {
  it('increments quantity for an existing name+unit match', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 2 })];
    const result = mergeIntoPantry(items, [{ name: 'Flour', quantity: 3, unit: 'cups', category: 'pantry' }]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5);
  });

  it('creates a new item when no name+unit match exists', () => {
    const items = [item({ name: 'Flour', unit: 'cups' })];
    const result = mergeIntoPantry(items, [{ name: 'Milk', quantity: 1, unit: 'gallon', category: 'dairy' }]);
    expect(result).toHaveLength(2);
    expect(result.find(i => i.name === 'Milk')?.quantity).toBe(1);
  });

  it('merges multiple incoming items in one call', () => {
    const result = mergeIntoPantry([], [
      { name: 'Eggs', quantity: 12, unit: '', category: 'dairy' },
      { name: 'Butter', quantity: 1, unit: 'lb', category: 'dairy' },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe('decrementPantry', () => {
  it('reduces quantity by the used amount', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 5 })];
    const result = decrementPantry(items, [{ name: 'Flour', quantity: 2, unit: 'cups' }]);
    expect(result[0].quantity).toBe(3);
  });

  it('clamps at 0, never goes negative', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 1 })];
    const result = decrementPantry(items, [{ name: 'Flour', quantity: 5, unit: 'cups' }]);
    expect(result[0].quantity).toBe(0);
  });

  it('leaves non-matching pantry items untouched', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 5 }), item({ id: 'i2', name: 'Sugar', unit: 'cups', quantity: 3 })];
    const result = decrementPantry(items, [{ name: 'Flour', quantity: 1, unit: 'cups' }]);
    expect(result.find(i => i.name === 'Sugar')?.quantity).toBe(3);
  });

  it('is a no-op for ingredients with no matching pantry item', () => {
    const items = [item({ name: 'Flour', unit: 'cups', quantity: 5 })];
    const result = decrementPantry(items, [{ name: 'Basil', quantity: 1, unit: 'tsp' }]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5);
  });
});

describe('calculateShortfall', () => {
  it('returns the needed amount when pantry has none of it', () => {
    const shortfall = calculateShortfall([], [{ name: 'Flour', quantity: 2, unit: 'cups' }]);
    expect(shortfall).toEqual([{ name: 'Flour', quantity: 2, unit: 'cups' }]);
  });

  it('returns nothing when pantry stock fully covers the need', () => {
    const pantry = [item({ name: 'Flour', unit: 'cups', quantity: 3 })];
    const shortfall = calculateShortfall(pantry, [{ name: 'Flour', quantity: 2, unit: 'cups' }]);
    expect(shortfall).toEqual([]);
  });

  it('returns only the shortfall amount when pantry partially covers the need', () => {
    const pantry = [item({ name: 'Flour', unit: 'cups', quantity: 1 })];
    const shortfall = calculateShortfall(pantry, [{ name: 'Flour', quantity: 3, unit: 'cups' }]);
    expect(shortfall).toEqual([{ name: 'Flour', quantity: 2, unit: 'cups' }]);
  });

  it('handles multiple ingredients independently', () => {
    const pantry = [item({ name: 'Flour', unit: 'cups', quantity: 5 })];
    const shortfall = calculateShortfall(pantry, [
      { name: 'Flour', quantity: 2, unit: 'cups' },
      { name: 'Sugar', quantity: 1, unit: 'cup' },
    ]);
    expect(shortfall).toEqual([{ name: 'Sugar', quantity: 1, unit: 'cup' }]);
  });

  it('never returns a negative or zero-quantity entry', () => {
    const pantry = [item({ name: 'Flour', unit: 'cups', quantity: 10 })];
    const shortfall = calculateShortfall(pantry, [{ name: 'Flour', quantity: 2, unit: 'cups' }]);
    expect(shortfall.find(s => s.name === 'Flour')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/familyos.pantry.test.ts`
Expected: FAIL — `findPantryItem`, `mergeIntoPantry`, `decrementPantry`, `calculateShortfall` are not exported from `./familyos`.

- [ ] **Step 3: Add the pantry model and functions to `src/lib/familyos.ts`**

Add near the Member Preferences section added in the sibling plan (after it, before the `// Storage helpers` section):

```ts
// ── Pantry ────────────────────────────────────────────────────────────────────

export type PantryCategory =
  | 'produce' | 'meat' | 'dairy' | 'bakery' | 'pantry'
  | 'frozen' | 'beverages' | 'household' | 'personal-care' | 'other';

export const PANTRY_CATEGORY_EMOJI: Record<PantryCategory, string> = {
  produce: '🥦', meat: '🥩', dairy: '🥛', bakery: '🍞', pantry: '🥫',
  frozen: '❄️', beverages: '🧃', household: '🧹', 'personal-care': '🧴', other: '📦',
};

export interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: PantryCategory;
  updatedAt: number;
}

const PANTRY_KEY = 'familyos_pantry';

export function findPantryItem(items: PantryItem[], name: string, unit: string): PantryItem | undefined {
  const n = name.toLowerCase();
  return items.find((i) => i.name.toLowerCase() === n && i.unit === unit);
}

export function mergeIntoPantry(
  items: PantryItem[],
  incoming: { name: string; quantity: number; unit: string; category: PantryCategory }[]
): PantryItem[] {
  let next = [...items];
  for (const inc of incoming) {
    const existing = findPantryItem(next, inc.name, inc.unit);
    if (existing) {
      next = next.map((i) => i.id === existing.id ? { ...i, quantity: i.quantity + inc.quantity, updatedAt: Date.now() } : i);
    } else {
      next = [...next, { id: uid(), name: inc.name, quantity: inc.quantity, unit: inc.unit, category: inc.category, updatedAt: Date.now() }];
    }
  }
  return next;
}

export function decrementPantry(
  items: PantryItem[],
  ingredients: { name: string; quantity: number; unit: string }[]
): PantryItem[] {
  let next = [...items];
  for (const ing of ingredients) {
    const existing = findPantryItem(next, ing.name, ing.unit);
    if (!existing) continue;
    next = next.map((i) => i.id === existing.id ? { ...i, quantity: Math.max(0, i.quantity - ing.quantity), updatedAt: Date.now() } : i);
  }
  return next;
}

export function calculateShortfall(
  pantryItems: PantryItem[],
  needed: { name: string; quantity: number; unit: string }[]
): { name: string; quantity: number; unit: string }[] {
  const shortfall: { name: string; quantity: number; unit: string }[] = [];
  for (const need of needed) {
    const onHand = findPantryItem(pantryItems, need.name, need.unit)?.quantity ?? 0;
    const remaining = need.quantity - onHand;
    if (remaining > 0) shortfall.push({ name: need.name, quantity: remaining, unit: need.unit });
  }
  return shortfall;
}
```

Add `loadPantry`/`savePantry` **after** `loadJSON`/`saveJSON`'s own definitions (same ordering rule as `loadMemberPreferences` in the sibling plan):

```ts
export function loadPantry(): PantryItem[] {
  return loadJSON<PantryItem[]>(PANTRY_KEY, []);
}

export function savePantry(items: PantryItem[]): void {
  saveJSON(PANTRY_KEY, items);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/familyos.pantry.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Run the full suite and build**

Run: `npx vitest run && npx vite build`
Expected: all tests pass (48 total: 34 existing + 14 new); build succeeds with only the pre-existing chunk-size warning.

- [ ] **Step 6: Commit**

```bash
git add src/lib/familyos.ts src/lib/familyos.pantry.test.ts
git commit -m "feat(pantry): add PantryItem data model and pure merge/decrement/shortfall logic

loadPantry()/savePantry() follow this app's existing loadJSON pattern
(family_data key, not a new Supabase table). mergeIntoPantry,
decrementPantry, and calculateShortfall are pure functions with no
I/O, unit-tested directly — exact-match on name+unit, no fuzzy
matching or unit conversion, per the approved spec's accepted
limitation."
```

---

### Task 2: `Pantry.tsx` section — view, manual quantity adjustment

**Files:**
- Create: `src/components/familyos/sections/Pantry.tsx`
- Modify: `src/components/AppLayout.tsx`

**Interfaces:**
- Consumes: `loadPantry`, `savePantry`, `PantryItem`, `PANTRY_CATEGORY_EMOJI`, `PantryCategory` (Task 1).
- Produces: `<Pantry />` default export, registered as a new `HouseholdTab` value `'pantry'`.

- [ ] **Step 1: Write the component**

```tsx
import React, { useState } from 'react';
import { Plus, Minus, Trash2, Package } from 'lucide-react';
import { loadPantry, savePantry, uid, PANTRY_CATEGORY_EMOJI, type PantryItem, type PantryCategory } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { isAdmin } from '@/lib/familyos';

const CATEGORY_ORDER: PantryCategory[] = [
  'produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'personal-care', 'other',
];

const Pantry: React.FC = () => {
  const { currentRole } = useAppContext();
  const canEdit = !!currentRole && isAdmin(currentRole);
  const [items, setItems] = useState<PantryItem[]>(() => loadPantry());
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState<PantryCategory>('pantry');

  const save = (next: PantryItem[]) => { setItems(next); savePantry(next); };

  const addItem = () => {
    if (!name.trim()) return;
    const item: PantryItem = {
      id: uid(), name: name.trim(), quantity: parseFloat(quantity) || 0, unit: unit.trim(),
      category, updatedAt: Date.now(),
    };
    save([item, ...items]);
    setName(''); setQuantity('1'); setUnit(''); setShowForm(false);
  };

  const adjustQty = (id: string, delta: number) => {
    save(items.map((i) => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta), updatedAt: Date.now() } : i));
  };

  const removeItem = (id: string) => {
    save(items.filter((i) => i.id !== id));
  };

  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, items: items.filter((i) => i.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-emerald-400" /> Pantry
        </h2>
        {canEdit && (
          <button onClick={() => setShowForm((f) => !f)} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white text-sm px-3 py-1.5 rounded-lg transition">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" autoFocus
              className="col-span-2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 outline-none" />
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" placeholder="Quantity"
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none" />
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (cups, lb…)"
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none" />
            <select value={category} onChange={(e) => setCategory(e.target.value as PantryCategory)}
              className="col-span-2 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none">
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{PANTRY_CATEGORY_EMOJI[c]} {c}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded transition">Cancel</button>
            <button onClick={addItem} className="bg-green-600 hover:bg-green-500 text-white text-sm px-4 py-1.5 rounded-lg transition">Add</button>
          </div>
        </div>
      )}

      {byCategory.length === 0 && !showForm && (
        <div className="text-center text-slate-500 py-8 text-sm">Pantry is empty. Add items or scan a receipt.</div>
      )}

      {byCategory.map(({ cat, items: catItems }) => (
        <div key={cat} className="space-y-2">
          <div className="text-slate-500 text-xs uppercase tracking-wide">{PANTRY_CATEGORY_EMOJI[cat]} {cat}</div>
          {catItems.map((i) => (
            <div key={i.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm font-medium">{i.name}</span>
                {i.unit && <span className="text-slate-500 text-xs ml-2">{i.unit}</span>}
              </div>
              {canEdit && (
                <>
                  <button onClick={() => adjustQty(i.id, -1)} className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-10 text-center text-sm font-bold text-white">{i.quantity}</span>
                  <button onClick={() => adjustQty(i.id, 1)} className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeItem(i.id)} className="text-slate-600 hover:text-rose-400 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              {!canEdit && <span className="text-sm font-bold text-white">{i.quantity}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default Pantry;
```

- [ ] **Step 2: Register the Pantry tab in `AppLayout.tsx`**

In `src/components/AppLayout.tsx`, add the import:

```tsx
import Pantry from '@/components/familyos/sections/Pantry';
```

Change the `HouseholdTab` type to include `'pantry'`:

```tsx
type HouseholdTab = 'tasks' | 'shopping' | 'meals' | 'pantry' | 'bills' | 'home' | 'cars' | 'brain';
```

Add to `HOUSEHOLD_TABS` (add `Package` to the existing `lucide-react` import list at the top of the file), right after the `'meals'` entry:

```tsx
  { id: 'meals', label: 'Meals', icon: Utensils },
  { id: 'pantry', label: 'Pantry', icon: Package },
```

Add the render line, right after `{householdTab === 'meals' && <MealPlanner />}`:

```tsx
{householdTab === 'pantry' && <Pantry />}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npx vite build`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

1. Start the dev server, sign in as an admin/superadmin, navigate to Household → Pantry tab.
2. Add an item (name, quantity, unit, category) — confirm it appears grouped under the right category header.
3. Use +/− to adjust quantity — confirm it updates and persists across a page reload (proves `loadPantry`/`savePantry` round-trip).
4. Sign in as (or switch to) a child-role account — confirm the +/−/delete/Add-Item controls are hidden, but items are still visible (read-only view).

- [ ] **Step 5: Commit**

```bash
git add src/components/familyos/sections/Pantry.tsx src/components/AppLayout.tsx
git commit -m "feat(pantry): add Pantry section with manual quantity adjustment

New Household sub-tab showing pantry items grouped by category, with
+/- steppers and add/remove for admins. Read-only for non-admin
roles, matching this app's existing admin-gating pattern."
```

---

### Task 3: Structured recipe ingredients + serving-size scaling in MealPlanner

**Files:**
- Modify: `src/components/familyos/sections/MealPlanner.tsx`
- Test: `src/components/familyos/sections/mealScaling.test.ts`

**Interfaces:**
- Consumes: `loadMemberPreferences`, `buildFoodPreferencePrompt` (already wired in the sibling preferences plan).
- Produces: `scaleIngredients(ingredients: {name,quantity,unit}[], fromServings: number, toServings: number): {name,quantity,unit}[]` (pure, exported for testing), updated `Recipe` interface with structured `ingredients` and `servings`.

- [ ] **Step 1: Write the failing test for the scaling function**

Create `src/components/familyos/sections/mealScaling.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scaleIngredients } from './MealPlanner';

describe('scaleIngredients', () => {
  it('returns unchanged quantities when scaling to the same serving count', () => {
    const result = scaleIngredients([{ name: 'Flour', quantity: 2, unit: 'cups' }], 4, 4);
    expect(result).toEqual([{ name: 'Flour', quantity: 2, unit: 'cups' }]);
  });

  it('doubles quantities when doubling servings', () => {
    const result = scaleIngredients([{ name: 'Flour', quantity: 2, unit: 'cups' }], 4, 8);
    expect(result).toEqual([{ name: 'Flour', quantity: 4, unit: 'cups' }]);
  });

  it('halves quantities when halving servings', () => {
    const result = scaleIngredients([{ name: 'Eggs', quantity: 4, unit: '' }], 4, 2);
    expect(result).toEqual([{ name: 'Eggs', quantity: 2, unit: '' }]);
  });

  it('scales multiple ingredients independently', () => {
    const result = scaleIngredients(
      [{ name: 'Flour', quantity: 2, unit: 'cups' }, { name: 'Sugar', quantity: 1, unit: 'cup' }],
      4, 6
    );
    expect(result).toEqual([
      { name: 'Flour', quantity: 3, unit: 'cups' },
      { name: 'Sugar', quantity: 1.5, unit: 'cup' },
    ]);
  });

  it('treats a fromServings of 0 as 1 to avoid division by zero', () => {
    const result = scaleIngredients([{ name: 'Flour', quantity: 2, unit: 'cups' }], 0, 4);
    expect(result).toEqual([{ name: 'Flour', quantity: 8, unit: 'cups' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/familyos/sections/mealScaling.test.ts`
Expected: FAIL — `scaleIngredients` is not exported from `./MealPlanner` (it doesn't exist yet).

- [ ] **Step 3: Update the `Recipe` interface and AI prompt for structured ingredients**

In `src/components/familyos/sections/MealPlanner.tsx`, change the `Recipe` interface:

```ts
interface Recipe {
  name: string;
  description: string;
  time: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  servings: number;
  recipe: { ingredients: { name: string; quantity: number; unit: string }[]; steps: string[] };
}
```

(This removes the old `shoppingNeeded: string[]` field — ingredients themselves now carry everything needed for the shopping list, replacing the separate bare-name list. Every call site referencing `shoppingNeeded` is updated in Step 5 below.)

Update `fetchSuggestion`'s prompt (the JSON schema block inside the template literal) from:

```
  "recipe": {
    "ingredients": ["2 eggs", "1 cup flour"],
    "steps": ["Step 1", "Step 2", "Step 3"]
  },
  "shoppingNeeded": ["any ingredient that might need to be bought"]
```

to:

```
  "servings": 4,
  "recipe": {
    "ingredients": [{"name": "Eggs", "quantity": 2, "unit": ""}, {"name": "Flour", "quantity": 1, "unit": "cup"}],
    "steps": ["Step 1", "Step 2", "Step 3"]
  }
```

Add one line to the prompt's rules section (after the existing "Keep steps array to max 6 items" line):

```
- Return ingredients as a structured array with numeric quantity and a short unit string (e.g. "cups", "lb", "" for count-only items like eggs) — not free-text lines
```

- [ ] **Step 4: Add `scaleIngredients` as an exported pure function**

Add near the top of `MealPlanner.tsx`, alongside the other module-level helper functions (`suggestionKey`, etc.):

```ts
export function scaleIngredients(
  ingredients: { name: string; quantity: number; unit: string }[],
  fromServings: number,
  toServings: number
): { name: string; quantity: number; unit: string }[] {
  const from = fromServings || 1;
  const factor = toServings / from;
  return ingredients.map((ing) => ({ ...ing, quantity: Math.round(ing.quantity * factor * 100) / 100 }));
}
```

- [ ] **Step 5: Run the scaling test to verify it passes**

Run: `npx vitest run src/components/familyos/sections/mealScaling.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Add serving-size state and UI to the expanded recipe card**

Find the component's `expanded`/`suggestions` state and the JSX block that renders the expanded recipe card (where `suggestion.shoppingNeeded` was referenced — this is the block to update). Add serving-size state:

```tsx
const [servingsOverride, setServingsOverride] = useState<Record<SuggestionKey, number>>({});
```

In the expanded card's render, where the recipe's ingredients/steps are shown, add a serving-size stepper above the ingredients list:

```tsx
{suggestion && (
  <div className="flex items-center gap-2 mb-2">
    <span className="text-slate-400 text-xs">Servings:</span>
    <button
      onClick={() => setServingsOverride((prev) => ({ ...prev, [key]: Math.max(1, (prev[key] ?? suggestion.servings) - 1) }))}
      className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 text-sm"
    >−</button>
    <span className="w-6 text-center text-sm font-bold text-white">{servingsOverride[key] ?? suggestion.servings}</span>
    <button
      onClick={() => setServingsOverride((prev) => ({ ...prev, [key]: (prev[key] ?? suggestion.servings) + 1 }))}
      className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 text-sm"
    >+</button>
  </div>
)}
```

The existing ingredient list (around line 504-512) renders chip-style spans over `suggestion.recipe.ingredients.map((ing, i) => ...)`. Since `ing` is now a `{name,quantity,unit}` object instead of a bare string, change this to scale-then-render:

```tsx
{/* Ingredients */}
<div>
  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Ingredients</div>
  <div className="flex flex-wrap gap-1">
    {scaleIngredients(suggestion.recipe.ingredients, suggestion.servings, servingsOverride[key] ?? suggestion.servings).map((ing, i) => (
      <span key={i} className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-300">
        {ing.quantity} {ing.unit} {ing.name}
      </span>
    ))}
  </div>
</div>
```

- [ ] **Step 7: Update `handleAddShopping` to use scaled, pantry-aware shortfall**

Find the existing `handleAddShopping`/`addIngredientsToShopping` and the action-row button block (around line 527-537) that currently reads:

```tsx
{suggestion.shoppingNeeded?.length > 0 && (
  <button
    onClick={() => handleAddShopping(suggestion.shoppingNeeded)}
    className="flex items-center gap-1.5 text-xs bg-blue-900/40 hover:bg-blue-800/60 border border-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg transition"
  >
    <ShoppingCart className="w-3.5 h-3.5" />
    Add {suggestion.shoppingNeeded.length} to shopping
  </button>
)}
```

Replace `addIngredientsToShopping(ingredients: string[])` with a version that takes structured ingredients and checks pantry first:

```ts
function addIngredientsToShopping(ingredients: { name: string; quantity: number; unit: string }[]) {
  const pantryItems = loadPantry();
  const shortfall = calculateShortfall(pantryItems, ingredients);
  if (shortfall.length === 0) return 0;

  const items = loadJSON<any[]>('familyos_shopping', []);
  const existingNames = items.map((i: any) => (i.name || '').toLowerCase());
  const newItems = shortfall
    .filter((ing) => !existingNames.includes(ing.name.toLowerCase()))
    .map((ing) => ({
      id: uid(), createdAt: Date.now(), completed: false, source: 'meal_planner',
      name: ing.name, category: 'Groceries', quantity: String(ing.quantity), assignedTo: 'General',
    }));
  if (newItems.length) saveJSON('familyos_shopping', [...newItems, ...items]);
  return newItems.length;
}
```

Update the import line to add `loadPantry`, `calculateShortfall`:

```tsx
import { loadJSON, saveJSON, uid, KEYS, loadMemberPreferences, buildFoodPreferencePrompt, loadPantry, calculateShortfall } from '@/lib/familyos';
```

Replace the action-row button block (shown above) with:

```tsx
{(() => {
  const scaled = scaleIngredients(suggestion.recipe.ingredients, suggestion.servings, servingsOverride[key] ?? suggestion.servings);
  return scaled.length > 0 && (
    <button
      onClick={() => handleAddShopping(scaled)}
      className="flex items-center gap-1.5 text-xs bg-blue-900/40 hover:bg-blue-800/60 border border-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg transition"
    >
      <ShoppingCart className="w-3.5 h-3.5" />
      Add {scaled.length} to shopping
    </button>
  );
})()}
```

`handleAddShopping` itself (the component-level wrapper around `addIngredientsToShopping`) changes its parameter type from `string[]` to match:

```tsx
const handleAddShopping = (ingredients: { name: string; quantity: number; unit: string }[]) => {
  const n = addIngredientsToShopping(ingredients);
  setShopFeedback(n > 0 ? `${n} ingredient${n !== 1 ? 's' : ''} added to shopping list` : 'Pantry already covers this recipe — nothing added.');
  setTimeout(() => setShopFeedback(null), 2500);
};
```

- [ ] **Step 8: Typecheck and build**

`suggestWholeWeek` (a separate function in this same file, ~line 125) has its own independent AI prompt/JSON schema that only requests meal *names* per day (`{"Monday": {"Breakfast": "meal name", ...}}`) — it never touches `ingredients` or `shoppingNeeded` at all, so it needs no changes for this task.

Run: `npx tsc --noEmit -p tsconfig.json && npx vite build`
Expected: no new errors.

- [ ] **Step 9: Manual verification**

1. In the running app, assign a cook to a meal slot, click the AI-suggest button.
2. Confirm the suggested recipe shows a servings stepper; adjust it up/down and confirm the displayed ingredient quantities scale accordingly (e.g. 2 cups flour at 4 servings becomes 4 cups at 8 servings).
3. With an empty pantry, click "Add to shopping" — confirm all scaled ingredients appear on the Shopping tab.
4. Add one of the recipe's ingredients to the Pantry tab (Task 2) with enough quantity to cover the recipe's need, then suggest+scale the same recipe again and click "Add to shopping" — confirm that ingredient is skipped (pantry-aware shortfall working) while others still get added.

- [ ] **Step 10: Commit**

```bash
git add src/components/familyos/sections/MealPlanner.tsx src/components/familyos/sections/mealScaling.test.ts
git commit -m "feat(recipes): structured ingredients, serving-size scaling, pantry-aware shopping

Recipe.ingredients is now {name,quantity,unit}[] instead of bare
strings — the AI prompt requests structured quantities directly.
scaleIngredients() is a pure, unit-tested function recalculating
quantities for a chosen serving count. Adding a recipe's ingredients
to the shopping list now checks pantry stock first via
calculateShortfall() and only adds what's actually needed — this is
the fix for the piece that was half-built in the recovered prior
version (a multiplier param existed but no UI ever set it)."
```

---

### Task 4: "Mark cooked" — decrement pantry when a planned meal is cooked

**Files:**
- Modify: `src/components/familyos/sections/MealPlanner.tsx`

**Interfaces:**
- Consumes: `decrementPantry`, `loadPantry`, `savePantry` (Task 1), `scaleIngredients` (Task 3).

- [ ] **Step 1: Persist chosen ingredients and servings onto the day's plan when a suggestion is accepted**

Currently, accepting an AI suggestion only writes the meal's *name* into `plan[day][meal]` (`save({ ...plan, [day]: { ...plan[day], [meal]: result.name } })` inside `handleSuggest`). To support "mark cooked" later, the day's plan needs to remember which ingredients/servings were used. Extend `DayPlan`:

```ts
interface DayPlan {
  Breakfast: string;
  Lunch: string;
  Dinner: string;
  cook: string;
  cookedIngredients?: Partial<Record<MealType, { name: string; quantity: number; unit: string }[]>>;
  cookedAt?: Partial<Record<MealType, number>>;
}
```

In `handleSuggest`, when a suggestion is accepted (the `if (result)` block), also store its ingredients at the current serving size:

```tsx
if (result) {
  setSuggestions(prev => ({ ...prev, [key]: result }));
  save({
    ...plan,
    [day]: {
      ...plan[day],
      [meal]: result.name,
      cookedIngredients: { ...plan[day].cookedIngredients, [meal]: result.recipe.ingredients },
    },
  });
}
```

(This stores the *unscaled* ingredients at the recipe's default servings — "mark cooked" in Step 3 below scales them using whatever `servingsOverride` was last set for that slot, consistent with what was actually shown/added to shopping.)

- [ ] **Step 2: Add a "Mark cooked" button to each populated meal slot**

In the week grid's per-meal-slot render (around line 419-471, inside `MEALS.map(meal => { ... })`), the "Action buttons" flex row (line 459-460, `<div className="flex items-center gap-1 flex-shrink-0">`) already holds the "Suggest" button gated on `hasCook`. Add a Mark Cooked button to this same row, right after the existing Suggest button's closing `)}`:

```tsx
{mealValue && !dayPlan.cookedAt?.[meal] && (
  <button
    onClick={() => markCooked(day, meal)}
    title="Mark cooked"
    className="text-slate-500 hover:text-emerald-400 transition"
  >
    <Check className="w-3.5 h-3.5" />
  </button>
)}
```

(`mealValue` is the already-destructured `dayPlan[meal]` from line 421 — reuse it rather than re-reading `dayPlan[meal]` directly. `Check` is already imported from `lucide-react` in this file per the existing import line — reuse it, no new icon import needed.)

- [ ] **Step 3: Implement `markCooked`**

Add near `handleAddShopping`:

```tsx
const markCooked = (day: Day, meal: MealType) => {
  const ingredients = plan[day].cookedIngredients?.[meal];
  if (!ingredients) return;
  const key = suggestionKey(day, meal);
  const recipeServings = suggestions[key]?.servings ?? 1;
  const chosenServings = servingsOverride[key] ?? recipeServings;
  const scaled = scaleIngredients(ingredients, recipeServings, chosenServings);

  const pantryItems = loadPantry();
  savePantry(decrementPantry(pantryItems, scaled));

  save({
    ...plan,
    [day]: { ...plan[day], cookedAt: { ...plan[day].cookedAt, [meal]: Date.now() } },
  });
};
```

Add the import: `decrementPantry`, `loadPantry`, `savePantry` to the existing `@/lib/familyos` import line in this file.

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npx vite build`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

1. Add a pantry item matching one of a suggested recipe's ingredients (Task 2's Pantry tab), note its starting quantity.
2. Suggest and accept a recipe for a meal slot that uses that ingredient.
3. Click "Mark cooked" on that slot.
4. Go to the Pantry tab — confirm that ingredient's quantity decreased by the (possibly scaled) recipe amount.
5. Confirm the "Mark cooked" button disappears for that slot after clicking (can't double-decrement).

- [ ] **Step 6: Commit**

```bash
git add src/components/familyos/sections/MealPlanner.tsx
git commit -m "feat(pantry): add Mark Cooked action to decrement pantry stock

Planned meals now remember their recipe's ingredients when a
suggestion is accepted. Mark Cooked scales those ingredients by
whatever serving size was last chosen for that slot and decrements
matching pantry items, then stamps cookedAt so it can't be clicked
twice for the same meal. This closes the gap the recovered prior
version never wired — cooking a meal there never touched pantry
stock at all."
```

---

### Task 5: Receipt/grocery-photo scanner → pantry

**Files:**
- Create: `src/components/familyos/ReceiptScanner.tsx`
- Modify: `src/components/familyos/sections/Pantry.tsx`

**Interfaces:**
- Consumes: `callClaudeVision`, `callGeminiVision`, `getGeminiDailyUsage`, `resetGeminiCount` (existing, `src/lib/familyos.ts` — same functions `ChoreScanner.tsx` already uses), `mergeIntoPantry`, `loadPantry`, `savePantry`, `PantryCategory` (Task 1).
- Produces: `<ReceiptScanner onClose={() => void} onSave={(items) => void} />` default export.

- [ ] **Step 1: Write the component**

Following `src/components/familyos/ChoreScanner.tsx`'s exact camera-capture skeleton (imports, `startCamera`/`stopAll`/`captureFrame` are copied verbatim from that file's proven implementation), with a receipt-specific prompt and result shape:

```tsx
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, ScanLine, Camera, Check, Trash2, Loader2 } from 'lucide-react';
import { callClaudeVision, callGeminiVision, getGeminiDailyUsage, resetGeminiCount, type PantryCategory } from '@/lib/familyos';

interface ScannedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: PantryCategory;
  selected: boolean;
}

interface Props {
  onClose: () => void;
  onSave: (items: { name: string; quantity: number; unit: string; category: PantryCategory }[]) => void;
}

type Provider = 'claude' | 'gemini';

const RECEIPT_PROMPT = `You are analyzing a grocery receipt or a photo of groceries/food items. Extract everything you can see.
If this is a photo of actual food/groceries (not a paper receipt), estimate reasonable quantities.

Return ONLY a valid JSON array (no markdown, no explanation) like:
[{"name":"Milk","quantity":1,"unit":"gallon","category":"dairy"},{"name":"Bananas","quantity":6,"unit":"","category":"produce"}]

Valid categories: produce, meat, dairy, bakery, pantry, frozen, beverages, household, personal-care, other
If nothing is identifiable, return an empty array: []`;

const ReceiptScanner: React.FC<Props> = ({ onClose, onSave }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [provider, setProvider] = useState<Provider>('claude');
  const [status, setStatus] = useState<string>('Starting camera…');
  const [analyzing, setAnalyzing] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[] | null>(null);
  const [geminiUsage, setGeminiUsage] = useState(() => getGeminiDailyUsage());

  useEffect(() => {
    startCamera();
    return () => stopAll();
  }, []);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Camera not available. Check browser permissions.');
        setCameraFailed(true);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setStatus('Ready');
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      setCameraFailed(true);
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setStatus('Camera permission denied. Allow it in your browser/device settings.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setStatus('No camera found on this device.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setStatus('Camera is in use by another app. Close it and try again.');
      } else {
        setStatus(`Camera error: ${(err as Error)?.message ?? 'unknown'}`);
      }
    }
  };

  const retryCamera = () => {
    setCameraFailed(false);
    setStatus('Starting camera…');
    startCamera();
  };

  const stopAll = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;
    const maxW = 1024;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    return dataUrl.split(',')[1];
  }, []);

  const callVision = useCallback(async (base64: string) => {
    if (provider === 'gemini') return callGeminiVision(base64, 'image/jpeg', RECEIPT_PROMPT);
    return callClaudeVision(base64, 'image/jpeg', RECEIPT_PROMPT);
  }, [provider]);

  const analyzeFrame = useCallback(async () => {
    if (analyzing) return;
    const base64 = captureFrame();
    if (!base64) { setStatus('Camera not ready — try again.'); return; }
    setAnalyzing(true);
    setStatus('Analyzing…');
    const result = await callVision(base64);
    setAnalyzing(false);
    if (provider === 'gemini') setGeminiUsage(getGeminiDailyUsage());
    if (!result.ok) { setStatus(`Error: ${result.text}`); return; }
    try {
      const raw = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (!arrMatch) { setStatus(`Bad response — no JSON found. Raw: ${raw.slice(0, 60)}`); return; }
      const parsed: Array<{ name: string; quantity: number; unit: string; category: string }> = JSON.parse(arrMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        setStatus('Nothing spotted. Try another angle.');
        return;
      }
      const VALID_CATEGORIES: PantryCategory[] = ['produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'personal-care', 'other'];
      setScannedItems(parsed.map((item) => ({
        id: `${Date.now()}-${Math.random()}`,
        name: item.name,
        quantity: item.quantity || 1,
        unit: item.unit || '',
        category: (VALID_CATEGORIES.includes(item.category as PantryCategory) ? item.category : 'other') as PantryCategory,
        selected: true,
      })));
      setStatus(`Found ${parsed.length} item${parsed.length > 1 ? 's' : ''}`);
    } catch {
      setStatus('Could not parse response. Try again.');
    }
  }, [analyzing, captureFrame, callVision]);

  const toggleItem = (id: string) => {
    setScannedItems((prev) => prev ? prev.map((i) => i.id === id ? { ...i, selected: !i.selected } : i) : null);
  };

  const updateQty = (id: string, qty: number) => {
    setScannedItems((prev) => prev ? prev.map((i) => i.id === id ? { ...i, quantity: Math.max(0, qty) } : i) : null);
  };

  const removeItem = (id: string) => {
    setScannedItems((prev) => prev ? prev.filter((i) => i.id !== id) : null);
  };

  const confirmSave = () => {
    if (!scannedItems) return;
    const selected = scannedItems.filter((i) => i.selected);
    onSave(selected.map(({ name, quantity, unit, category }) => ({ name, quantity, unit, category })));
    onClose();
  };

  const selectedCount = scannedItems?.filter((i) => i.selected).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-shrink-0" style={{ height: '45vh' }}>
        {!scannedItems && <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />}
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-6 h-6" /></button>
          <span className="text-white font-semibold text-sm">Scan Receipt / Groceries</span>
          <div className="w-6" />
        </div>

        {!scannedItems && (
          <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              <span className="text-white/80 text-xs flex-1">{status}</span>
              {cameraFailed && (
                <button onClick={retryCamera} className="text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white flex-shrink-0">Retry</button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
        {!scannedItems && (
          <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-800">
            <div className="flex rounded-lg overflow-hidden border border-slate-700">
              {(['gemini', 'claude'] as Provider[]).map((p) => (
                <button key={p} onClick={() => setProvider(p)}
                  className={`text-xs px-3 py-1.5 font-medium transition ${provider === p ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {p === 'gemini' ? 'Gemini ✦' : 'Claude'}
                </button>
              ))}
            </div>
            {provider === 'gemini' && (
              <span className={`text-xs ${geminiUsage.count >= geminiUsage.limit ? 'text-rose-400' : 'text-slate-500'}`}>
                {geminiUsage.count}/{geminiUsage.limit} today
              </span>
            )}
            <button
              onClick={analyzeFrame}
              disabled={analyzing || cameraFailed}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {analyzing ? 'Analyzing…' : 'Capture & Extract'}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {!scannedItems && (
            <div className="text-center text-slate-600 text-sm pt-6">Point camera at a receipt or groceries and tap Capture</div>
          )}
          {scannedItems && scannedItems.map((item) => (
            <div key={item.id} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${item.selected ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-slate-800/40 border-slate-700 opacity-50'}`}>
              <button onClick={() => toggleItem(item.id)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.selected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'}`}>
                {item.selected && <Check className="w-3 h-3 text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-white truncate">{item.name}</p>
                <p className="text-xs text-slate-400 capitalize">{item.category}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">−</button>
                <span className="w-8 text-center text-sm font-bold text-white">{item.quantity}</span>
                <button onClick={() => updateQty(item.id, item.quantity + 1)} className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">+</button>
                <span className="text-xs text-slate-500 ml-1 w-10 truncate">{item.unit}</span>
              </div>
              <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-rose-400 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>

        {scannedItems && (
          <div className="p-4 border-t border-slate-800 flex gap-2">
            <button onClick={() => setScannedItems(null)} className="flex-1 py-2.5 text-sm font-medium text-slate-400 border border-slate-700 rounded-xl hover:bg-slate-800">
              Rescan
            </button>
            <button
              onClick={confirmSave}
              disabled={selectedCount === 0}
              className="flex-1 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center gap-2"
            >
              <ScanLine className="w-4 h-4" /> Add {selectedCount} to Pantry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptScanner;
```

- [ ] **Step 2: Wire the scanner into `Pantry.tsx`**

In `src/components/familyos/sections/Pantry.tsx`, add the import and state:

```tsx
import ReceiptScanner from '@/components/familyos/ReceiptScanner';
import { mergeIntoPantry } from '@/lib/familyos';
```

```tsx
const [showScanner, setShowScanner] = useState(false);
```

Add the "Scan receipt" button next to the existing "Add Item" button (only when `canEdit`):

```tsx
{canEdit && (
  <button onClick={() => setShowScanner(true)} className="flex items-center gap-1 bg-violet-600 hover:bg-violet-500 text-white text-sm px-3 py-1.5 rounded-lg transition">
    <ScanLine className="w-4 h-4" /> Scan Receipt
  </button>
)}
```

(Add `ScanLine` to the existing `lucide-react` import line in `Pantry.tsx`.)

Add the scanner's confirm handler and render:

```tsx
const handleScanSave = (scanned: { name: string; quantity: number; unit: string; category: PantryCategory }[]) => {
  save(mergeIntoPantry(items, scanned));
};
```

```tsx
{showScanner && (
  <ReceiptScanner onClose={() => setShowScanner(false)} onSave={handleScanSave} />
)}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npx vite build`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

1. On the Pantry tab (as an admin), click "Scan Receipt" — confirm the camera view opens (grant camera permission if prompted).
2. Point at any grocery items or a receipt, tap "Capture & Extract" — confirm a list of detected items appears with editable quantities and checkboxes.
3. Uncheck one item, adjust another's quantity, then tap "Add N to Pantry" — confirm only the selected items appear/merge into the Pantry tab's list, with the edited quantity respected.
4. Scan again with an item that already exists in the pantry (same name+unit) — confirm its quantity increases (merge) rather than creating a duplicate row.

- [ ] **Step 5: Commit**

```bash
git add src/components/familyos/ReceiptScanner.tsx src/components/familyos/sections/Pantry.tsx
git commit -m "feat(pantry): add receipt/grocery-photo scanner

Reuses ChoreScanner.tsx's proven camera-capture skeleton with a
receipt-extraction prompt (via callClaudeVision/callGeminiVision,
same auth-fixed helpers ChoreScanner already uses) and an editable
review list before confirming into the pantry. Merges into existing
pantry items by name+unit via mergeIntoPantry() rather than creating
duplicates — this closes the gap in the recovered prior version,
where the equivalent scanner worked but was never actually wired to
anything (usePantry() had zero consumers)."
```

---

## Self-Review Notes

- **Spec coverage:** Goal 1 (Pantry section) → Tasks 1–2. Goal 2 (structured ingredients + serving scaling) → Task 3. Goal 3 (pantry-aware shortfall) → Task 3 Step 7. Goal 4 (Mark Cooked decrement) → Task 4. Goal 5 (receipt scanner) → Task 5.
- **Non-goals respected:** no Spoonacular/Edamam integration (Task 3 keeps the existing AI-proxy pattern). No auto-decrement on calendar date passing (Task 4 is explicitly manual-click only). No unit conversion or fuzzy ingredient matching anywhere (Task 1's exact-match functions are used consistently by Tasks 3–5).
- **Architecture correction from the spec:** same correction as the sibling preferences plan — `dbGet`/`dbSet` referenced in the approved spec are server-only; this plan uses `loadJSON`/`saveJSON` throughout. Additionally corrected: the spec's `ShoppingItem` sketch (with a pantry-style `category` enum and a `unit`/`fromMealKey` field) didn't match this repo's actual `ShoppingItem` shape (`Groceries`/`Household`/`School`/`Other` categories, `assignedTo`, string `quantity`, no `unit` field) — Task 3 keeps shopping-list items in their real existing shape and does not add a `unit` field to them (the scaled ingredient's unit is folded into the stored quantity string context, matching how this app already stores shopping quantities as free-form strings).
- **Type consistency:** `PantryItem`, `PantryCategory`, `loadPantry`/`savePantry`, `findPantryItem`/`mergeIntoPantry`/`decrementPantry`/`calculateShortfall` are defined once in Task 1 and used with identical names/signatures in Tasks 2, 3, 4, and 5. `scaleIngredients` is defined once in Task 3 and reused identically in Task 4.
- **Dependency ordering:** Task 2 depends on Task 1 (pantry model). Task 3 depends on Tasks 1 (pantry shortfall) and the already-complete sibling preferences plan (food-preference prompt, already wired). Task 4 depends on Tasks 1 and 3 (scaleIngredients). Task 5 depends on Task 1 (mergeIntoPantry) and Task 2 (Pantry.tsx to wire the button into). Tasks must execute in this order.
