# Nav & App Shell Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7-item top nav + admin-only 3-item "More" dropdown with a personalized structure: each family member picks 3 "core" modules (Dashboard is always a 4th, permanent slot), everything else lives behind a single "More" menu available to every role (not just admins), and the whole nav collapses into one animated, icon-first bottom dock used at every screen width. Hermes (the floating AI assistant) is restyled to match but keeps its current floating-button behavior — it is not a nav-bar slot.

**Architecture:** A single new role-and-preference-aware visibility predicate (`getVisibleModulesFor(role)`) becomes the one source of truth for what a given role may ever see, consumed identically by three places that previously each partially reimplemented this logic: the core-dock computation, the More-menu computation, and the new Settings picker's available options. `MemberPreferences` gains a `coreNav` field (per-member, persisted the same way every other preference field already is). The existing bottom-nav JSX becomes the only nav (desktop top-pill nav is deleted); a CSS-only sliding pill indicates the active item.

**Tech Stack:** Existing React/TypeScript/Tailwind stack, no new dependencies (no Framer Motion — pure CSS transform/transition for the active-state animation).

## Global Constraints

- **`restrictedForChild` (`AppLayout.tsx:177`, `['health', 'finance', 'quality', 'promises', 'emotions']`) remains the absolute ceiling on what a child role can ever see, reach, pick, or land in More.** This is enforced today at the render level (`renderModule()`'s parents-only wall) and must stay enforced at the *visibility* level too after this plan, so a child never even sees an icon that dead-ends at that wall.
- **A child's role-visible module set today is exactly `{dashboard, household, rewards, kids, family}`** (5 items — `MAIN_NAV` minus `health`/`finance`/`finance.adminOnly`, and `quality`/`promises`/`emotions` were never in `MAIN_NAV` to begin with). With the default `coreNav = ['household', 'family', 'rewards']`, a child's leftover-for-More set is exactly `{kids}` — **this one item must render in More for children**, meaning the More menu can no longer be `isAdm`-gated. Gating More by role must instead be "does this role have any modules outside their core-4" — which is true for every role given the current module counts (child: 1 leftover; admin: 6 leftover assuming default core).
- **A single predicate function is the only place role-based module visibility is computed.** Do not reintroduce a second/duplicate filter inline anywhere (core dock, More menu, and the Settings picker must all call the same function).
- **No new npm dependency.** The active-state animation is CSS-only (`transform`/`transition`), matching how the rest of this codebase already animates (`hover:scale-[1.02]`, `transition-all`, etc.).
- **Out of scope, do not touch:** `HouseholdBrain.tsx` internals, `Dashboard.tsx` internals beyond nothing (this plan doesn't touch Dashboard at all), and all `sections/*.tsx` internals — only how modules are *reached* changes, not their contents.
- **`prefers-reduced-motion` must disable the pill-slide transition** (snap instantly instead) — a plain CSS media query addition, not new logic.

---

## File Structure

- **Modify:** `src/lib/familyos.ts` — add `TopModule` type export (moved here from `AppLayout.tsx` so both files can share it without a circular import), add `coreNav` to `MemberPreferences`, update `emptyMemberPreferences()`.
- **Create:** `src/lib/navVisibility.ts` — the single `getVisibleModulesFor(role)` predicate, the full module metadata list (today's `MAIN_NAV` + `MORE_NAV` merged), and a `DEFAULT_CORE_NAV` constant.
- **Modify:** `src/components/AppLayout.tsx` — remove desktop top-pill nav block, remove `MAIN_NAV`/`MORE_NAV`/`TopModule` (now imported from `navVisibility.ts`/`familyos.ts`), compute core dock + More contents from the new predicate + current user's `coreNav`, add the sliding-pill active-state indicator, restyle Hermes-adjacent spacing if needed.
- **Modify:** `src/components/familyos/HermesChat.tsx` — restyle floating button from violet to honey/bark palette; verify/adjust position against new dock height.
- **Modify:** `src/components/familyos/SettingsModal.tsx` — add "My Navigation" block inside the existing `general` tab.

---

### Task 1: Add shared module-visibility predicate and extend MemberPreferences

**Files:**
- Create: `src/lib/navVisibility.ts`
- Modify: `src/lib/familyos.ts:144-172` (the `MemberPreferences` interface and `emptyMemberPreferences()`)
- Test: `src/lib/navVisibility.test.ts`

**Interfaces:**
- Produces: `TopModule` type, `NavModule` interface (`{ id: TopModule; label: string; icon: LucideIcon; }`), `ALL_MODULES: NavModule[]` (the merged 10-item list), `DEFAULT_CORE_NAV: TopModule[]` (`['household', 'family', 'rewards']`), `getVisibleModulesFor(role: UserRole): NavModule[]` — consumed by Task 2 (AppLayout) and Task 3 (SettingsModal).
- Consumes: `UserRole` from `familyos.ts` (already exists, `familyos.ts:4`).

- [ ] **Step 1: Write the failing test for `getVisibleModulesFor`**

Create `src/lib/navVisibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getVisibleModulesFor, ALL_MODULES, DEFAULT_CORE_NAV } from './navVisibility';

describe('getVisibleModulesFor', () => {
  it('returns all 10 modules for superadmin', () => {
    const visible = getVisibleModulesFor('superadmin');
    expect(visible.map(m => m.id).sort()).toEqual(ALL_MODULES.map(m => m.id).sort());
  });

  it('returns all 10 modules for admin', () => {
    const visible = getVisibleModulesFor('admin');
    expect(visible.length).toBe(10);
  });

  it('returns exactly 5 modules for child, excluding health/finance/quality/promises/emotions', () => {
    const visible = getVisibleModulesFor('child');
    const ids = visible.map(m => m.id).sort();
    expect(ids).toEqual(['dashboard', 'family', 'household', 'kids', 'rewards'].sort());
  });
});

describe('DEFAULT_CORE_NAV', () => {
  it('is exactly 3 modules and never includes dashboard', () => {
    expect(DEFAULT_CORE_NAV.length).toBe(3);
    expect(DEFAULT_CORE_NAV).not.toContain('dashboard');
  });

  it('leaves exactly one module (kids) visible-but-uncore for a child', () => {
    const visible = getVisibleModulesFor('child').map(m => m.id);
    const leftover = visible.filter(id => id !== 'dashboard' && !DEFAULT_CORE_NAV.includes(id));
    expect(leftover).toEqual(['kids']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/navVisibility.test.ts`
Expected: FAIL — `Cannot find module './navVisibility'`

- [ ] **Step 3: Write `navVisibility.ts`**

Create `src/lib/navVisibility.ts`:

```ts
import {
  Home, Calendar, Handshake, Heart, LayoutDashboard, Users, DollarSign, Baby, Trophy,
} from 'lucide-react';
import type { UserRole } from './familyos';

export type TopModule =
  | 'dashboard' | 'household' | 'kids' | 'family' | 'health' | 'finance'
  | 'rewards' | 'quality' | 'promises' | 'emotions';

export interface NavModule {
  id: TopModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const ALL_MODULES: NavModule[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'household', label: 'Household', icon: Home },
  { id: 'rewards', label: 'Rewards', icon: Trophy },
  { id: 'kids', label: 'Kids', icon: Baby },
  { id: 'family', label: 'Family', icon: Users },
  { id: 'health', label: 'Health', icon: Heart },
  { id: 'finance', label: 'Finance', icon: DollarSign },
  { id: 'quality', label: 'Quality Time', icon: Calendar },
  { id: 'promises', label: 'Promises', icon: Handshake },
  { id: 'emotions', label: 'Emotions', icon: Heart },
];

const CHILD_RESTRICTED: TopModule[] = ['health', 'finance', 'quality', 'promises', 'emotions'];
const ADMIN_ONLY: TopModule[] = ['finance'];

export function isModuleVisibleTo(role: UserRole, id: TopModule): boolean {
  if (role === 'child' && CHILD_RESTRICTED.includes(id)) return false;
  if (role !== 'superadmin' && role !== 'admin' && ADMIN_ONLY.includes(id)) return false;
  return true;
}

export function getVisibleModulesFor(role: UserRole): NavModule[] {
  return ALL_MODULES.filter((m) => isModuleVisibleTo(role, m.id));
}

export const DEFAULT_CORE_NAV: TopModule[] = ['household', 'family', 'rewards'];
```

Note: `ADMIN_ONLY` is checked independently of `CHILD_RESTRICTED` (not merged into one list) because they express different things — `CHILD_RESTRICTED` is specifically about the child role and includes modules an admin absolutely can see (`quality`/`promises`/`emotions`), while `ADMIN_ONLY` blocks `finance` for any non-admin role, which today only means `child` in practice but is written role-agnostically to match the original `adminOnly` flag's intent at `AppLayout.tsx:47`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/navVisibility.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Add `coreNav` to `MemberPreferences`**

In `src/lib/familyos.ts`, change the `MemberPreferences` interface (lines 144-157) from:

```ts
export interface MemberPreferences {
  memberId: string;
  food: {
    likes: string[];
    dislikes: string[];
    allergies: string[];
    diet: string[];
    otherNotes: string;
  };
  hobbies: { selected: string[]; otherNotes: string };
  entertainment: { selected: string[]; otherNotes: string };
  healthNotes: { selected: string[]; otherNotes: string };
  updatedAt: number;
}
```

to:

```ts
export interface MemberPreferences {
  memberId: string;
  food: {
    likes: string[];
    dislikes: string[];
    allergies: string[];
    diet: string[];
    otherNotes: string;
  };
  hobbies: { selected: string[]; otherNotes: string };
  entertainment: { selected: string[]; otherNotes: string };
  healthNotes: { selected: string[]; otherNotes: string };
  coreNav: TopModule[];
  updatedAt: number;
}
```

Add the import at the top of `familyos.ts` (after the existing imports/type declarations near the top of the file):

```ts
import type { TopModule } from './navVisibility';
```

Change `emptyMemberPreferences()` (lines 163-172) from:

```ts
export function emptyMemberPreferences(memberId: string): MemberPreferences {
  return {
    memberId,
    food: { likes: [], dislikes: [], allergies: [], diet: [], otherNotes: '' },
    hobbies: { selected: [], otherNotes: '' },
    entertainment: { selected: [], otherNotes: '' },
    healthNotes: { selected: [], otherNotes: '' },
    updatedAt: 0,
  };
}
```

to:

```ts
export function emptyMemberPreferences(memberId: string): MemberPreferences {
  return {
    memberId,
    food: { likes: [], dislikes: [], allergies: [], diet: [], otherNotes: '' },
    hobbies: { selected: [], otherNotes: '' },
    entertainment: { selected: [], otherNotes: '' },
    healthNotes: { selected: [], otherNotes: '' },
    coreNav: ['household', 'family', 'rewards'],
    updatedAt: 0,
  };
}
```

(Inlining the literal array here rather than importing `DEFAULT_CORE_NAV` from `navVisibility.ts` avoids a new import cycle risk — `familyos.ts` already imports `type { TopModule }` from `navVisibility.ts` for the interface field; keeping the default as a literal here means `navVisibility.ts` never needs to import anything from `familyos.ts` back, preserving a one-directional dependency.)

- [ ] **Step 6: Run full existing test suite to check for regressions**

Run: `npx vitest run`
Expected: all previously-passing tests still pass, plus the 5 new `navVisibility` tests (145 total, up from 140).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "familyos\|navVisibility\|MemberProfileModal"`

Expected: no new errors. If `MemberProfileModal.tsx` (which constructs/spreads `MemberPreferences` objects) errors about a missing `coreNav` field, that means some other file directly constructs a `MemberPreferences` literal instead of going through `emptyMemberPreferences()` — read that file and fix the literal to include `coreNav`, following the same default array used in Step 5.

- [ ] **Step 8: Commit**

```bash
git add src/lib/navVisibility.ts src/lib/navVisibility.test.ts src/lib/familyos.ts
git commit -m "feat(nav): add role-visibility predicate and per-member coreNav preference"
```

---

### Task 2: Restructure AppLayout's nav into a single animated bottom dock

**Files:**
- Modify: `src/components/AppLayout.tsx`

**Interfaces:**
- Consumes: `TopModule`, `NavModule`, `ALL_MODULES`, `getVisibleModulesFor`, `DEFAULT_CORE_NAV` from `src/lib/navVisibility.ts` (Task 1); `loadMemberPreferences` from `src/lib/familyos.ts` (already exists).
- Produces: no new exports — this task only changes `AppLayout.tsx`'s internal nav rendering and computation.

**Context:** Read the full current file with the Read tool immediately before editing — this task removes/replaces large contiguous blocks (the desktop nav section, the `MAIN_NAV`/`MORE_NAV` constants, the mobile nav section) and stale line numbers from a prior read would cause a bad edit. `currentUser.id` is the member ID to pass to `loadMemberPreferences()`.

- [ ] **Step 1: Remove the local `TopModule` type, `NavItem` interface, `MAIN_NAV`, `MORE_NAV`, and `COLOR_DOT`'s unrelated-ness check; import from `navVisibility.ts` instead**

Change the top of the file (current lines 1-72) — replace the icon imports, remove the now-shared type/constants, and add the new imports. From:

```tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home, Calendar, Handshake, Heart, LayoutDashboard, Settings as SettingsIcon,
  Search, History, Users, DollarSign, ChevronUp, ChevronDown, LogOut,
  ShoppingCart, Utensils, Receipt, Car, Wrench, Baby, Brain, Package, Trophy
} from 'lucide-react';

import { KEYS, loadJSON, isOverdue, formatTime } from '@/lib/familyos';
```

to:

```tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings as SettingsIcon, Search, History, ChevronUp, LogOut,
  ShoppingCart, Utensils, Receipt, Car, Wrench, Brain, Package, Home, Grid2x2,
} from 'lucide-react';

import { KEYS, loadJSON, isOverdue, formatTime, loadMemberPreferences } from '@/lib/familyos';
import { ALL_MODULES, getVisibleModulesFor, type TopModule } from '@/lib/navVisibility';
```

(`Grid2x2` is added as the "More" trigger icon, replacing the old text-label "More" button — an icon-first dock has no room for a text-only nav item; `ChevronDown` is dropped since the desktop dropdown chevron is removed along with the desktop dropdown. `Home` is kept because `HOUSEHOLD_TABS`, further down, still uses it for the "Tasks" sub-tab icon.)

Then delete the old `type TopModule = ...` line, the `NavItem` interface, the `MAIN_NAV` array, and the `MORE_NAV` array entirely (current lines 35-54):

```tsx
type TopModule = 'dashboard' | 'household' | 'kids' | 'family' | 'health' | 'finance' | 'rewards' | 'quality' | 'promises' | 'emotions';
type HouseholdTab = 'tasks' | 'shopping' | 'meals' | 'pantry' | 'bills' | 'home' | 'cars' | 'brain';

interface NavItem { id: TopModule; label: string; icon: React.ComponentType<{ className?: string }>; accent: string; adminOnly?: boolean; }

const MAIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, accent: 'indigo' },
  { id: 'household', label: 'Household', icon: Home, accent: 'orange' },
  { id: 'rewards', label: 'Rewards', icon: Trophy, accent: 'amber' },
  { id: 'kids', label: 'Kids', icon: Baby, accent: 'purple' },
  { id: 'family', label: 'Family', icon: Users, accent: 'blue' },
  { id: 'health', label: 'Health', icon: Heart, accent: 'rose' },
  { id: 'finance', label: 'Finance', icon: DollarSign, accent: 'emerald', adminOnly: true },
];

