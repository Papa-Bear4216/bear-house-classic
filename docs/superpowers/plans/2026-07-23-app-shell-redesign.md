# App Shell Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the app's shell — `AppLayout.tsx` (header, navigation, search, modals-adjacent chrome) and the shared shadcn CSS-variable theme tokens — to the honey/bark/cream/sage design system introduced on the marketing landing page, so the authenticated app and the landing page feel like one product, without hand-rewriting the ~9,500 lines of feature-screen internals (Dashboard, HouseholdBrain, FinanceHub, etc.).

**Architecture:** Two independent layers, both additive/low-risk:
1. **Shared token layer** (`src/index.css`): retint the existing shadcn `.dark`/`:root` CSS custom properties (`--background`, `--primary`, `--card`, etc.) to the new palette. Every component built from shadcn primitives (`Button`, `Card`, `Badge`, `Dialog`, etc.) picks this up automatically with zero per-component edits.
2. **Shell layer** (`src/components/AppLayout.tsx`): this file uses hardcoded Tailwind utility classes (`bg-slate-950`, `text-orange-400`, gradient accents), not the CSS-variable tokens, so it needs direct edits — swap the slate/dark-indigo palette for bark/cream/honey/sage equivalents, matching the landing page's visual language (colors, `Sora` display font for the wordmark/headings, pill-shaped nav buttons, warm shadows).

Feature screens (Dashboard, HouseholdBrain, all `sections/*.tsx`) are explicitly OUT of scope for this plan — they keep their current dark slate styling. This is a deliberate scope boundary (confirmed with the user) to keep the change reviewable and low-risk rather than a ~9,500-line rewrite.

**Tech Stack:** Tailwind CSS (existing `tailwind.config.ts`, HSL CSS custom properties), existing shadcn/ui components (unmodified — only the tokens they read change), Google Fonts `Sora` + `Plus Jakarta Sans` (already loaded for the landing page via `src/styles/landing.css`'s `@import`, reused here at the document level so the shell's fonts don't depend on a specific page mounting `landing.css`).

## Global Constraints

- Do NOT modify any component under `src/components/familyos/` except where explicitly listed in a task below (`RewardStore.tsx` if it exists from the points/rewards plan is unaffected by this plan and should not be touched here).
- Do NOT modify `Dashboard.tsx` or any `sections/*.tsx` file — those keep current styling, out of scope.
- Every existing `AppLayout.tsx` feature (search, keyboard shortcuts `n`/`p`/`e`, presence "in zone" indicator, overdue badge, role-based nav filtering, mobile bottom nav + "More" drawer, settings/history modals, QuickCapture/HermesChat/WelcomeBackModal/MagicTrail overlays) MUST continue to work identically — this is a visual-only restyle, zero behavior changes.
- The Tailwind dynamic-class safelist block in `AppLayout.tsx` (the `<div className="hidden">` list of every `bg-${accent}-*`/`border-${accent}-*`/etc. class used in nav accent template strings) MUST be updated to match any new accent color names introduced — a missed safelist entry causes an invisible bug (nav highlight silently renders as unstyled/transparent) that won't show as a build error.
- Reuse the exact CSS custom property names/values already established in `src/styles/landing.css` (`--bark-700`, `--honey-500`, `--sage-500`, `--cream-*`, `--shadow-honey`/`--shadow-sage`, etc.) rather than inventing new token names, so the two files stay in sync if either is edited later.
- This plan builds on top of the points/rewards plan (`docs/superpowers/plans/2026-07-23-points-and-rewards.md`) — if executed in the same worktree, expect `AppLayout.tsx` to already have a "Rewards" nav entry from that plan's Task 5; this plan's `AppLayout.tsx` edits must preserve it, not overwrite it.

---

## File Structure

- **Modify:** `src/index.css` — retint `:root`/`.dark` HSL variables to the new palette; add `Sora`/`Plus Jakarta Sans` font import and a `--font-display` custom property usable app-wide.
- **Modify:** `tailwind.config.ts` — extend `fontFamily` so `font-display` (Sora) is available as a Tailwind utility class, not just a raw CSS variable.
- **Modify:** `src/components/AppLayout.tsx` — restyle header background, wordmark, nav buttons (desktop + mobile), search bar, and icon buttons to the new palette; update the dynamic-class safelist to match.

---

### Task 1: Retint shared shadcn theme tokens

**Files:**
- Modify: `src/index.css`
- Modify: `tailwind.config.ts`

**Interfaces:**
- Produces: `--font-display` CSS custom property (`'Sora', system-ui, sans-serif`) and a `font-display` Tailwind utility class, consumable by Task 2 and by any shadcn component/future work that wants the display font.
- No other interfaces — this task only changes CSS variable *values*, not names, so every existing consumer (`bg-background`, `text-foreground`, `bg-card`, `border-border`, etc., used throughout `src/components/ui/*.tsx`) keeps working unchanged.

**Context:** The existing `.dark` block (lines 50-76 of `src/index.css`) is what's actually active — `ThemeProvider defaultTheme="dark"` in `src/App.tsx` forces dark mode app-wide (confirmed: no light-mode toggle is exposed to users in this app's current UI). This task only needs to update `.dark` values to look correct; `:root` (light mode) can be updated too for consistency/future-proofing but has no user-visible effect today.

