# Nav & App Shell Restructure — Design

## Goal

Replace today's 7-item top-level nav + 3-item hidden "More" dropdown with a personalized, ADHD-friendly structure: each family member picks their own 3 "core" modules (Dashboard is always a 4th, permanent core slot), everything else lives behind a single "More" menu, and the whole nav collapses into one animated, icon-first bottom dock used at every screen width. The floating AI assistant (Hermes) is restyled to match but stays exactly where and how it already works — a persistent floating button, not a nav-bar slot.

This is a **shell/navigation-only** change. It does not touch: HouseholdBrain's task mechanic (separate spec, previously flagged as a functional gap), Dashboard's internal layout, or any of the 11 `sections/*.tsx` screens' internals. Those screens are reached differently, but their contents are unchanged.

## Why

- The current 7+3 structure asks a new or ADHD user to parse 10 named destinations before finding anything. Cutting the *default visible set* to 4 icons is the single highest-leverage cognitive-load reduction available without removing any functionality.
- Per-person (not household-wide) choice matters because a parent's daily-use set (Household, Finance, Family) and a kid's (Household, Rewards, Kids) are genuinely different — a shared nav forces someone to scroll past modules they never use.
- A unified bottom dock (same pattern on desktop and mobile) means one component, one set of animations, one thing to test — instead of maintaining a top-pill desktop nav and a separate bottom-bar mobile nav as two parallel implementations, which is what exists today.

## Data model

Extend the existing per-member preferences object — no new storage mechanism.

**`src/lib/familyos.ts`** — add one field to `MemberPreferences`:

```ts
export interface MemberPreferences {
  memberId: string;
  food: { ... };        // unchanged
  hobbies: { ... };      // unchanged
  entertainment: { ... }; // unchanged
  healthNotes: { ... };   // unchanged
  coreNav: TopModule[];   // NEW — exactly 3 entries, never includes 'dashboard'
  updatedAt: number;
}
```

`TopModule` is already defined in `AppLayout.tsx` (`'dashboard' | 'household' | 'kids' | 'family' | 'health' | 'finance' | 'rewards' | 'quality' | 'promises' | 'emotions'`) — it needs to move to a shared location (`familyos.ts` or a new small `src/lib/navTypes.ts`) so both `AppLayout.tsx` and `familyos.ts` can reference the same type without a circular import (`AppLayout.tsx` already imports from `familyos.ts`, not the reverse).

**Default value** (`emptyMemberPreferences()` and any migration path for existing members with no saved `coreNav`): `['household', 'family', 'rewards']`.

**Role-safety fallback:** if a saved `coreNav` entry is no longer valid for that member's role (e.g. a kid's preferences somehow contain `'finance'`), that slot silently falls back to the next default-list module not already in their set, rather than rendering a broken or blank icon. This is a defensive rule, not an expected path — role changes are rare and preferences are per-member already.

## Nav computation (`AppLayout.tsx`)

Replace `MAIN_NAV` (7 items) / `MORE_NAV` (3 items) with a computed split:

- **Core dock items** = `Dashboard` (always first, unselectable/permanent) + the current user's 3 `coreNav` picks, in the order stored, each still passing through the *existing* role-visibility filter (`isChild` blocking `health`/`finance`, `adminOnly` blocking non-admins) as a second defensive layer beneath the fallback above.
- **More-menu items** = every module in the full 10-item list not in the core dock (still role-filtered the same way `MORE_NAV` is filtered today) — this is a strict superset replacement of today's fixed `MORE_NAV`, since a module can now land in "More" either because it was never in the fixed list (old behavior) or because this particular user didn't pick it as core (new behavior).
- The full static module list (id/label/icon) stays a single constant (today's `MAIN_NAV` + `MORE_NAV` merged into one array) — only the *split* between "core dock" and "more menu" becomes per-user/computed rather than hardcoded.

No changes to `renderModule()`, the `active` state, or any routing/click-handler logic — this is purely how the two buckets get populated, not how navigation itself works.

## Layout: single bottom dock

- Remove the current desktop top-pill nav block (`AppLayout.tsx`'s `hidden md:flex` desktop nav section).
- The existing mobile bottom-nav block becomes the only nav, rendered at all breakpoints (`md:hidden` removed from it, header search/user-menu stays in the top header as-is).
- Dock shows: Dashboard icon, the 3 core icons, and one "More" icon (opens the More panel, reusing today's dropdown-panel pattern, restyled) — 5 icons total, fixed count regardless of role (a kid with fewer available modules still sees 5 dock slots; if their core-3 can't be filled due to role restrictions, the fallback rule above fills remaining slots from the default list).
- Touch targets sized for comfortable tapping (bigger than today's cramped 7-column mobile grid) — icon-first, label optional/small beneath, per the ADHD-first "reduce visual/reading load" principle already established in this project's design system doc.
- Hermes's floating position (`fixed bottom-20 right-20 md:bottom-6 md:right-20`) is checked against the new dock's height and adjusted if needed so the two don't visually collide on any breakpoint; Hermes itself is restyled from violet to the honey/bark palette established in the prior retheme work, but its behavior, position pattern, and "floating icon, not nav slot" nature don't change.

## Active-state animation

No new dependency (no Framer Motion). A CSS-only sliding/morphing "pill" indicator:
- A single absolutely-positioned pill element behind the dock icons, whose `transform: translateX(...)` and width animate (via Tailwind `transition-all` + inline computed `style`) to the active icon's position whenever `active` changes.
- The active icon itself gets a small scale/bounce on selection (`transition-transform`, brief `scale-110` then settle), consistent with the existing `hover:scale-[1.02]` pattern already used elsewhere in this codebase (e.g. Dashboard's KPI cards).
- Reduced-motion: respect `prefers-reduced-motion` by disabling the pill-slide transition (snap instantly) — this is a straightforward addition since it's a pure CSS media query, not new logic.

## Settings entry point

Add a "My Navigation" subsection inside `SettingsModal.tsx`'s existing `general` tab (not a new top-level tab) — this section is **per-logged-in-user**, not admin/household-wide, so it reads/writes `loadMemberPreferences(currentUser.id)` directly rather than the shared household `settings` object the rest of that tab uses. Shows:
- Dashboard, marked permanently selected/disabled (can't be deselected).
- The other role-allowed modules as a checkbox/toggle list, with an enforced max of 3 selections (attempting a 4th either blocks or prompts to swap one out — exact micro-interaction is an implementation detail, not a design decision that needs to be pinned down here).
- Saves immediately on change (matching this app's existing pattern of auto-saving settings rather than requiring an explicit "Save" button, per `SettingsModal.tsx`'s existing behavior elsewhere in the file).

## Explicitly out of scope

- HouseholdBrain's chore/task mechanic (chunked steps, timers, focus mode) — flagged in the prior retheme work as a genuine functional gap requiring its own spec.
- Dashboard's internal card/stat layout — unchanged by this spec.
- The 11 `sections/*.tsx` screens' internals — unchanged; only how they're *reached* changes.
- A first-login "welcome, pick your nav" guided step — deferred; new users get the default `['household', 'family', 'rewards']` and can customize later via Settings, per your explicit choice earlier in this conversation.