const MORE_NAV: NavItem[] = [
  { id: 'quality', label: 'Quality Time', icon: Calendar, accent: 'purple' },
  { id: 'promises', label: 'Promises', icon: Handshake, accent: 'blue' },
  { id: 'emotions', label: 'Emotions', icon: Heart, accent: 'rose' },
];
```

Replace it with just the `HouseholdTab` type (still local, unrelated to this restructure):

```tsx
type HouseholdTab = 'tasks' | 'shopping' | 'meals' | 'pantry' | 'bills' | 'home' | 'cars' | 'brain';
```

`COLOR_DOT` (current lines 67-72) is unrelated to nav modules (it's the small presence-dot color next to the user's name) — leave it exactly as-is.

- [ ] **Step 2: Compute the core dock and More-menu contents from the current user's role and preferences**

Inside the `AppLayout` component body, after the existing `const isAdm = ...` line (current line 77), add:

```tsx
  const visibleModules = useMemo(
    () => (currentRole ? getVisibleModulesFor(currentRole) : []),
    [currentRole]
  );

  const coreNav = useMemo(() => {
    if (!currentUser) return [] as TopModule[];
    const prefs = loadMemberPreferences(currentUser.id);
    // Defensive fallback: drop any saved pick this role can no longer see (see navVisibility.ts's isModuleVisibleTo).
    const visibleIds = new Set(visibleModules.map((m) => m.id));
    const valid = prefs.coreNav.filter((id) => visibleIds.has(id));
    // Backfill from the default list if a role change or corrupted preference left fewer than 3 valid picks.
    for (const fallback of ['household', 'family', 'rewards', 'kids'] as TopModule[]) {
      if (valid.length >= 3) break;
      if (visibleIds.has(fallback) && !valid.includes(fallback)) valid.push(fallback);
    }
    return valid.slice(0, 3);
  }, [currentUser, visibleModules]);

  const dockModules = useMemo(
    () => ['dashboard' as TopModule, ...coreNav]
      .map((id) => visibleModules.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [coreNav, visibleModules]
  );

  const moreModules = useMemo(
    () => visibleModules.filter((m) => m.id !== 'dashboard' && !coreNav.includes(m.id)),
    [visibleModules, coreNav]
  );
```

(`dockModules` is always `[dashboard, ...coreNav]` in that fixed order — Dashboard is never reordered by the user, per the design's "Dashboard always core, permanent, unselectable" rule. `moreModules` is whatever's left of that role's visible set — for a child with default preferences this is exactly `[kids]`, per Task 1's test; for an admin with default preferences this is `[health, finance, quality, promises, emotions]` plus whichever of `household`/`family`/`rewards` weren't picked as core, i.e. none, since all three are the default — so 5 modules for an admin who hasn't customized yet.)

- [ ] **Step 3: Delete `visibleMainNav` (now replaced by `dockModules`/`moreModules`) and the old `restrictedForChild` array inside `renderModule` (now redundant with the predicate)**

Delete current lines 162-167:

```tsx
  // Visible nav items based on role
  const visibleMainNav = MAIN_NAV.filter(n => {
    if (isChild && (n.id === 'health' || n.id === 'finance')) return false;
    if (n.adminOnly && !isAdm) return false;
    return true;
  });
```

Inside `renderModule()` (current lines 175-184), change:

```tsx
  const renderModule = () => {
    // Redirect child away from restricted modules
    const restrictedForChild: TopModule[] = ['health', 'finance', 'quality', 'promises', 'emotions'];
    if (isChild && restrictedForChild.includes(active)) {
      return (
        <div className="text-center py-16">
          <div className="text-slate-500 text-lg">This section is for parents only.</div>
        </div>
      );
    }
```

to:

```tsx
  const renderModule = () => {
    // Redirect a role away from a module it can't see — defense in depth alongside
    // the nav-level filtering in dockModules/moreModules (navVisibility.ts is the
    // single source of truth for the restriction itself).
    if (currentRole && !visibleModules.some((m) => m.id === active)) {
      return (
        <div className="text-center py-16">
          <div className="text-cream-400/60 text-lg">This section isn't available for your account.</div>
        </div>
      );
    }
```

(This keeps the render-level guard — defense in depth is still correct — but derives it from the same `visibleModules` predicate instead of a second hardcoded list, so the two can never drift out of sync again. Copy also softened from "This section is for parents only" since the guard is no longer child-specific phrasing tied to one role.)

- [ ] **Step 4: Remove the entire desktop nav block from the header**

Delete current lines 319-366 in full (the `{/* Desktop nav */}` block, including its `visibleMainNav.map`, the admin-only More dropdown, and its `showMore`/`ChevronUp`/`ChevronDown` JSX) — this entire `<div className="max-w-6xl mx-auto px-4 hidden md:flex ...">...</div>` block is deleted, not modified, since the unified single-dock design has no separate desktop nav.

- [ ] **Step 5: Replace the mobile bottom nav with the unified always-visible dock, including the sliding active-state pill**

Change the current `{/* Mobile bottom nav */}` block (lines 383-431) from:

```tsx
      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#1E0E04]/95 backdrop-blur-md border-t border-[#F8DABC]/10 px-2 py-2">
        {/* More drawer */}
        {showMore && isAdm && (
          <div className="flex gap-1 justify-around mb-2 pb-2 border-b border-[#F8DABC]/10">
            {MORE_NAV.map(n => {
              const Icon = n.icon;
              const isActive = active === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => { setActive(n.id); setShowMore(false); }}
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg transition ${isActive ? 'text-[#F5A800]' : 'text-white/40'}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-medium">{n.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={`grid gap-1 ${isAdm ? 'grid-cols-7' : 'grid-cols-5'}`}>
          {visibleMainNav.map((n) => {
            const Icon = n.icon;
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setActive(n.id)}
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${isActive ? 'text-[#F5A800]' : 'text-white/40'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-medium">{n.label.split(' ')[0]}</span>
              </button>
            );
          })}

          {isAdm && (
            <button
              onClick={() => setShowMore(m => !m)}
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${showMore ? 'text-white' : 'text-white/40'}`}
            >
              <ChevronUp className={`w-5 h-5 transition ${showMore ? 'rotate-180' : ''}`} />
              <span className="text-[9px] font-medium">More</span>
            </button>
          )}
        </div>
      </nav>
```

to:

```tsx
      {/* Unified bottom dock — all breakpoints */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#1E0E04]/95 backdrop-blur-md border-t border-[#F8DABC]/10 px-2 py-2">
        {/* More drawer */}
        {showMore && moreModules.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-around mb-2 pb-2 border-b border-[#F8DABC]/10">
            {moreModules.map(n => {
              const Icon = n.icon;
              const isActive = active === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => { setActive(n.id); setShowMore(false); }}
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg transition focus-ring ${isActive ? 'text-[#F5A800]' : 'text-white/40 hover:text-white'}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-medium">{n.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        )}

        <div
          className="relative grid gap-1"
          style={{ gridTemplateColumns: `repeat(${dockModules.length + (moreModules.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
        >
          {/* Sliding active-state pill */}
          <div
            className="absolute inset-y-0 rounded-lg bg-white/5 transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{
              width: `${100 / (dockModules.length + (moreModules.length > 0 ? 1 : 0))}%`,
              transform: `translateX(${dockSlotIndex * 100}%)`,
            }}
          />

          {dockModules.map((n) => {
            const Icon = n.icon;
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setActive(n.id)}
                className={`relative flex flex-col items-center gap-0.5 py-2 rounded-lg transition-transform focus-ring ${isActive ? 'text-[#F5A800] scale-110' : 'text-white/40 hover:text-white'}`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-[9px] font-medium">{n.label.split(' ')[0]}</span>
              </button>
            );
          })}

          {moreModules.length > 0 && (
            <button
              onClick={() => setShowMore(m => !m)}
              className={`relative flex flex-col items-center gap-0.5 py-2 rounded-lg transition-transform focus-ring ${showMore ? 'text-white scale-110' : 'text-white/40 hover:text-white'}`}
            >
              <Grid2x2 className="w-6 h-6" />
              <span className="text-[9px] font-medium">More</span>
            </button>
          )}
        </div>
      </nav>
```

This references a `dockSlotIndex` value that must be computed — add it as another `useMemo` alongside `dockModules`/`moreModules` from Step 2:

```tsx
  const dockSlotIndex = useMemo(() => {
    const idx = dockModules.findIndex((m) => m.id === active);
    return idx >= 0 ? idx : dockModules.length; // "More" slot (last) when a More-menu module is active
  }, [dockModules, active]);
```

(The pill slides to the last slot — the "More" button's position — whenever the active module is one of the `moreModules`, e.g. Health/Finance/Quality Time, giving a visual cue that "you're in a More-menu screen" without needing a separate visual state.)

- [ ] **Step 6: Update `main`'s bottom padding now that the dock is universal, not mobile-only**

Change the current `<main>` tag (line 377) from:

```tsx
      <main className="max-w-6xl mx-auto px-4 py-6 pb-28 md:pb-10 transition-opacity duration-300" key={active}>
```

to:

```tsx
      <main className="max-w-6xl mx-auto px-4 py-6 pb-28 transition-opacity duration-300" key={active}>
```

(`md:pb-10` is removed since the dock — and thus the need for bottom clearance — is no longer mobile-only.)

- [ ] **Step 7: Check keyboard shortcuts still reference valid modules**

The existing keyboard shortcut handler (current lines 127-137) hardcodes `setActive('household')`, `setActive('promises')`, `setActive('emotions')` for `n`/`p`/`e` keys. These are unaffected by this task (they set `active` directly, bypassing nav rendering entirely) — no change needed, but confirm by reading the handler that it still compiles and these three modules still exist in `ALL_MODULES` (they do, per Task 1's `ALL_MODULES` list). No code change in this step, verification only.

- [ ] **Step 8: Verify Hermes's floating position doesn't collide with the new universal dock**

The dock is now present on all breakpoints (previously desktop had no bottom dock at all, only the top nav). Read `src/components/familyos/HermesChat.tsx` around its floating-button `fixed` positioning (previously found at line 519: `fixed bottom-20 right-20 md:bottom-6 md:right-20 z-40`). Since desktop now also has a bottom dock (this task adds one), change the `md:bottom-6` desktop offset to `md:bottom-20` so the Hermes button sits above the dock on desktop too, matching its existing mobile offset:

Find in `HermesChat.tsx`:

```tsx
        className="fixed bottom-20 right-20 md:bottom-6 md:right-20 z-40 w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 shadow-xl shadow-violet-500/30 flex items-center justify-center transition-all active:scale-95"
```

Change to:

```tsx
        className="fixed bottom-20 right-20 z-40 w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 shadow-xl shadow-violet-500/30 flex items-center justify-center transition-all active:scale-95"
```

(Dropping the `md:` breakpoint variants entirely since the offset is now the same at every width — the dock occupies the same vertical space on both mobile and desktop under this task's unified-dock design. The violet→honey color restyle of this button happens in Task 4, not here — this step only fixes positioning.)

- [ ] **Step 9: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "AppLayout"`
Expected: no output.

- [ ] **Step 10: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass (145, from Task 1's additions — this task doesn't add new tests, it's a rendering/structure change with no dedicated unit test since it's JSX layout, not testable pure logic; manual verification in Step 11 covers this instead).

- [ ] **Step 11: Build**

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds. Pre-existing warnings (chunk size, dynamic/static import mixing on `householdMemory.ts`) are unrelated and expected.

- [ ] **Step 12: Manual verification**

Requires the running app with real Supabase credentials (`npm run dev`, logged in). If credentials aren't available in this environment, note that explicitly instead of claiming this step passed. Confirm:
1. Log in as an admin: bottom dock shows Dashboard + 3 default core modules (Household, Family, Rewards) + a "More" icon — 5 icons total, present at both mobile and desktop widths.
2. Click "More": drawer opens above the dock showing Kids, Health, Finance, Quality Time, Promises, Emotions (6 items — admin's full leftover set given default core).
3. Click through every dock item and every More item — each renders its correct module (regression check, since click handlers were preserved, only the surrounding JSX/computation changed).
4. Selecting a dock item animates the background pill sliding to that icon's position (not an instant snap) — unless the OS is set to reduce motion, in which case it should snap instantly.
5. Log in as (or simulate) a child role: dock shows Dashboard + Household + Family + Rewards (their default core, all visible-to-child) + "More". Click More: shows exactly one item, Kids. Health/Finance/Quality Time/Promises/Emotions never appear anywhere for this role.
6. Resize between mobile and desktop widths: dock renders identically at both (same component, no separate desktop nav exists anymore).
7. Hermes's floating button doesn't overlap or hide behind the dock at any width.

- [ ] **Step 13: Commit**

```bash
git add src/components/AppLayout.tsx src/components/familyos/HermesChat.tsx
git commit -m "feat(nav): replace 7-item top nav + admin-only More with unified per-user core dock"
```

---

### Task 3: Add "My Navigation" picker to Settings

**Files:**
- Modify: `src/components/familyos/SettingsModal.tsx`

**Interfaces:**
- Consumes: `getVisibleModulesFor`, `TopModule` from `src/lib/navVisibility.ts` (Task 1); `loadMemberPreferences`, `preferencesKey`, `saveJSON` from `src/lib/familyos.ts` (already exist, already imported elsewhere in this file's sibling `MemberProfileModal.tsx` — same pattern).
- Produces: no new exports — adds a self-contained UI block inside the existing `general` tab.

**Context:** Read `src/components/familyos/SettingsModal.tsx` in full with the Read tool before editing — this task adds a new block inside the existing `{tab === 'general' && (...)}` section (found around line 278 in the pre-this-plan version) without disturbing the API-keys/AI-toggle/presence-zones blocks already there. This picker is **per-logged-in-user** (reads/writes `currentUser.id`'s own preferences), unlike the rest of the `general` tab which reads/writes a shared household `settings` object — confirm which variable holds the logged-in user (likely `currentUser` from `useAppContext()`, already used elsewhere in this file) before wiring state.

- [ ] **Step 1: Add imports**

Near the top of `SettingsModal.tsx`, alongside its existing imports, add:

```tsx
import { getVisibleModulesFor, type TopModule } from '@/lib/navVisibility';
import { loadMemberPreferences, preferencesKey, saveJSON } from '@/lib/familyos';
```

(If `loadMemberPreferences`/`preferencesKey`/`saveJSON` are already imported in this file from a prior task, e.g. if `MemberPreferences` editing already lives here — check first via `grep -n "loadMemberPreferences\|preferencesKey" src/components/familyos/SettingsModal.tsx` — and only add what's missing, don't duplicate an import.)

- [ ] **Step 2: Add local state for the picker, initialized from the current user's saved preferences**

Inside the `SettingsModal` component body, alongside its existing `useState` calls (near the `tab` state declaration), add:

```tsx
  const [coreNav, setCoreNav] = useState<TopModule[]>(() =>
    currentUser ? loadMemberPreferences(currentUser.id).coreNav : []
  );
```

(`currentUser` must already be destructured from `useAppContext()` in this file — verify via `grep -n "useAppContext\|currentUser" src/components/familyos/SettingsModal.tsx` before adding this line; if `useAppContext()` isn't called yet in this file, add `const { currentUser } = useAppContext();` alongside whatever other context values this file already pulls, following its existing import of `useAppContext` — check first whether it's already imported.)

- [ ] **Step 3: Write the toggle handler**

Add a handler function near the other handlers in this component:

```tsx
  const toggleCoreModule = (id: TopModule) => {
    if (!currentUser) return;
    setCoreNav((prev) => {
      let next: TopModule[];
      if (prev.includes(id)) {
        next = prev.filter((m) => m !== id);
      } else if (prev.length >= 3) {
        return prev; // already at the 3-module cap — no-op until the user deselects one
      } else {
        next = [...prev, id];
      }
      const prefs = loadMemberPreferences(currentUser.id);
      saveJSON(preferencesKey(currentUser.id), { ...prefs, coreNav: next, updatedAt: Date.now() });
      return next;
    });
  };
```

(Saves immediately on every toggle, matching this file's and `MemberProfileModal.tsx`'s existing auto-save pattern rather than requiring an explicit Save button.)

- [ ] **Step 4: Add the "My Navigation" UI block inside the `general` tab**

Find the `{tab === 'general' && (` block's opening `<div className="space-y-4">` (the general tab's content wrapper). Add this as a new child, positioned after the "AI toggle" block and before the "Two simple numbers" grid (a reasonable per-section-grouping location — exact adjacent placement doesn't need to be pinned further since this is an additive block, not a reordering of existing ones):

```tsx
              {/* My Navigation — per-user core module picker */}
              {currentUser && (
                <div className="rounded-xl border border-cream-400/10 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-bark-700">
                    <Grid2x2Icon className="w-4 h-4 text-honey-400" />
                    <span className="font-semibold text-white text-sm">My Navigation</span>
                    <span className="ml-auto text-xs text-cream-400/50">pick 3</span>
                  </div>
                  <div className="p-4 space-y-2">
                    <label className="flex items-center justify-between px-3 py-2 rounded-lg bg-bark-800 opacity-60 cursor-not-allowed">
                      <span className="text-sm text-white">Dashboard</span>
                      <span className="text-xs text-cream-400/50">always on</span>
                    </label>
                    {getVisibleModulesFor(currentRole!).filter((m) => m.id !== 'dashboard').map((m) => {
                      const selected = coreNav.includes(m.id);
                      const disabled = !selected && coreNav.length >= 3;
                      return (
                        <label
                          key={m.id}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg transition ${disabled ? 'bg-bark-800 opacity-40 cursor-not-allowed' : 'bg-bark-800 cursor-pointer hover:bg-bark-700'}`}
                        >
                          <span className="text-sm text-white">{m.label}</span>
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disabled}
                            onChange={() => toggleCoreModule(m.id)}
                            className="w-4 h-4 accent-honey-500"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
```

Add the `Grid2x2Icon` import (aliased to avoid any collision with an existing `Grid2x2` import elsewhere in this file — check first via `grep -n "Grid2x2" src/components/familyos/SettingsModal.tsx`):

```tsx
import { Grid2x2 as Grid2x2Icon } from 'lucide-react';
```

(`currentRole!` — non-null assertion — is safe here because this whole block is already gated by `{currentUser && (...)}`, and `currentRole` is set alongside `currentUser` by the same auth flow in `AppContext.tsx`; if `currentUser` is non-null, `currentRole` is guaranteed non-null too by that context's own invariant.)

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "SettingsModal"`
Expected: no output.

- [ ] **Step 6: Build**

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 7: Manual verification**

Requires the running app. Open Settings → General tab. Confirm:
1. "My Navigation" section appears with Dashboard shown as a disabled/checked "always on" row, plus the current user's other role-visible modules as checkboxes.
2. Exactly 3 (non-Dashboard) modules are checked by default (Household, Family, Rewards) on a fresh account.
3. Checking a 4th module is blocked (checkbox disabled) until one of the existing 3 is unchecked first.
4. Unchecking one and checking a different one updates immediately (no Save button needed) — closing and reopening Settings shows the new selection persisted.
5. Reopening the app's main nav (outside Settings) reflects the updated core-4 immediately.
6. As a child-role account, only role-visible modules appear as pickable options — Health/Finance/Quality Time/Promises/Emotions never appear in this list.

- [ ] **Step 8: Commit**

```bash
git add src/components/familyos/SettingsModal.tsx
git commit -m "feat(nav): add per-user core-module picker to Settings"
```

---

### Task 4: Restyle Hermes's floating button to the honey/bark palette

**Files:**
- Modify: `src/components/familyos/HermesChat.tsx`

**Interfaces:**
- Consumes: Tailwind `honey`/`bark`/`cream`/`berry` color scales (already registered in `tailwind.config.ts` from the prior retheme plan).
- Produces: nothing new — visual-only.

**Context:** This is the one remaining piece of the prior retheme's scope that was explicitly deferred (Hermes wasn't touched in that plan since it's not a `Dashboard`/`sections/*` file). Read the full current button + panel JSX (previously found around lines 519-560) before editing, since Task 2 Step 8 already changed this file's positioning classes — re-read to avoid clobbering that change.

- [ ] **Step 1: Restyle the floating trigger button**

Find (post-Task-2's positioning fix):

```tsx
        className="fixed bottom-20 right-20 z-40 w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 shadow-xl shadow-violet-500/30 flex items-center justify-center transition-all active:scale-95"
```

Change to:

```tsx
        className="fixed bottom-20 right-20 z-40 w-14 h-14 rounded-full bg-honey-500 hover:bg-honey-400 shadow-xl shadow-[0_0_24px_rgba(224,140,0,0.4)] flex items-center justify-center transition-all active:scale-95 focus-ring"
```

- [ ] **Step 2: Restyle the chat panel header and border**

Find:

```tsx
          className="fixed bottom-20 md:bottom-6 right-4 z-50 w-full max-w-sm sm:max-w-md flex flex-col bg-slate-900 border border-violet-500/30 rounded-2xl shadow-2xl shadow-violet-900/40 overflow-hidden"
```

to (also dropping the now-unnecessary `md:bottom-6` per Task 2 Step 8's unified-offset reasoning):

```tsx
          className="fixed bottom-20 right-4 z-50 w-full max-w-sm sm:max-w-md flex flex-col bg-bark-800 border border-honey-500/30 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
```

Find:

```tsx
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-950 to-slate-900 border-b border-violet-500/20 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 ring-2 ring-violet-400/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
```

to:

```tsx
          <div className="flex items-center gap-3 px-4 py-3 bg-bark-700 border-b border-honey-500/20 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-honey-500 flex items-center justify-center flex-shrink-0 ring-2 ring-honey-400/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
```

- [ ] **Step 3: Sweep remaining violet/slate references in this file**

Run: `grep -n "violet-\|slate-" src/components/familyos/HermesChat.tsx`

Read each matched line. Apply: `violet-*` → `honey-*` (nearest available shade per the same rounding rules used in the prior retheme plan — honey has 50/100/200/400/500/600/700), `slate-*` → `bark-*`/`cream-*` following the same substitution mapping as the prior retheme plan's Task 5-7 (bg-slate-800/900 → bg-bark-700/800, text-slate-400/500 → text-cream-400/60 or /50, text-slate-300 → text-cream-200). Leave any `rose-*`/`red-*` untouched (error/destructive states, same rule as before).

- [ ] **Step 4: Check for a dynamic-class bug (same pattern as the prior retheme plan flagged elsewhere)**

Run: `grep -n '\${.*}-[0-9]\{2,3\}' src/components/familyos/HermesChat.tsx`

If any matches appear, do not fix them in this task — record file:line and flag as a follow-up, consistent with how the prior retheme plan handled the same situation in other files.

- [ ] **Step 5: Run typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "HermesChat"`
Expected: no output.

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 6: Manual verification**

Requires the running app. Confirm the floating assistant button reads honey/orange (not violet/purple), the chat panel background is bark/dark-brown (not slate-blue-gray) with a honey-tinted border and header, and opening/closing/sending a message still works identically (regression check — this task only changes className strings).

- [ ] **Step 7: Commit**

```bash
git add src/components/familyos/HermesChat.tsx
git commit -m "style(hermes): retheme floating assistant from violet to honey/bark palette"
```

---

## Self-Review Notes

- **Spec coverage:** all sections of the design doc are covered — data model (Task 1), nav computation + unified dock + animation (Task 2), Settings picker (Task 3), Hermes restyle (Task 4). Explicitly out of scope per the design doc (HouseholdBrain, Dashboard internals, sections internals) — no task touches these.
- **The critical correction from the advisor review is baked in throughout:** `navVisibility.ts`'s `getVisibleModulesFor` is the single predicate consumed identically by Task 2 (dock/More computation) and Task 3 (Settings picker options) — no duplicate/drifting filter logic. The More-menu trigger's visibility condition changed from `isAdm` (Task 2 Step 5's diff removes this gate) to `moreModules.length > 0`, which is true for every role given current module counts, including a child's single-item (`kids`) leftover set. Task 1's own unit tests pin the exact child-role math (5 visible modules, 1 leftover under the default core) so this doesn't silently regress later.
- **Type consistency:** `TopModule` is defined once (`navVisibility.ts`) and imported everywhere else (`familyos.ts`, `AppLayout.tsx`, `SettingsModal.tsx`) — no parallel redefinition. `NavModule`/`dockModules`/`moreModules`/`coreNav` names are used consistently between Task 2's computation and Task 2's JSX consumption.
- **Placeholder scan:** no TBD/TODO/vague-instruction language found on review.
- **Known follow-up flagged, not silently dropped:** any dynamic-class bug found in `HermesChat.tsx` during Task 4 Step 4 is recorded, not fixed inline — consistent with how the prior retheme plan handled the same category of issue elsewhere in the codebase.