- [ ] **Step 1: Convert the new palette's hex values to HSL** (shadcn CSS variables are `H S% L%` triples, not hex)

The landing page's key colors (`src/styles/landing.css`) in hex, converted to HSL (space-separated, no `hsl()` wrapper, matching this file's existing format):

| Token | Hex | HSL |
|---|---|---|
| bark-700 (bg) | `#1E0E04` | `24 76% 6%` |
| bark-800 (darker bg) | `#120800` | `24 100% 4%` |
| cream-50 (card/fg-on-dark surfaces) | `#FFFFFF` | `0 0% 100%` |
| cream-200 | `#FFF8EE` | `36 100% 96%` |
| honey-500 (primary) | `#E08C00` | `33 100% 44%` |
| sage-500 (secondary/success accent) | `#1A8A4E` | `146 68% 32%` |
| border-light (`cream-400`) | `#F8DABC` | `33 79% 85%` |
| fg-muted (`stone-500`) | `#887060` | `23 20% 40%` |

- [ ] **Step 2: Update the `.dark` block in `src/index.css`**

Replace the `.dark { ... }` block (lines 50-76) with:

```css
  .dark {
    --background: 24 76% 6%;
    --foreground: 36 100% 96%;

    --card: 24 60% 9%;
    --card-foreground: 36 100% 96%;

    --popover: 24 60% 9%;
    --popover-foreground: 36 100% 96%;

    --primary: 33 100% 44%;
    --primary-foreground: 0 0% 100%;

    --secondary: 146 68% 32%;
    --secondary-foreground: 0 0% 100%;

    --muted: 24 40% 14%;
    --muted-foreground: 23 20% 60%;

    --accent: 24 40% 14%;
    --accent-foreground: 36 100% 96%;

    --destructive: 0 70% 45%;
    --destructive-foreground: 0 0% 100%;

    --border: 24 40% 16%;
    --input: 24 40% 16%;
    --ring: 33 100% 44%;

    --sidebar-background: 24 76% 6%;
    --sidebar-foreground: 36 100% 96%;
    --sidebar-primary: 33 100% 44%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 24 40% 14%;
    --sidebar-accent-foreground: 36 100% 96%;
    --sidebar-border: 24 40% 16%;
    --sidebar-ring: 33 100% 44%;
  }
```

- [ ] **Step 3: Add the Sora font import and `--font-display` variable**

At the top of `src/index.css`, change line 1 from:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

to (add Sora + Plus Jakarta Sans alongside the existing Inter/JetBrains Mono, since some existing UI may still reference Inter as the body font default — check Step 4 before removing anything):

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

