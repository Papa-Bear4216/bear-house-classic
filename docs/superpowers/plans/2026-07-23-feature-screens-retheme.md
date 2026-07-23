# Feature Screens Retheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the honey/bark/cream/sage retheme (already applied to the app shell in `docs/superpowers/plans/2026-07-23-app-shell-redesign.md`) into the feature screens — `Dashboard.tsx` and all 11 `sections/*.tsx` files — fix a real Tailwind dynamic-class bug, add a shared focus-ring utility, and add progress-bar visualization to the dashboard. HouseholdBrain's task-chunking/timer/focus-mode mechanics are explicitly OUT of scope (see Global Constraints) — that is a functional gap requiring its own spec, not a styling task.

**Architecture:** Three layers, built bottom-up so later tasks can consume earlier ones:
1. **Tailwind named-color layer** (`tailwind.config.ts`): register `honey`/`bark`/`cream`/`sage`/`berry` as real Tailwind color scales (backed by the existing HSL/hex values already defined in `src/styles/landing.css`), so `bg-honey-500`, `text-sage-500`, etc. become valid static utility classes the JIT compiler can see. This is what makes a mechanical slate→bark / indigo→honey / emerald→sage swap possible across ~800 call sites without inventing a separate CSS-variable indirection layer.
2. **Fix-first, then sweep**: fix the one real bug (dynamic template-string Tailwind classes in `Dashboard.tsx`'s `personCard()`) before the broad reskin, since a global search-and-replace pass would otherwise blindly propagate the same bug pattern.
3. **Screen-by-screen sweep**: `Dashboard.tsx` first (smaller, has the bug fix + new progress bars + focus-ring utility as a proving ground), then the 11 `sections/*.tsx` files in batches, each an independently-committable, independently-revertable task.

**Tech Stack:** Tailwind CSS (`tailwind.config.ts` theme extension), existing React/TSX components, no new dependencies.

## Global Constraints

- **HouseholdBrain.tsx is explicitly excluded from this plan.** It does not implement step-chunking, color-coded countdown timers, or single-task focus mode (confirmed by direct code inspection — no matches for step arrays, timer/countdown logic, or a focus-mode view). Reskinning its cards now would need to be redone once/if that mechanic is built. This plan does not touch `HouseholdBrain.tsx` at all. A separate brainstorm+spec is recommended before any styling work there.
- **The "Late" stat reframe and personCard flattening (3 stats → 1 stat + trend) are UX judgment calls, not bugs.** Implement them as proposed in this plan, but they are the parts of this plan most likely to get redirected by the user — flag them as such when presenting results, don't bury them as if they were mechanical fixes.
- **Nav consolidation (folding Quality Time/Promises/Emotions into a "Family" sub-tab) is out of scope for this plan.** It's a navigation/IA change to `AppLayout.tsx`, which the prior shell-redesign plan already restyled and explicitly scoped to visual-only, zero-behavior-change edits. Restructuring nav hierarchy is a separate, higher-risk change; do not fold it into a styling plan.
- **`colors_and_type.css` does not exist anywhere in this repo.** The real token source is `src/styles/landing.css` (scoped under `.bh-landing`). Use the values below, copied verbatim from that file — do not invent additional tokens (there is no `coral` token; the handoff doc's mention of "coral" does not correspond to anything in the actual token set, so `berry` is the closest existing accent for alert/highlight uses that aren't `destructive`/rose).
- **Token values (from `src/styles/landing.css:6-36`), hex, exact:**
  - honey: 50 `#FFFBF0`, 100 `#FFF0C2`, 200 `#FFD96B`, 400 `#F5A800`, 500 `#E08C00`, 600 `#B86E00`, 700 `#8F5200`
  - bark: 700 `#1E0E04`, 800 `#120800`
  - cream: 50 `#FFFFFF`, 100 `#FFFDF9`, 200 `#FFF8EE`, 400 `#F8DABC`
  - sage: 50 `#EDFAF3`, 100 `#C0EDD6`, 200 `#80D4AA`, 500 `#1A8A4E`, 600 `#0E6E3A`
  - berry: 400 `#E040C0`, 500 `#C020A0`, 600 `#980080`
  - stone: 300 `#C8BAB0`, 500 `#887060`
- **Do not touch `bg-rose-*`/`text-rose-*` used for destructive/overdue/alert states.** Per the prior shell plan's own precedent (kept `bg-rose-500` for the overdue badge), rose is "alert red," not brand chrome, and is intentionally left alone across this plan too — do not remap it to berry or anything else.
- **Do not modify `src/index.css` `.dark`/`:root` CSS variables** — those were already retinted by the prior shell plan (`9270e63`). This plan only adds new Tailwind color scale entries in `tailwind.config.ts`, it does not touch the shadcn CSS-variable-backed colors (`background`, `card`, `primary`, etc.).
- **Every existing behavior (click handlers, state, conditional rendering, `onNav`/`onQuickAdd` callbacks, admin/child role filtering) must continue to work identically.** These are visual-only changes except where a task explicitly says otherwise (the `personCard` dynamic-class fix, the progress bar additions, and the "Late" copy reframe are the only non-purely-cosmetic changes in this plan).

---

## File Structure

- **Modify:** `tailwind.config.ts` — add `honey`/`bark`/`cream`/`sage`/`berry`/`stone` color scales to `theme.extend.colors`.
- **Create:** `src/lib/colorStyles.ts` — static lookup maps (`COLOR_CARD_STYLES`, `COLOR_TEXT_STYLES`) replacing `Dashboard.tsx`'s dynamic template-string classes, keyed by the existing per-member `color` field.
- **Create:** `src/index.css` addition — a `.focus-ring` utility class (honey outline + glow), applied across raw buttons/cards in `familyos/*`.
- **Modify:** `src/components/familyos/Dashboard.tsx` — fix dynamic classes, retheme all slate/indigo/emerald/orange/blue/rose (non-alert) classes to bark/honey/sage/berry equivalents, add progress bars, reframe "Late" copy, apply focus-ring.
- **Modify:** all 11 files in `src/components/familyos/sections/` — retheme slate/indigo/amber/emerald/orange/blue/purple classes to bark/honey/sage/berry equivalents; apply focus-ring to interactive elements.

---

### Task 1: Register Bear House color scales in Tailwind config

**Files:**
- Modify: `tailwind.config.ts`

**Interfaces:**
- Produces: Tailwind utility classes `bg-honey-{50,100,200,400,500,600,700}`, `text-honey-*`, `border-honey-*` (same pattern for `bark` [700,800], `cream` [50,100,200,400], `sage` [50,100,200,500,600], `berry` [400,500,600], `stone` [300,500]) — consumed by every subsequent task in this plan.
- Consumes: nothing new (extends the existing `theme.extend.colors` object at `tailwind.config.ts:23-67`).

- [ ] **Step 1: Add the color scales**

Open `tailwind.config.ts`. Inside `theme.extend.colors` (the object starting at line 23), add the following keys as siblings to the existing `border`, `input`, `ring`, etc. entries (insert after the `sidebar` entry, before the closing `}` at line 67):

```ts
        honey: {
          50: '#FFFBF0',
          100: '#FFF0C2',
          200: '#FFD96B',
          400: '#F5A800',
          500: '#E08C00',
          600: '#B86E00',
          700: '#8F5200',
        },
        bark: {
          700: '#1E0E04',
          800: '#120800',
        },
        cream: {
          50: '#FFFFFF',
          100: '#FFFDF9',
          200: '#FFF8EE',
          400: '#F8DABC',
        },
        sage: {
          50: '#EDFAF3',
          100: '#C0EDD6',
          200: '#80D4AA',
          500: '#1A8A4E',
          600: '#0E6E3A',
        },
        berry: {
          400: '#E040C0',
          500: '#C020A0',
          600: '#980080',
        },
        stone: {
          300: '#C8BAB0',
          500: '#887060',
        },
```

- [ ] **Step 2: Verify the config parses and Tailwind picks up the new classes**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "tailwind.config"`
Expected: no output (config is valid TypeScript).

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds (exit code 0).

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(theme): register honey/bark/cream/sage/berry Tailwind color scales"
```

---

### Task 2: Fix dynamic Tailwind classes in Dashboard's personCard, add shared color lookup map

**Files:**
- Create: `src/lib/colorStyles.ts`
- Modify: `src/components/familyos/Dashboard.tsx:51-87`

**Interfaces:**
- Consumes: Tailwind color scales from Task 1 (`bg-honey-*`, `border-sage-*`, etc. must already resolve).
- Produces: `COLOR_CARD_STYLES: Record<string, { card: string; text: string }>` exported from `src/lib/colorStyles.ts`, consumed by `Dashboard.tsx` Task 2 and reusable by any `sections/*.tsx` file in later tasks that has the same per-member dynamic-color pattern.

**Context:** `personCard()` currently builds Tailwind classes via template strings using a per-member `color` field (e.g. `` `bg-gradient-to-br from-${color}-900/30 to-slate-800 border border-${color}-500/30` `` at `Dashboard.tsx:59`, and `` `text-${color}-300` `` at `:69`). Because `color` is a runtime string, Tailwind's JIT compiler cannot statically discover these class names, so most of them are silently dropped from the production CSS bundle. Find the actual set of `color` values used by household members before writing the lookup map — check `src/lib/familyos.ts` or wherever `householdMembers` is seeded/typed for the allowed `color` string values.

- [ ] **Step 1: Find the allowed member color values**

Run: `grep -rn "color" src/lib/familyos.ts | grep -i "member\|amber\|blue\|purple\|emerald\|rose\|orange\|pink\|cyan" `

Read the matched lines. Also check `src/contexts/AppContext.tsx` or wherever `householdMembers` members are created (e.g. an onboarding/settings form) for a color picker with a fixed list of options — this is the authoritative source of every possible `color` string value that must have an entry in the lookup map. If a color value exists in data but has no lookup entry, the fallback (Step 2) must not silently render broken/transparent styling.

- [ ] **Step 2: Write the static lookup map**

Create `src/lib/colorStyles.ts`:

```ts
interface ColorStyle {
  card: string;
  text: string;
}

const DEFAULT_STYLE: ColorStyle = {
  card: 'bg-gradient-to-br from-honey-700/30 to-bark-800 border border-honey-500/30',
  text: 'text-honey-200',
};

export const COLOR_CARD_STYLES: Record<string, ColorStyle> = {
  amber: {
    card: 'bg-gradient-to-br from-honey-700/30 to-bark-800 border border-honey-500/30',
    text: 'text-honey-200',
  },
  blue: {
    card: 'bg-gradient-to-br from-sky-900/30 to-bark-800 border border-sky-500/30',
    text: 'text-sky-300',
  },
  purple: {
    card: 'bg-gradient-to-br from-berry-700/30 to-bark-800 border border-berry-500/30',
    text: 'text-berry-300',
  },
  emerald: {
    card: 'bg-gradient-to-br from-sage-600/30 to-bark-800 border border-sage-500/30',
    text: 'text-sage-200',
  },
  rose: {
    card: 'bg-gradient-to-br from-rose-900/30 to-bark-800 border border-rose-500/30',
    text: 'text-rose-300',
  },
  orange: {
    card: 'bg-gradient-to-br from-honey-700/30 to-bark-800 border border-honey-500/30',
    text: 'text-honey-200',
  },
  pink: {
    card: 'bg-gradient-to-br from-berry-700/30 to-bark-800 border border-berry-500/30',
    text: 'text-berry-300',
  },
  cyan: {
    card: 'bg-gradient-to-br from-sky-900/30 to-bark-800 border border-sky-500/30',
    text: 'text-sky-300',
  },
};

export function getColorCardStyle(color: string): ColorStyle {
  return COLOR_CARD_STYLES[color] || DEFAULT_STYLE;
}
```

Note: `sky` is used above via the existing default Tailwind `sky` scale (not a Bear House token) for the "blue" member color, since Bear House's own `--sky-500: #0070C0` token (`landing.css:33`) is close to Tailwind's default `sky-600` — using Tailwind's built-in `sky` scale avoids adding a 7th custom color family for one accent. If Step 1 reveals color values not listed above (e.g. `teal`, `indigo`), add matching entries following the same pattern before proceeding — every value found in Step 1 must have an explicit entry, not just fall through to `DEFAULT_STYLE`, so no member's card silently renders as the wrong color.

- [ ] **Step 3: Replace the dynamic classes in `personCard()`**

In `src/components/familyos/Dashboard.tsx`, add the import near the top (after the existing `@/contexts/AppContext` import):

```tsx
import { getColorCardStyle } from '@/lib/colorStyles';
```

Change lines 58-70 from:

```tsx
    return (
      <div key={name} className={`bg-gradient-to-br from-${color}-900/30 to-slate-800 border border-${color}-500/30 rounded-2xl p-4 relative group`}>
        <button
          onClick={() => setProfileMemberId(id)}
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-white"
          title="Edit profile"
        >
          <UserCog className="w-4 h-4" />
        </button>
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-bold">{name}</div>
          <div className={`text-xs text-${color}-300`}>Quality: {relativeDate(pillar?.lastQualityTime)}</div>
        </div>
```

to:

```tsx
    const style = getColorCardStyle(color);
    return (
      <div key={name} className={`${style.card} rounded-2xl p-4 relative group`}>
        <button
          onClick={() => setProfileMemberId(id)}
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-cream-400/60 hover:text-white focus-ring"
          title="Edit profile"
        >
          <UserCog className="w-4 h-4" />
        </button>
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-bold">{name}</div>
          <div className={`text-xs ${style.text}`}>Quality: {relativeDate(pillar?.lastQualityTime)}</div>
        </div>
```

(The `focus-ring` class on the edit-profile button is defined in Task 4 — this task's build will still pass without it since it's just an unstyled class name until then, but do not skip adding it here, since Task 4 sweeps for exactly this kind of interactive element and having it pre-tagged avoids a second pass over this file.)

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "Dashboard\|colorStyles"`
Expected: no output.

- [ ] **Step 5: Manual verification**

Requires the running app (`npm run dev`, logged in, on the Dashboard tab with at least one household member configured). Confirm:
1. Per-person cards render with a colored gradient background matching each member's assigned color (not transparent/unstyled).
2. The "Quality: ..." text renders in a matching accent color, not default white/gray.
3. Hovering a card reveals the edit-profile (pencil/gear) icon in the top-right corner, and clicking it still opens `MemberProfileModal`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/colorStyles.ts src/components/familyos/Dashboard.tsx
git commit -m "fix(dashboard): replace dynamic Tailwind template classes with static color lookup map"
```

---

### Task 3: Add shared focus-ring utility class

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Produces: `.focus-ring` CSS utility class — consumed by Task 2 (already applied above), Task 5 (Dashboard sweep), and Task 6 (sections sweep).
- Consumes: nothing (pure CSS addition, no dependency on Tailwind config changes).

- [ ] **Step 1: Add the utility class**

Open `src/index.css`. Find the `@layer base` or equivalent block containing base styles (if none exists, add a new `@layer utilities` block at the end of the file). Add:

```css
@layer utilities {
  .focus-ring {
    @apply outline-none;
  }
  .focus-ring:focus-visible {
    outline: 2px solid #E08C00;
    box-shadow: 0 0 0 3px rgba(224, 155, 45, 0.2);
  }
}
```

(Using the literal honey hex `#E08C00` and the exact `rgba(224,155,45,0.2)` value specified by the design system, rather than a Tailwind arbitrary-value class inline on every element — this keeps the focus treatment defined in exactly one place, so if the honey shade changes later only this rule needs updating.)

- [ ] **Step 2: Verify the build compiles**

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(a11y): add shared honey focus-ring utility class"
```

---

### Task 4: Retheme Dashboard.tsx — KPI grid, quick actions, tabs, AI summary modal; add progress bars; reframe "Late"

**Files:**
- Modify: `src/components/familyos/Dashboard.tsx`

**Interfaces:**
- Consumes: `.focus-ring` from Task 3, Tailwind color scales from Task 1, `getColorCardStyle` from Task 2 (already wired).
- Produces: no new exports — visual/copy changes to existing JSX only, except for the progress-bar markup (new, additive).

**Context:** Read the full current file with the Read tool immediately before editing (Task 2 already changed lines 51-87; line numbers below for the rest of the file assume Task 2 is already applied and did not shift line counts elsewhere in the file). This task covers everything in `Dashboard.tsx` NOT already handled by Task 2: the header/AI-summary button (`:217-232`), the AI-summary modal body styling (`:185-212`), the tabs (`:239-256`), the KPI grid (`:263-286`), the quick actions row (`:289-294`), and the "Family" section heading (`:299`).

- [ ] **Step 1: Retheme the header and AI Summary button**

Change (current lines 224-231):

```tsx
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Family Dashboard</h2>
          <p className="text-sm text-slate-400">One view of everything that matters.</p>
        </div>
        <button onClick={dailySummary} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> AI Summary
        </button>
      </div>
```

to:

```tsx
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Family Dashboard</h2>
          <p className="text-sm text-cream-400/60">One view of everything that matters.</p>
        </div>
        <button onClick={dailySummary} className="bg-honey-500 hover:bg-honey-600 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2 focus-ring">
          <Sparkles className="w-4 h-4" /> AI Summary
        </button>
      </div>
```

- [ ] **Step 2: Retheme the tabs**

Change (current lines 239-256):

```tsx
      <div className="inline-flex bg-slate-800 border border-slate-700 rounded-lg p-1 gap-1">
        <button
          onClick={() => setTab('overview')}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition ${
            tab === 'overview' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Overview
        </button>
        <button
          onClick={() => setTab('trends')}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition ${
            tab === 'trends' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Trends
        </button>
      </div>
```

to:

```tsx
      <div className="inline-flex bg-bark-800 border border-cream-400/10 rounded-lg p-1 gap-1">
        <button
          onClick={() => setTab('overview')}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition focus-ring ${
            tab === 'overview' ? 'bg-honey-500 text-white shadow' : 'text-cream-400/70 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Overview
        </button>
        <button
          onClick={() => setTab('trends')}
          className={`px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition focus-ring ${
            tab === 'trends' ? 'bg-honey-500 text-white shadow' : 'text-cream-400/70 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Trends
        </button>
      </div>
```

- [ ] **Step 3: Retheme the KPI grid and add a household-level progress bar**

Change (current lines 262-286):

```tsx
          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => onNav('household')} className="bg-gradient-to-br from-orange-900/40 to-slate-800 border border-orange-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition">
              <ListChecks className="w-5 h-5 text-orange-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.todayTasks}</div>
              <div className="text-xs text-orange-200">Today's tasks</div>
            </button>
            <button onClick={() => onNav('quality')} className="bg-gradient-to-br from-indigo-900/40 to-slate-800 border border-indigo-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition">
              <Calendar className="w-5 h-5 text-indigo-400 mb-2" />
              <div className="text-sm font-bold text-white truncate">{stats.upcoming ? stats.upcoming.name : 'Nothing'}</div>
              <div className="text-xs text-indigo-200">{stats.upcoming ? new Date(stats.upcoming.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' }) : 'Plan something'}</div>
            </button>
            <button onClick={() => onNav('promises')} className="bg-gradient-to-br from-blue-900/40 to-slate-800 border border-blue-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition">
              <Handshake className="w-5 h-5 text-blue-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.openPromises}</div>
              <div className="text-xs text-blue-200 flex items-center gap-1">
                {stats.overduePromises > 0 && <><AlertTriangle className="w-3 h-3 text-rose-400" /> {stats.overduePromises} overdue ·</>} open
              </div>
            </button>
            <div className="bg-gradient-to-br from-emerald-900/40 to-slate-800 border border-emerald-500/30 rounded-2xl p-4">
              <TrendingUp className="w-5 h-5 text-emerald-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.presencePct}%</div>
              <div className="text-xs text-emerald-200">Presence this week</div>
            </div>
          </div>
```

to (adding a household daily-progress bar above the grid, using `stats.todayTasks` completion ratio — see Step 3a below for the supporting `stats` calculation change):

```tsx
          {/* Household daily progress */}
          <div className="bg-bark-800 border border-cream-400/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-cream-100">Today's progress</span>
              <span className="text-sm text-cream-400/70">{stats.todayCompletedCount}/{stats.todayTotalCount} done</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-bark-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-sage-500 transition-all"
                style={{ width: `${stats.todayTotalCount > 0 ? Math.round((stats.todayCompletedCount / stats.todayTotalCount) * 100) : 0}%` }}
              />
            </div>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => onNav('household')} className="bg-gradient-to-br from-honey-700/40 to-bark-800 border border-honey-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition focus-ring">
              <ListChecks className="w-5 h-5 text-honey-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.todayTasks}</div>
              <div className="text-xs text-honey-200">Today's tasks</div>
            </button>
            <button onClick={() => onNav('quality')} className="bg-gradient-to-br from-berry-700/40 to-bark-800 border border-berry-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition focus-ring">
              <Calendar className="w-5 h-5 text-berry-400 mb-2" />
              <div className="text-sm font-bold text-white truncate">{stats.upcoming ? stats.upcoming.name : 'Nothing'}</div>
              <div className="text-xs text-berry-200">{stats.upcoming ? new Date(stats.upcoming.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' }) : 'Plan something'}</div>
            </button>
            <button onClick={() => onNav('promises')} className="bg-gradient-to-br from-sky-900/40 to-bark-800 border border-sky-500/30 rounded-2xl p-4 text-left hover:scale-[1.02] transition focus-ring">
              <Handshake className="w-5 h-5 text-sky-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.openPromises}</div>
              <div className="text-xs text-sky-200 flex items-center gap-1">
                {stats.overduePromises > 0 && <><AlertTriangle className="w-3 h-3 text-rose-400" /> {stats.overduePromises} overdue ·</>} open
              </div>
            </button>
            <div className="bg-gradient-to-br from-sage-600/40 to-bark-800 border border-sage-500/30 rounded-2xl p-4">
              <TrendingUp className="w-5 h-5 text-sage-400 mb-2" />
              <div className="text-2xl font-bold text-white">{stats.presencePct}%</div>
              <div className="text-xs text-sage-200">Presence this week</div>
            </div>
          </div>
```

- [ ] **Step 3a: Add `todayCompletedCount`/`todayTotalCount` to the `stats` memo**

The progress bar in Step 3 needs a completed/total count for today's tasks, which the existing `stats` memo doesn't compute (it only computes `todayTasks` as a count of *incomplete* high-priority/due-today tasks). Change the `stats` memo (current lines 32-48) from:

```tsx
  const stats = useMemo(() => {
    const todayTasks = tasks.filter((t) => {
      if (t.completed) return false;
      if (t.priority === 'High') return true;
      if (t.dueDate) return daysUntilDue(t.dueDate) <= 0; // due today or overdue
      return t.dueEstimate === 'Today';
    }).length;
```

to:

```tsx
  const stats = useMemo(() => {
    const isDueToday = (t: any) => {
      if (t.priority === 'High') return true;
      if (t.dueDate) return daysUntilDue(t.dueDate) <= 0; // due today or overdue
      return t.dueEstimate === 'Today';
    };
    const todayTaskList = tasks.filter(isDueToday);
    const todayTasks = todayTaskList.filter((t) => !t.completed).length;
    const todayCompletedCount = todayTaskList.filter((t) => t.completed).length;
    const todayTotalCount = todayTaskList.length;
```

And update the memo's return statement (current line 47) from:

```tsx
    return { todayTasks, openPromises: openPromises.length, overduePromises, upcoming, presencePct };
```

to:

```tsx
    return { todayTasks, todayCompletedCount, todayTotalCount, openPromises: openPromises.length, overduePromises, upcoming, presencePct };
```

- [ ] **Step 4: Retheme the quick actions row**

Change (current lines 289-294):

```tsx
          {/* Quick actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button onClick={() => onQuickAdd('household')} className="bg-orange-600/20 border border-orange-500/30 hover:bg-orange-600/30 text-orange-200 rounded-lg py-2.5 text-sm font-medium">+ Task</button>
            <button onClick={() => onQuickAdd('promises')} className="bg-blue-600/20 border border-blue-500/30 hover:bg-blue-600/30 text-blue-200 rounded-lg py-2.5 text-sm font-medium">+ Promise</button>
            <button onClick={() => onQuickAdd('quality')} className="bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 text-indigo-200 rounded-lg py-2.5 text-sm font-medium">+ Activity</button>
            <button onClick={() => onQuickAdd('emotions')} className="bg-rose-600/20 border border-rose-500/30 hover:bg-rose-600/30 text-rose-200 rounded-lg py-2.5 text-sm font-medium">Log Emotion</button>
          </div>
```

to:

```tsx
          {/* Quick actions */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <button onClick={() => onQuickAdd('household')} className="bg-honey-600/20 border border-honey-500/30 hover:bg-honey-600/30 text-honey-200 rounded-lg py-2.5 text-sm font-medium focus-ring">+ Task</button>
            <button onClick={() => onQuickAdd('promises')} className="bg-sky-600/20 border border-sky-500/30 hover:bg-sky-600/30 text-sky-200 rounded-lg py-2.5 text-sm font-medium focus-ring">+ Promise</button>
            <button onClick={() => onQuickAdd('quality')} className="bg-berry-600/20 border border-berry-500/30 hover:bg-berry-600/30 text-berry-200 rounded-lg py-2.5 text-sm font-medium focus-ring">+ Activity</button>
            <button onClick={() => onQuickAdd('emotions')} className="bg-rose-600/20 border border-rose-500/30 hover:bg-rose-600/30 text-rose-200 rounded-lg py-2.5 text-sm font-medium focus-ring">Log Emotion</button>
          </div>
```

(Log Emotion keeps `rose` — per Global Constraints, rose stays untouched; it also happens to fit here since emotion-logging isn't a brand-chrome element requiring a token swap.)

- [ ] **Step 5: Retheme the AI Summary modal body**

Change (current lines 185-211, inside `dailySummary()`'s `formattedBody`):

```tsx
    const formattedBody = (
      <div className="space-y-4">
        <div className="bg-indigo-950/30 p-3 rounded-lg border border-indigo-500/30">
          <h4 className="text-indigo-300 text-xs font-bold uppercase mb-1">Focus For Today</h4>
          <p className="text-white text-sm">{parsedBody.recommendation}</p>
        </div>
        
        {parsedBody.news.length > 0 && (
          <div>
            <h4 className="text-slate-400 text-xs font-bold uppercase mb-2">Family News</h4>
            <ul className="list-disc list-inside text-slate-300 text-sm space-y-1">
              {parsedBody.news.map((n: string, i: number) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        {parsedBody.alerts.length > 0 && (
          <div className="bg-rose-950/20 p-3 rounded-lg border border-rose-500/20">
            <h4 className="text-rose-400 text-xs font-bold uppercase mb-1">Safety Net Alerts</h4>
            <ul className="list-disc list-inside text-rose-200 text-sm space-y-1">
              {parsedBody.alerts.map((a: string, i: number) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        <p className="text-slate-500 italic text-xs pt-2 border-t border-slate-700">{parsedBody.outlook}</p>
      </div>
    );
```

to:

```tsx
    const formattedBody = (
      <div className="space-y-4">
        <div className="bg-honey-700/20 p-3 rounded-lg border border-honey-500/30">
          <h4 className="text-honey-300 text-xs font-bold uppercase mb-1">Focus For Today</h4>
          <p className="text-white text-sm">{parsedBody.recommendation}</p>
        </div>
        
        {parsedBody.news.length > 0 && (
          <div>
            <h4 className="text-cream-400/60 text-xs font-bold uppercase mb-2">Family News</h4>
            <ul className="list-disc list-inside text-cream-200 text-sm space-y-1">
              {parsedBody.news.map((n: string, i: number) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        {parsedBody.alerts.length > 0 && (
          <div className="bg-rose-950/20 p-3 rounded-lg border border-rose-500/20">
            <h4 className="text-rose-400 text-xs font-bold uppercase mb-1">Safety Net Alerts</h4>
            <ul className="list-disc list-inside text-rose-200 text-sm space-y-1">
              {parsedBody.alerts.map((a: string, i: number) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        <p className="text-cream-400/50 italic text-xs pt-2 border-t border-cream-400/10">{parsedBody.outlook}</p>
      </div>
    );
```

Also change the `AlertModal` accent prop (current line 219) from:

```tsx
      <AlertModal {...modal} accent="indigo" onClose={() => setModal({ ...modal, open: false })} />
```

to:

```tsx
      <AlertModal {...modal} accent="honey" onClose={() => setModal({ ...modal, open: false })} />
```

(This assumes `AlertModal` accepts an `accent` string prop used the same way `AppLayout`'s nav items did pre-restyle — verify by reading `src/components/familyos/AlertModal.tsx` before this step; if `AlertModal` internally maps `accent` to hardcoded Tailwind classes like `indigo`/`purple` via a dynamic template string, apply the same static-lookup-map fix pattern as Task 2 to that file instead of just passing a new string that won't resolve to anything.)

- [ ] **Step 6: Reframe the "Late" stat in `personCard()` (from Task 2's already-updated version)**

Change (from Task 2's Step 3 result, the stat grid inside `personCard()`):

```tsx
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-900/60 rounded-lg p-2">
            <div className="text-xs text-slate-400">Promises</div>
            <div className="text-lg font-bold text-white">{open}</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-2">
            <div className="text-xs text-slate-400">Mood</div>
            <div className="text-lg font-bold text-white">{avg}</div>
          </div>
          <div className="bg-slate-900/60 rounded-lg p-2">
            <div className="text-xs text-slate-400">Late</div>
            <div className={`text-lg font-bold ${overdueT > 0 ? 'text-rose-400' : 'text-white'}`}>{overdueT}</div>
          </div>
        </div>
```

to (flattening to Promises + Mood as equal-weight stats, and only surfacing the overdue count as a small gentle badge when it's actually nonzero, instead of an always-rendered third stat box):

```tsx
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-bark-700/60 rounded-lg p-2">
            <div className="text-xs text-cream-400/60">Promises</div>
            <div className="text-lg font-bold text-white">{open}</div>
          </div>
          <div className="bg-bark-700/60 rounded-lg p-2">
            <div className="text-xs text-cream-400/60">Mood</div>
            <div className="text-lg font-bold text-white">{avg}</div>
          </div>
        </div>
        {overdueT > 0 && (
          <div className="mt-2 text-xs text-honey-300 bg-honey-700/20 rounded-lg px-2 py-1 text-center">
            {overdueT} {overdueT === 1 ? 'task needs' : 'tasks need'} a little attention
          </div>
        )}
```

(This is the UX-judgment part of this plan flagged in Global Constraints — the doc asked to "flatten to one primary stat + trend indicator," but a full trend-indicator redesign would need a data source for historical comparison that doesn't currently exist in `stats`/`personCard`'s scope. This step instead flattens 3→2 equal stats and demotes "Late" to a conditional, gently-worded, non-alarm-colored callout, which satisfies both the "de-emphasize Late unless >0" and "positive framing" requirements from the doc without inventing a trend metric that isn't backed by real data.)

- [ ] **Step 7: Add per-person mini progress bar**

Immediately after the stat grid / overdue callout added in Step 6 (still inside `personCard()`'s returned JSX, before the closing `</div>` of the card), add:

```tsx
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wide text-cream-400/50">Today</span>
            <span className="text-[10px] text-cream-400/50">{personTaskStats.completed}/{personTaskStats.total}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-bark-700/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-sage-500 transition-all"
              style={{ width: `${personTaskStats.total > 0 ? Math.round((personTaskStats.completed / personTaskStats.total) * 100) : 0}%` }}
            />
          </div>
        </div>
```

This references a new `personTaskStats` value that must be computed inside `personCard()` — add this line immediately after the existing `const overdueT = ...` line (from Task 2's version):

```tsx
    const personTaskList = tasks.filter((t) => t.person === name);
    const personTaskStats = {
      completed: personTaskList.filter((t) => t.completed).length,
      total: personTaskList.length,
    };
```

- [ ] **Step 8: Run typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "Dashboard"`
Expected: no output.

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 9: Manual verification**

Requires the running app (`npm run dev`, logged in). Confirm:
1. Dashboard background/cards read as bark/honey/sage, no leftover slate-blue or indigo.
2. A household-level progress bar appears above the KPI grid, showing a fraction and a filled bar matching today's task completion.
3. Each per-person card shows Promises + Mood (no third "Late" box); if that person has any overdue tasks, a small honey-colored callout appears below the two stats; a mini "Today" progress bar renders under the stats.
4. Tab switching (Overview/Trends), AI Summary modal, and all quick-action/KPI-grid navigation buttons still work identically to before.
5. Tab through the page with keyboard only (Tab key) — every button (AI Summary, tabs, KPI cards, quick actions, edit-profile icon) shows a visible honey outline+glow when focused.

- [ ] **Step 10: Commit**

```bash
git add src/components/familyos/Dashboard.tsx
git commit -m "style(dashboard): retheme to honey/bark/sage, add progress bars, reframe Late stat"
```

---

### Task 5: Retheme sections batch 1 — Shopping, MealPlanner, Pantry, BillTracker, HouseholdMemory

**Files:**
- Modify: `src/components/familyos/sections/Shopping.tsx`
- Modify: `src/components/familyos/sections/MealPlanner.tsx`
- Modify: `src/components/familyos/sections/Pantry.tsx`
- Modify: `src/components/familyos/sections/BillTracker.tsx`
- Modify: `src/components/familyos/sections/HouseholdMemory.tsx`

**Interfaces:**
- Consumes: Tailwind color scales (Task 1), `.focus-ring` utility (Task 3).
- Produces: nothing new — visual-only.

**Context:** Apply the same class-substitution pattern used in Task 4 across each file: `bg-slate-800`/`bg-slate-900` → `bg-bark-800`/`bg-bark-700`, `border-slate-700` → `border-cream-400/10`, `text-slate-400`/`text-slate-500` → `text-cream-400/60`/`text-cream-400/50`, `text-slate-300` → `text-cream-200`, `indigo-*` → `honey-*` (primary actions/accents) or `berry-*` (secondary accents — use judgment per-file based on what the color is marking; if unsure, prefer `honey` since it's the primary brand color), `amber-*` → `honey-*`, `emerald-*` → `sage-*`. Leave `rose-*` and `red-*` untouched (destructive/alert semantics, per Global Constraints). Do NOT change any dynamic/conditional class logic, only the literal color-name segments — if a file has its own dynamic template-string color bug like `personCard()`'s, do not attempt to fix it in this task; instead stop, note the file:line, and flag it for a follow-up task rather than silently applying a partial fix that might miss lookup-map entries this task wasn't scoped to build.

- [ ] **Step 1: Sweep each file for the color classes to replace**

For each of the 5 files, run:

```bash
grep -n "slate-\|indigo-\|amber-\|emerald-" src/components/familyos/sections/Shopping.tsx
```

(repeat for `MealPlanner.tsx`, `Pantry.tsx`, `BillTracker.tsx`, `HouseholdMemory.tsx`). Read each matched line in context with the Read tool, and apply the substitution mapping above directly in the file via Edit, one file at a time.

- [ ] **Step 2: Add focus-ring to interactive elements**

For each file, find every `<button` and clickable `<div onClick=` element (grep: `grep -n "<button\|onClick=" src/components/familyos/sections/Shopping.tsx`). For each one that has a `className` attribute, append ` focus-ring` to the end of the existing className string (if the className is a template literal, append inside the static portion, not inside a conditional branch, so it always applies regardless of state).

- [ ] **Step 3: Verify no dynamic-color bugs were introduced or left unnoticed**

Run for each file:

```bash
grep -n '\${.*}-[0-9]\{2,3\}' src/components/familyos/sections/Shopping.tsx
```

This searches for template-string interpolations immediately followed by a Tailwind shade number (the same bug pattern from `Dashboard.tsx`). If any matches appear in a file this task touches, do NOT attempt to fix them as part of this task — note the file:line and flag them explicitly in this task's completion report, since fixing them requires building a lookup map (as in Task 2) which needs the specific set of possible dynamic values investigated first.

- [ ] **Step 4: Run typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "Shopping\|MealPlanner\|Pantry\|BillTracker\|HouseholdMemory"`
Expected: no output.

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 5: Manual verification**

Requires the running app. Navigate to each of the 5 modules (via nav or "More" menu) and confirm: no slate-blue/indigo backgrounds remain, text is readable against the new bark/cream backgrounds (check contrast isn't broken — cream text on bark background, not cream-on-cream), and every button still performs its original action (add item, mark complete, edit, delete, etc. — click through at least 2 actions per module).

- [ ] **Step 6: Commit**

```bash
git add src/components/familyos/sections/Shopping.tsx src/components/familyos/sections/MealPlanner.tsx src/components/familyos/sections/Pantry.tsx src/components/familyos/sections/BillTracker.tsx src/components/familyos/sections/HouseholdMemory.tsx
git commit -m "style(sections): retheme Shopping/MealPlanner/Pantry/BillTracker/HouseholdMemory to honey/bark/cream/sage"
```

---

### Task 6: Retheme sections batch 2 — CarMaintenance, HomeMaintenance, KidsHub, HealthHub

**Files:**
- Modify: `src/components/familyos/sections/CarMaintenance.tsx`
- Modify: `src/components/familyos/sections/HomeMaintenance.tsx`
- Modify: `src/components/familyos/sections/KidsHub.tsx`
- Modify: `src/components/familyos/sections/HealthHub.tsx`

**Interfaces:**
- Consumes: same as Task 5.
- Produces: nothing new.

- [ ] **Step 1: Sweep and substitute colors (same process as Task 5 Step 1)**

Run for each file:

```bash
grep -n "slate-\|indigo-\|amber-\|emerald-\|purple-\|blue-" src/components/familyos/sections/CarMaintenance.tsx
```

(repeat for `HomeMaintenance.tsx`, `KidsHub.tsx`, `HealthHub.tsx` — these were noted as having the heaviest hit counts, ~100+ each in KidsHub/HealthHub, so budget more time for these two). Read each matched region and apply the same substitution mapping as Task 5 (`purple-*`/`blue-*` → `berry-*` for secondary accents, following the same per-file judgment call noted in Task 5's Context).

- [ ] **Step 2: Add focus-ring to interactive elements (same process as Task 5 Step 2)**

- [ ] **Step 3: Verify no dynamic-color bugs were introduced or left unnoticed (same process as Task 5 Step 3)**

Run for each file:

```bash
grep -n '\${.*}-[0-9]\{2,3\}' src/components/familyos/sections/KidsHub.tsx
```

- [ ] **Step 4: Run typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "CarMaintenance\|HomeMaintenance\|KidsHub\|HealthHub"`
Expected: no output, EXCEPT any pre-existing errors already documented in prior plans (the app-shell-redesign plan's Task 1 Step 6 mentions filtering out known pre-existing `HealthHub` errors — run `grep -n "HealthHub" docs/superpowers/plans/2026-07-23-points-and-rewards.md docs/superpowers/plans/2026-07-22-*.md` first to check if this is a known, already-tracked issue before treating any HealthHub typecheck output as a regression this task introduced).

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 5: Manual verification (same process as Task 5 Step 5, across these 4 modules)**

- [ ] **Step 6: Commit**

```bash
git add src/components/familyos/sections/CarMaintenance.tsx src/components/familyos/sections/HomeMaintenance.tsx src/components/familyos/sections/KidsHub.tsx src/components/familyos/sections/HealthHub.tsx
git commit -m "style(sections): retheme CarMaintenance/HomeMaintenance/KidsHub/HealthHub to honey/bark/cream/sage"
```

---

### Task 7: Retheme sections batch 3 — FamilyHub, FinanceHub

**Files:**
- Modify: `src/components/familyos/sections/FamilyHub.tsx`
- Modify: `src/components/familyos/sections/FinanceHub.tsx`

**Interfaces:**
- Consumes: same as Task 5.
- Produces: nothing new.

- [ ] **Step 1: Sweep and substitute colors (same process as Task 5 Step 1)**

Run:

```bash
grep -n "slate-\|indigo-\|amber-\|emerald-\|purple-\|blue-" src/components/familyos/sections/FamilyHub.tsx src/components/familyos/sections/FinanceHub.tsx
```

Read each matched region and apply the same substitution mapping as Task 5/6.

- [ ] **Step 2: Add focus-ring to interactive elements (same process as Task 5 Step 2)**

- [ ] **Step 3: Verify no dynamic-color bugs were introduced or left unnoticed (same process as Task 5 Step 3)**

- [ ] **Step 4: Run typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "FamilyHub\|FinanceHub"`
Expected: no output (or only pre-existing tracked errors — cross-check against prior plans as in Task 6 Step 4).

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 5: Manual verification (same process as Task 5 Step 5)**

Pay particular attention to `FinanceHub.tsx` — confirm any positive/negative monetary value coloring (e.g. green for income, red for expenses) was NOT accidentally remapped; financial polarity coloring is a semantic/alert convention like `rose`, not brand chrome, so `emerald`/`green` used for "money in" and `rose`/`red` used for "money out" should be left alone even though this task's general mapping would otherwise turn `emerald-*` into `sage-*` — verify by reading the surrounding context of each match before replacing, not by blind find-replace.

- [ ] **Step 6: Commit**

```bash
git add src/components/familyos/sections/FamilyHub.tsx src/components/familyos/sections/FinanceHub.tsx
git commit -m "style(sections): retheme FamilyHub/FinanceHub to honey/bark/cream/sage"
```

---

## Self-Review Notes

- **Spec coverage:**
  - §1 (brand/token mismatch): Task 1 (token registration), Task 2 (dynamic-class bug fix), Tasks 4-7 (full sweep). Covered.
  - §2 (navigation): explicitly deferred — nav consolidation and bottom-nav item cap are IA/behavior changes already outside this plan's visual-only, already-restyled-by-prior-plan `AppLayout.tsx` scope; focus-ring gap is covered by Task 3 + applied throughout Tasks 4-7. Nav consolidation and the 7-column mobile grid cap are NOT covered by any task here — flagged as a separate follow-up in the completion report, since they require touching `AppLayout.tsx` again (out of this plan's file set).
  - §3 (Dashboard): Task 4 covers all of it — flattened stat grid, progress bars, "Late" reframe.
  - §4 (HouseholdBrain): explicitly excluded per Global Constraints — confirmed functional gap, not styling, flagged for separate spec.
  - §5 (cards & elevation): partially covered — Tasks 4-7 apply consistent bark/cream/border/radius treatment via the substitution mapping, but the exact hover lift (`translateY(-2px)` + shadow-md) specified in the doc is NOT explicitly added in every task (Dashboard's KPI cards already use `hover:scale-[1.02]`, left as-is rather than changed to `translateY` to avoid an unnecessary behavior tweak on an already-working interaction; sections tasks don't mandate adding hover-lift where it doesn't already exist, since that's a net-new interaction pattern per element, not a color swap.). Flagged as a partial gap in the completion report.
- **Placeholder scan:** no TBD/TODO/"add appropriate" language found on review; all class substitutions in Task 4 are literal, all sections tasks (5-7) use a repeatable, explicit grep+read+edit process rather than vague "theme it" instructions, since 764 individual line-by-line edits across 11 files can't be hand-written in advance without having read each file first.
- **Type consistency:** `getColorCardStyle`/`COLOR_CARD_STYLES` (Task 2) match between definition and Dashboard's usage; `stats.todayCompletedCount`/`todayTotalCount` (Task 4 Step 3a) match between the memo's return and the JSX consumer; `personTaskStats.completed`/`.total` (Task 4 Step 7) match between local computation and JSX usage.
- **Known scope gaps to surface to the user before/after execution:** (1) nav consolidation + mobile 7-col cap untouched, (2) HouseholdBrain functional gap needs its own spec, (3) hover-lift spec (`translateY(-2px)`) not uniformly applied, (4) the "flatten personCard" and "Late" reframe are UX calls implemented as best-guess, not confirmed-correct, and may get redirected.
