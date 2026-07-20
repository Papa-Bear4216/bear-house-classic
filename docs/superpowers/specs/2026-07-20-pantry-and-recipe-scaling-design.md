# Pantry, Scalable Recipes, and Receipt Scanning — Design Spec

Date: 2026-07-20

## Context

This is a **recovery**, not new-feature design. A prior version of this app
(`Papa-Bear4216/bear-house-os`, the pre-"classic" Next.js/Firebase repo) had
three related pieces built:

1. **Meal planner + shopping sync** — real, working. A weekly grid; picking a
   recipe for a slot auto-added its ingredients to a shared shopping list,
   merging quantities for ingredients already present.
2. **Serving-size scaling** — half-built. The shopping-sync function already
   accepted a `multiplier` parameter, but the recipe-picker UI never exposed
   a control to set it — every call used the default of `1`. Designed for,
   never finished.
3. **Pantry with on-hand quantities** — built but orphaned. A complete
   `usePantry()` data hook existed (items with quantity/unit/category/
   in-stock), but no page or component in the entire old repo ever called
   it. Live code, zero consumers.
4. **Receipt-to-pantry OCR scanning** — real and working, and the most
   complete piece. Camera capture → Gemini Vision extracts store name,
   total, and a structured item list → editable review screen with quantity
   steppers → confirm writes into pantry or shopping list.

This spec covers rebuilding (1) and (4) as they worked, finishing (2)'s
missing UI control, and building (3) for real — with the three actually
wired together this time, which the old version never did.

## Goals

1. A **Pantry** section with on-hand quantities per item, always visible
   and editable, that other features actually read from and write to.
2. A recipe-suggestion flow (in the existing `MealPlanner.tsx`) that returns
   a **structured ingredient list** (name/quantity/unit) instead of just a
   meal name, and lets the user pick a serving-size multiplier before
   adding it to a day's plan.
3. Adding a scaled recipe to the week only pushes the **shortfall** to the
   shopping list — ingredients already covered by pantry stock are skipped
   or partially added.
4. A **"Mark cooked"** action on a planned meal that decrements pantry
   stock by that meal's scaled ingredient amounts.
5. A **receipt/grocery-photo scanner** (camera → Gemini Vision → editable
   review → confirm) that adds items to the pantry, incrementing existing
   items' on-hand quantities rather than duplicating them.

## Non-goals

- A real online recipe database (Spoonacular/Edamam) — explicitly rejected
  in favor of reusing this app's existing AI-proxy pattern (Claude/Gemini
  via `api/chat.ts`), since a real recipe API needs a new paid subscription
  this app doesn't otherwise require.
- Automatic pantry decrement on a meal's calendar date passing — decrement
  only happens via an explicit "Mark cooked" click, matching this app's
  existing preference for manual confirm-actions over silent automation.
- Barcode scanning, expiration-date tracking, or nutrition data — none of
  this existed in the recovered version and none was asked for.
- Multi-unit conversion (e.g. auto-converting "2 cups" pantry stock against
  a recipe asking for "16 oz") — out of scope; shortfall comparison matches
  on ingredient name + unit exactly (see Data model note below).

## Data model

Following this app's existing convention (a single `family_data` key-value
table per household, read via `dbGet`/written via `dbSet` — no new Postgres
tables), one new key:

```ts
// family_data key: 'familyos_pantry'
interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: 'produce' | 'meat' | 'dairy' | 'bakery' | 'pantry' | 'frozen'
    | 'beverages' | 'household' | 'personal-care' | 'other';
  updatedAt: number;
}
```

`familyos_shopping` (existing key, already used by `MealPlanner.tsx`'s
`addIngredientsToShopping`) gains two optional fields on each item, only
set when the item came from a scaled recipe (not required for manually
added items):

```ts
interface ShoppingItem {
  // ...existing fields (id, name, category, quantity, assignedTo, completed, createdAt, source)
  unit?: string;           // e.g. "cups", "lb" — only present for recipe-sourced items
  fromMealKey?: string;    // "Monday-Dinner" — links back to the plan slot, for "Mark cooked"
}
```

`familyos_meals` (existing key) gains a `servingsMultiplier` and a real
`ingredients` array on each day's plan slot, instead of just a meal-name
string:

```ts
interface DayPlan {
  Breakfast: string; Lunch: string; Dinner: string; // meal names, unchanged
  cook: string; // unchanged
  ingredients?: Record<'Breakfast' | 'Lunch' | 'Dinner', {
    name: string; quantity: number; unit: string;
  }[]>;
  servingsMultiplier?: Record<'Breakfast' | 'Lunch' | 'Dinner', number>;
  cookedAt?: Record<'Breakfast' | 'Lunch' | 'Dinner', number>; // set by "Mark cooked"
}
```

**Ingredient matching for pantry shortfall/decrement is exact-match on
`name.toLowerCase()` + `unit`** (no fuzzy matching, no unit conversion) —
same simple approach the old `use-shopping.ts` used for merging duplicate
shopping items. If a recipe says "2 cups flour" and pantry has "1 lb
flour," they're treated as unrelated items (shortfall = full 2 cups,
decrement skips the lb entry). This is a known, accepted limitation —
matches the old version's behavior exactly, not a regression.