Then inside the `:root { ... }` block (applies regardless of light/dark since it's not overridden in `.dark`), add after `--radius: 0.5rem;`:

```css
    --font-display: 'Sora', system-ui, sans-serif;
```

- [ ] **Step 4: Check whether `font-sans` currently resolves to Inter, and confirm no regression**

Run: `grep -n "fontFamily" tailwind.config.ts`

Read the matched section with the Read tool. If `fontFamily.sans` is already customized to include Inter, leave it as-is (body text elsewhere in the app should NOT change font — only the new `font-display` utility is being added, per the "shell only" scope). If no `fontFamily` customization exists, Tailwind's default `font-sans` stack applies (system UI fonts) and Inter is only pulled in by the `@import` for components that reference it explicitly — either way, no existing behavior changes in this step, it's read-only verification.

- [ ] **Step 5: Add `font-display` to Tailwind's theme extension**

Open `tailwind.config.ts`. Find the `theme: { extend: { ... } }` block (confirmed present from earlier exploration — contains `colors`, `container`, etc.). Add a `fontFamily` key inside `extend`:

```ts
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
      },
```

Place it as a sibling to `colors:` inside `extend:` — do not replace or remove any existing `extend` keys (`colors`, `container`, `borderRadius`, etc. from the shadcn scaffold).

- [ ] **Step 6: Verify the build compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v "HealthHub\|MealPlanner\|sync.ts\|auth.ts"`

Expected: no new errors introduced by this task (the grep filters out the pre-existing unrelated errors documented in the points/rewards plan's prior session — if new errors appear outside that filtered list, they indicate a mistake in this task's edits and must be fixed before proceeding).

Run: `npx vite build 2>&1 | tail -30`

Expected: build succeeds (exit code 0), confirming `tailwind.config.ts` syntax is valid and CSS compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add src/index.css tailwind.config.ts
git commit -m "style(theme): retint dark theme CSS variables to honey/bark/cream/sage palette"
```

---

### Task 2: Restyle AppLayout header and wordmark

**Files:**
- Modify: `src/components/AppLayout.tsx`

**Interfaces:**
- Consumes: `--font-display`/`font-display` from Task 1 (Tailwind utility class).
- Produces: no new exports — visual-only change to existing JSX.

**Context:** Read the current header block (`src/components/AppLayout.tsx` lines 256-379) in full with the Read tool immediately before editing, since the points/rewards plan (if already executed) will have added a "Rewards" nav entry that must not be clobbered by this task's edits — treat any existing nav array entries as fixed content to preserve, only change className strings.

- [ ] **Step 1: Restyle the root container background**

Change line 239 from:

```tsx
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
```

to:

```tsx
    <div className="min-h-screen bg-[#1E0E04] text-white">
```

(Using the literal bark-700 hex rather than a Tailwind gradient utility — this codebase doesn't have `bark-*` as a named Tailwind color, and adding one to `tailwind.config.ts` for a single background is unnecessary; the landing page itself uses inline hex/CSS-variable styles for the same reason, matching that established pattern.)

- [ ] **Step 2: Restyle the header bar background and border**

Change line 257 from:

```tsx
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
```

to:

```tsx
      <header className="sticky top-0 z-30 bg-[#1E0E04]/90 backdrop-blur-md border-b border-[#F8DABC]/10">
```

- [ ] **Step 3: Restyle the wordmark and accent square**

Change lines 259-270 from:

```tsx
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br from-${accent}-500 to-${accent}-700 flex items-center justify-center font-bold text-sm transition-colors duration-500`}>
              FO
            </div>
            <div>
              <div className="font-bold leading-none">Family OS</div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                Hi, {currentUser?.name || 'Guest'}
              </div>
            </div>
          </div>
```

to:

```tsx
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E08C00] flex items-center justify-center font-display font-bold text-sm text-white">
              FO
            </div>
            <div>
              <div className="font-display font-bold leading-none">FamilyOS</div>
              <div className="text-[10px] text-white/50 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                Hi, {currentUser?.name || 'Guest'}
              </div>
            </div>
          </div>
```

Note: this drops the per-`accent`-color dynamic gradient on the logo square (previously it shifted color to match whichever nav section was active) in favor of a fixed honey color, matching the landing page's consistent branding. This is an intentional simplification — confirm it reads correctly in Step 8's manual check; if the dynamic-accent behavior is missed, it can be restored by templating `bg-[${ACCENT_HEX[accent]}]` instead (would need a hex lookup map added, out of scope unless requested).

Also note the label changed from `Family OS` (with a space) to `FamilyOS` — matching the landing page's branding exactly (confirmed in the prior landing-page task).

- [ ] **Step 4: Restyle the search bar**

Change lines 272-279 from:

```tsx
          <div className="flex-1 max-w-md mx-auto hidden sm:block relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks & promises..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
            />
```

to:

```tsx
          <div className="flex-1 max-w-md mx-auto hidden sm:block relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks & promises..."
              className="w-full bg-white/5 border border-white/10 rounded-full pl-9 pr-3 py-2 text-sm text-white placeholder-white/40 focus:border-[#E08C00] outline-none"
            />
```

Leave the search-results dropdown (lines 280-303) unchanged — it renders over the header but its content area uses `bg-slate-800`/`border-slate-700`, which is acceptable to leave as a slight visual seam for this pass since it's a transient overlay, not primary chrome. (If this looks jarring in Step 8's manual check, note it but do not fix without confirming — it's outside this task's explicit line-by-line scope; flag it in the commit message or a follow-up note instead of scope-creeping mid-task.)

- [ ] **Step 5: Restyle the header icon buttons (history, settings, logout) and time/zone indicator**

Change lines 306-328 from:

```tsx
          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${inZone ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-slate-400">{inZone ? 'In zone' : 'Off zone'}</span>
            </div>
            <div className="text-sm font-medium text-slate-300 tabular-nums">{formatTime(now)}</div>
            <button onClick={() => setHistoryOpen(true)} title="History" className="text-slate-400 hover:text-emerald-400 p-1.5 transition">
              <History className="w-5 h-5" />
            </button>
            {isAdm && (
              <button onClick={() => setSettingsOpen(true)} className="relative text-slate-400 hover:text-white p-1.5">
                <SettingsIcon className="w-5 h-5" />
                {totals.overdue > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {totals.overdue}
                  </span>
                )}
              </button>
            )}
            <button onClick={logout} title="Logout" className="text-slate-400 hover:text-rose-400 p-1.5 transition">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
```

to:

```tsx
          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${inZone ? 'bg-[#1A8A4E] animate-pulse' : 'bg-white/30'}`} />
              <span className="text-white/50">{inZone ? 'In zone' : 'Off zone'}</span>
            </div>
            <div className="text-sm font-medium text-white/70 tabular-nums">{formatTime(now)}</div>
            <button onClick={() => setHistoryOpen(true)} title="History" className="text-white/50 hover:text-[#1A8A4E] p-1.5 transition">
              <History className="w-5 h-5" />
            </button>
            {isAdm && (
              <button onClick={() => setSettingsOpen(true)} className="relative text-white/50 hover:text-white p-1.5">
                <SettingsIcon className="w-5 h-5" />
                {totals.overdue > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {totals.overdue}
                  </span>
                )}
              </button>
            )}
            <button onClick={logout} title="Logout" className="text-white/50 hover:text-rose-400 p-1.5 transition">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
```