## Recipe suggestions: structured ingredients

`MealPlanner.tsx`'s existing `fetchSuggestion()` AI prompt (in
`src/components/familyos/sections/MealPlanner.tsx`) currently asks for a
`Recipe` with a `shoppingNeeded: string[]` (bare ingredient names, no
quantities — this is the exact gap that makes scaling impossible today).
The prompt and response schema change to:

```ts
interface Recipe {
  name: string;
  description: string;
  time: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  servings: number; // NEW — the recipe's default serving count
  recipe: { ingredients: { name: string; quantity: number; unit: string }[]; steps: string[] }; // CHANGED — was string[]
}
```

The AI prompt gains one instruction: "Return ingredients as a structured
array with numeric quantity and a short unit string (e.g. 'cups', 'lb',
'', for count-only items like eggs) — not free-text lines." This is a
prompt-engineering change only; no new AI provider, no new cost pattern.

## UI changes

### 1. Serving-size control (finishes the half-built piece)

When a recipe suggestion is expanded (`MealPlanner.tsx`'s existing
`expanded`/`suggestion` state), add a serving-size stepper next to the
recipe card: `− [servings] +`, defaulting to the recipe's own `servings`
value. Changing it live-recalculates displayed ingredient quantities
(`quantity * (chosenServings / recipe.servings)`) — pure display math, no
network call. The existing "Add N to shopping" button now passes the
scaled quantities, not the raw recipe quantities.

### 2. Pantry-aware shopping add

Before adding scaled ingredients to `familyos_shopping`, check
`familyos_pantry` for a same-name-and-unit entry. If pantry quantity ≥
needed quantity, skip that ingredient entirely. If pantry quantity > 0 but
less than needed, add only the shortfall (`needed - onHand`). If no pantry
entry exists, add the full needed amount — matches Goal 3.

### 3. New Pantry tab

A new section (`src/components/familyos/sections/Pantry.tsx`), added to
the same section-registry pattern `MealPlanner.tsx`/`Shopping.tsx` already
use. Shows items grouped by category (matching the old
`PANTRY_CATEGORY_EMOJI` grouping), each with a name, quantity + unit, and
+/− steppers to adjust on hand count manually. A "Scan receipt" button
opens the new scanner (see below).

### 4. "Mark cooked" button

On each planned meal in the week grid (`MealPlanner.tsx`), a small
checkmark button appears once a recipe has been assigned to that slot.
Clicking it: for each ingredient in that slot's `ingredients` array,
decrements the matching pantry item by `quantity * servingsMultiplier`
(clamped at 0, never negative — matches the old scanner's
`Math.max(0, qty)` pattern), then stamps `cookedAt` on that slot so the
button can't be clicked twice for the same meal.

### 5. Receipt scanner

New `src/components/familyos/ReceiptScanner.tsx`, following the exact
camera-capture skeleton already proven in `src/components/familyos/
ChoreScanner.tsx` (getUserMedia → canvas frame capture → base64 → AI
vision call) rather than porting the old Firestore-era component
verbatim. Calls `callClaudeVision` (already auth-fixed this session, see
`src/lib/familyos.ts`) with a receipt-extraction prompt asking for the
same shape as the old `receiptSchema`: `{storeName, total, items: [{name,
quantity, unit, category, price?}]}`. Results show as an editable list
(checkbox to include/exclude each item, +/− quantity steppers) before a
final "Add N items to Pantry" confirms — merges into existing pantry items
by name+unit (increments quantity) or creates new ones.

## Error handling

- AI-returned JSON that fails to parse (recipe suggestion or receipt scan):
  show an inline retry option, same pattern already used by
  `fetchSuggestion`'s existing try/catch.
- Camera permission denied in `ReceiptScanner`: same inline error +
  "Retry" button pattern already in `ChoreScanner.tsx`.
- Pantry shortfall math never produces negative shopping-list quantities
  (clamped to 0, item simply isn't added if shortfall is 0 or negative).

## Testing

No new test framework needed — this reuses the Vitest setup added earlier
this session. Add unit tests for the pure functions with no I/O:
serving-size scaling math, pantry-shortfall calculation, and the
exact-match ingredient-merging logic — these are exactly the kind of
easy-to-get-subtly-wrong arithmetic that benefits most from a test, and
they don't require mocking Supabase like the existing `_db.test.ts`/
`_billingAuth.test.ts` do.

## Open items carried into implementation planning

- Exact wording of the updated AI recipe-suggestion prompt — draft during
  planning, following the existing prompt's tone/structure in
  `MealPlanner.tsx`.
- Whether `Pantry.tsx` needs its own admin-gating (child role can view but
  not edit?) — this app's existing sections vary; decide during planning
  by checking how `Shopping.tsx`/`HomeMaintenance.tsx` handle this today.
- The default household starts with an empty pantry (no seed data) —
  matches how a fresh household starts empty everywhere else in this app.