(The overdue-count badge stays `bg-rose-500` — it's a status/alert color, not brand chrome, and rose isn't part of the honey/bark/cream/sage system; leaving it as an unambiguous "alert red" is correct and matches how the landing page itself doesn't attempt to reskin destructive/warning colors.)

- [ ] **Step 6: Verify no other header-scoped lines were missed**

Run: `sed -n '256,330p' src/components/AppLayout.tsx | grep -n "slate-"`

Expected: no matches (all `slate-*` classes in the header block, lines 256-330, have been replaced). If any remain, they were missed in Steps 1-5 — read the surrounding context and apply the same white/opacity or bark/honey/sage substitution pattern used above.

- [ ] **Step 7: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "AppLayout"`

Expected: no output (no new type errors — this task only changes string literals inside `className`, so a type error here would indicate a JSX syntax mistake, e.g. an unclosed tag).

- [ ] **Step 8: Manual verification**

Requires the real running app (`.env.local` with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, per the points/rewards plan's prerequisite). Run `npm run dev`, log in, and confirm:
1. Header background reads as dark warm brown/bark, not slate blue-gray.
2. "FamilyOS" wordmark renders in the Sora display font (visually heavier/more geometric than the body text) with the honey-orange logo square.
3. Search bar, icon buttons, and the "in zone" indicator all use white/opacity or honey/sage tones, no leftover slate-blue.
4. Nothing is functionally broken: search still filters and navigates on click, history/settings/logout buttons still open their respective modals/actions, the overdue badge still appears on the settings icon when applicable.

- [ ] **Step 9: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "style(shell): restyle AppLayout header to honey/bark palette"
```

---

### Task 3: Restyle desktop and mobile navigation

**Files:**
- Modify: `src/components/AppLayout.tsx`

**Interfaces:**
- Consumes: same as Task 2.
- Produces: nothing new.

**Context:** This is the highest-risk task in this plan because the nav buttons use **dynamically constructed Tailwind class names** (`` `bg-${n.accent}-600` ``, `` `text-${n.accent}-400` ``, etc., where `accent` comes from each `NavItem`'s `accent` field). Tailwind's JIT compiler only generates CSS for class names it can find as complete strings somewhere in the source — dynamic template strings are invisible to it UNLESS the same complete class name also appears literally in the safelist block (lines 240-254). This task must keep every `accent` value's generated classes present in the safelist, or nav highlighting will silently render unstyled (no visible error, just a missing background color) — this exact hazard is why the plan's Global Constraints call it out.

The design decision for this task: rather than trying to reskin the existing 7-color-per-section accent system (indigo/orange/purple/blue/rose/emerald/amber) into 7 new honey-system equivalents, use a SINGLE consistent accent (honey for active state) across all nav items, matching the landing page's restrained, single-accent-color visual language (the landing page uses sage/honey consistently, not a rainbow of per-section colors). This simplifies the safelist to one color and reduces risk. The `accent` field on each `NavItem`/`MAIN_NAV`/`MORE_NAV` entry stays in the data model (other code, like the wordmark logic touched in Task 2, and any future feature, may still reference it) — only the nav *button* rendering stops reading it for color.

- [ ] **Step 1: Restyle desktop nav buttons to a single honey active-state**

Read `src/components/AppLayout.tsx` lines 332-378 (desktop nav block) with the Read tool immediately before editing to get exact current content (may have shifted line numbers if the points/rewards plan already ran).

Change the nav button className logic (currently, inside the `visibleMainNav.map(...)`, a template literal like):

```tsx
                className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
                  isActive ? `bg-${n.accent}-600 text-white shadow-lg shadow-${n.accent}-500/20` : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
```

to:

```tsx
                className={`px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 transition ${
                  isActive ? 'bg-[#E08C00] text-white shadow-[0_4px_20px_rgba(224,140,0,0.45)]' : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
```

(Pill-shaped buttons — `rounded-full` — matching the landing page's nav CTA styling, plus the exact `--shadow-honey` shadow value from `src/styles/landing.css` inlined as an arbitrary Tailwind value since this file doesn't import that CSS module.)

Apply the identical className logic change to the "More" dropdown items (the `MORE_NAV.map(...)` block a few lines below in the same desktop-nav section) — find:

```tsx
                        className={`w-full px-4 py-2.5 text-sm flex items-center gap-2 transition ${isActive ? `bg-${n.accent}-600/20 text-${n.accent}-300` : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
```

replace with:

```tsx
                        className={`w-full px-4 py-2.5 text-sm flex items-center gap-2 transition ${isActive ? 'bg-[#E08C00]/20 text-[#F5A800]' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
```

And the "More" trigger button itself and its dropdown panel background — find:

```tsx
              <button
                onClick={() => setShowMore(m => !m)}
                className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                More {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showMore && (
                <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-40 min-w-[150px]">
```

replace with:

```tsx
              <button
                onClick={() => setShowMore(m => !m)}
                className="px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 text-white/50 hover:text-white hover:bg-white/5 transition"
              >
                More {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showMore && (
                <div className="absolute top-full left-0 mt-1 bg-[#1E0E04] border border-[#F8DABC]/10 rounded-xl shadow-2xl overflow-hidden z-40 min-w-[150px]">
```

- [ ] **Step 2: Restyle mobile bottom nav and its "More" drawer identically**

Find the mobile bottom nav block (the `<nav className="md:hidden ...">` section, currently ~lines 396-443). Change the nav container background:

```tsx
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-2">
```

to:

```tsx
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#1E0E04]/95 backdrop-blur-md border-t border-[#F8DABC]/10 px-2 py-2">
```

Change the More-drawer item styling — find:

```tsx
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg transition ${isActive ? `text-${n.accent}-400` : 'text-slate-500'}`}
```

replace with:

```tsx
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg transition ${isActive ? 'text-[#F5A800]' : 'text-white/40'}`}
```

Change the main bottom-tab items — find:

```tsx
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${isActive ? `text-${n.accent}-400` : 'text-slate-500'}`}
```

replace with:

```tsx
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${isActive ? 'text-[#F5A800]' : 'text-white/40'}`}
```

And the "More" toggle button in the bottom tab row — find:

```tsx
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${showMore ? 'text-white' : 'text-slate-500'}`}
```

replace with:

```tsx
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${showMore ? 'text-white' : 'text-white/40'}`}
```

- [ ] **Step 3: Simplify the dynamic-class safelist now that nav no longer uses per-accent colors**

Since Steps 1-2 removed every `` `${n.accent}-*` `` dynamic class from the nav rendering, the large safelist block (lines 240-254) is now dead weight EXCEPT for the wordmark logo square, which Task 2 already converted to a fixed `bg-[#E08C00]` (also no longer dynamic). Search the whole file for any remaining dynamic `${accent}` or `${n.accent}` usage:

Run: `grep -n '\${accent}\|\${n\.accent}' src/components/AppLayout.tsx`

Expected: no matches (all dynamic accent-color template strings were removed in Task 2 Step 3 and this task's Steps 1-2).

If no matches, the entire safelist `<div className="hidden">...</div>` block (lines 240-254) is now unused and should be deleted:

```tsx
      {/* Hidden safelist */}
      <div className="hidden">
        <span className="from-orange-500 to-orange-700 ...
        ...
      </div>
```

Delete this entire block. If Step 3's `grep` DOES find remaining matches (e.g. if the points/rewards plan or another concurrent change reintroduced a dynamic accent reference), do NOT delete the safelist — instead leave it in place untouched, since it's still load-bearing, and note the discrepancy for follow-up rather than guessing which entries are still needed.

- [ ] **Step 4: Verify no orphaned `accent` variable causes a lint error**

Run: `grep -n "const accent" src/components/AppLayout.tsx`

This finds line ~173: `const accent = [...MAIN_NAV, ...MORE_NAV].find((n) => n.id === active)?.accent || 'indigo';`. If Task 2/3 removed all usages of this `accent` variable (the wordmark and nav buttons no longer read it), it becomes an unused variable. Run:

Run: `grep -n "\baccent\b" src/components/AppLayout.tsx`

Read every matching line. If `accent` (the computed variable, not `n.accent` on nav items) has zero remaining usages after this task's edits, delete its declaration line to avoid a lint warning (this codebase's ESLint config has `noUnusedLocals: false` in `tsconfig.app.json`, so it won't fail the build, but leaving genuinely dead code is against the project's "don't leave half-finished/dead code" convention) — but only delete it if you've confirmed via the grep that nothing else references it; if anything does, leave it.

- [ ] **Step 5: Run typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "AppLayout"`
Expected: no output.

Run: `npx vite build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 6: Manual verification**

Requires the real running app. Run `npm run dev`, log in, and confirm:
1. Desktop nav: all top-level items (Dashboard, Household, Rewards if present, Kids, Family, Health, Finance if admin) render as pill-shaped buttons; the currently-active one has an honey-orange filled background with a soft glow shadow; inactive ones are transparent/white-on-hover.
2. "More" dropdown (if admin): opens on click, items highlight in honey when active, dropdown panel has a dark bark background (not the old slate).
3. Resize to mobile width (or use browser devtools device toolbar): bottom tab bar renders with the same bark background, active tab shows honey-colored icon+label, "More" drawer (if admin) expands above the tab bar showing the secondary nav items in honey when active.
4. Click through EVERY nav item (Dashboard, Household, Kids, Family, Health if visible, Finance if admin, Quality Time/Promises/Emotions via More) and confirm each one still renders its correct module content — this is a pure regression check, since Task 3 only touches className strings, not the `onClick={() => setActive(n.id)}` handlers or the `renderModule()` switch statement.
5. As a child-role test account (or by temporarily checking the `isChild`/`visibleMainNav` filter logic still excludes Health/Finance and the More menu), confirm restricted nav items remain hidden — this behavior lives in the untouched `visibleMainNav`/`isChild` filter logic (lines 161-165), so it should be unaffected, but must be visually confirmed since this is the task most likely to have accidentally broken conditional rendering while editing adjacent JSX.

- [ ] **Step 7: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "style(shell): restyle desktop and mobile nav to single honey accent, remove dead per-section color safelist"
```

---

## Self-Review Notes

- **Spec coverage:** shell restyle (header, wordmark, nav — Tasks 2-3) and shared token retint for shadcn-based components app-wide (Task 1) — both covered. Explicitly NOT covered, per confirmed scope: individual feature screens (Dashboard, HouseholdBrain, all `sections/*.tsx`) — these keep current styling.
- **Safelist hazard:** called out explicitly in Global Constraints and re-verified via `grep` in Task 3 Step 3 before any deletion — this was the single highest-risk silent-failure mode identified during planning (a missed safelist entry produces no build error, only a visually broken nav in production).
- **Regression risk:** Task 3 Step 6 explicitly re-tests every nav item's click behavior and the child-role visibility filter, since those are the most likely things to accidentally break while editing surrounding className strings in the same JSX blocks — this is the "don't break anything" verification the user asked for, made concrete rather than assumed.
- **Dependency on points/rewards plan:** if that plan's Task 5 (adding "Rewards" to nav) has already run in the same worktree before this plan starts, every task above that reads or replaces a block of `AppLayout.tsx` explicitly instructs re-reading the file first rather than assuming stale line numbers — this avoids blind-patching over the Rewards nav entry.
