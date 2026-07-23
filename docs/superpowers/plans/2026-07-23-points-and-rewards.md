# Points & Reward Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the points-and-rewards system that existed in the sibling `bear-house-os` (Next.js/Firebase) prototype, adapted to this app's Vite/React/Supabase stack: household members earn points by completing tasks, and can redeem them for rewards from a hardcoded catalog via a parent-approved request queue, with a visible redemption history.

**Architecture:** Points and redemption data are stored using this codebase's existing sync pattern — `KEYS`-keyed JSON blobs written via `saveJSON()`/`loadJSON()` in `src/lib/familyos.ts`, which mirrors to `localStorage` and pushes to Supabase's `family_data` table through the existing `pushToCloud`/`pullFromCloud`/realtime-subscribe pipeline (see `src/lib/sync.ts`, wired up in `src/App.tsx`). This requires **no new Supabase tables or migrations** — it follows the exact same storage pattern already used for tasks, promises, and emotions. A new top-level nav module ("Rewards") hosts three views: point balances (all members), a reward catalog with a redeem-request flow, and (for admins) a pending-approval queue plus redemption history.

**Tech Stack:** React 18, TypeScript, Tailwind (existing shadcn/ui components: `Card`, `Button`, `Badge`, `Dialog`), lucide-react icons, existing `KEYS`/`loadJSON`/`saveJSON` storage helpers, existing `useAppContext()` for household roster/role/current user.

## Global Constraints

- No new Supabase tables/migrations — use the existing `KEYS`-based `family_data` sync layer, exactly like every other feature (tasks, promises, emotions).
- Point values: easy chore = 15, medium = 30, hard = 50, default (no difficulty specified) = 10 — matching the original `bear-house-os` `use-settings.ts` defaults.
- Points auto-award on task completion. Non-reversible if a task is un-completed (matches original — no "claw back" logic).
- No streak bonuses — out of scope (flagged as unused/dead scaffold in the original; not part of this ask).
- Reward catalog is hardcoded (6 items, same names/costs as `bear-house-os`), not admin-editable.
- Redemption requires parent/admin approval — a kid taps "Request," it enters a pending queue; an admin/superadmin approves (deducts points, logs to history) or denies (no deduction, logs to history) it. This differs from the original (which had no approval step) per explicit user decision.
- Redemption history is visible (list of past approved/denied requests) — the original had none; this is an explicit addition.
- "Rewards" is a new top-level nav item in `AppLayout.tsx`, visible to all roles including children (children can view balances + request; only admins see the approval queue).
- Follow existing code patterns: plain React function components, inline Tailwind utility classes (not the shadcn CSS-variable theme — this codebase's feature components use hardcoded slate/accent Tailwind classes, e.g. `bg-slate-900`, `border-slate-800`, matching `HouseholdBrain.tsx`/`Promises.tsx` conventions), `uid()` from `familyos.ts` for id generation, `KEYS` object for storage keys.

---

## File Structure

- **Modify:** `src/lib/familyos.ts` — add `KEYS.points`, `KEYS.redemptions`, `POINT_VALUES` constant, `REWARD_CATALOG` constant, and types `PointsLedgerEntry` (not used — see note), `RewardRedemption`.
  - Actually: points are stored as a simple balance map (`Record<memberId, number>`), not a ledger, matching the original. See Task 1.
- **Create:** `src/components/familyos/RewardStore.tsx` — the new top-level module. Contains three sub-views (Balances, Catalog+Request, Admin Approval Queue) as internal tab state, following the same single-file-with-internal-tabs pattern as `HouseholdBrain.tsx`.
- **Modify:** `src/components/familyos/HouseholdBrain.tsx` — wire point-award into the existing task-completion toggle handler.
- **Modify:** `src/components/AppLayout.tsx` — add "Rewards" to `MAIN_NAV`, add its render case, add its Tailwind safelist colors.

---

### Task 1: Points storage helpers and reward catalog constants

**Files:**
- Modify: `src/lib/familyos.ts`
- Test: `src/lib/familyos.test.ts` (create if it doesn't exist — check first)

**Interfaces:**
- Produces:
  - `KEYS.points: 'household_points'`
  - `KEYS.redemptions: 'reward_redemptions'`
  - `type PointsBalance = Record<string, number>` (keyed by household member id)
  - `type RedemptionStatus = 'pending' | 'approved' | 'denied'`
  - `type RewardRedemption = { id: string; memberId: string; memberName: string; rewardId: number; rewardTitle: string; cost: number; status: RedemptionStatus; requestedAt: number; resolvedAt?: number; resolvedBy?: string }`
  - `type RewardCatalogItem = { id: number; title: string; cost: number; icon: string }` (`icon` is a lucide-react icon name string, resolved to a component in the UI layer, not stored as a component reference)
  - `REWARD_CATALOG: RewardCatalogItem[]` — the 6 hardcoded rewards
  - `POINT_VALUES: { easy: number; medium: number; hard: number; default: number }`
  - `function loadPointsBalance(): PointsBalance`
  - `function awardPoints(memberId: string, amount: number): void` — reads balance, adds `amount`, saves
  - `function loadRedemptions(): RewardRedemption[]`
  - `function saveRedemptions(items: RewardRedemption[]): void`

- [ ] **Step 1: Check for an existing test file convention**

Run: `ls src/lib/*.test.ts`

Expected: prints existing test files (e.g. `familyos.test.ts` if present, or none). This codebase uses Vitest (`vitest.config.ts` at repo root, `npm test` runs `vitest run`). If `src/lib/familyos.test.ts` doesn't exist, Step 2 creates it.

- [ ] **Step 2: Write the failing test**

Create/append to `src/lib/familyos.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { KEYS, loadPointsBalance, awardPoints, loadRedemptions, saveRedemptions, REWARD_CATALOG, POINT_VALUES } from './familyos';

describe('points storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadPointsBalance returns empty object when nothing stored', () => {
    expect(loadPointsBalance()).toEqual({});
  });

  it('awardPoints adds to a new member balance', () => {
    awardPoints('member-1', 15);
    expect(loadPointsBalance()).toEqual({ 'member-1': 15 });
  });

  it('awardPoints accumulates on an existing balance', () => {
    awardPoints('member-1', 15);
    awardPoints('member-1', 30);
    expect(loadPointsBalance()).toEqual({ 'member-1': 45 });
  });

  it('awardPoints keeps separate balances per member', () => {
    awardPoints('member-1', 15);
    awardPoints('member-2', 50);
    expect(loadPointsBalance()).toEqual({ 'member-1': 15, 'member-2': 50 });
  });

  it('loadRedemptions returns empty array when nothing stored', () => {
    expect(loadRedemptions()).toEqual([]);
  });

  it('saveRedemptions persists and loadRedemptions reads it back', () => {
    const entry = {
      id: 'r1', memberId: 'member-1', memberName: 'Kid', rewardId: 1,
      rewardTitle: 'Extra Screen Time (30m)', cost: 50,
      status: 'pending' as const, requestedAt: 1000,
    };
    saveRedemptions([entry]);
    expect(loadRedemptions()).toEqual([entry]);
  });

  it('REWARD_CATALOG has 6 items matching the original bear-house-os catalog', () => {
    expect(REWARD_CATALOG).toHaveLength(6);
    expect(REWARD_CATALOG.map(r => r.title)).toEqual([
      'Extra Screen Time (30m)',
      'Choose Movie Night',
      '$5 Allowance Bonus',
      'Stay Up 1hr Late',
      'Trip to Ice Cream Shop',
      'Skip One Chore',
    ]);
    expect(REWARD_CATALOG.map(r => r.cost)).toEqual([50, 100, 200, 150, 300, 120]);
  });

  it('POINT_VALUES matches original bear-house-os defaults', () => {
    expect(POINT_VALUES).toEqual({ easy: 15, medium: 30, hard: 50, default: 10 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/familyos.test.ts`
Expected: FAIL — `loadPointsBalance`, `awardPoints`, `loadRedemptions`, `saveRedemptions`, `REWARD_CATALOG`, `POINT_VALUES` are not exported from `./familyos`.

- [ ] **Step 4: Add KEYS entries**

In `src/lib/familyos.ts`, find the `KEYS` object (around line 25) and add two new entries:

```ts
export const KEYS = {
  tasks: 'household_tasks',
  presenceZones: 'presence_zones',
  presenceLog: 'presence_log',
  householdAI: 'household_ai_failsafe',
  pillars: 'four_pillars',
  activities: 'quality_activities',
  qualityAI: 'quality_time_ai_failsafe',
  promises: 'family_promises',
  emotions: 'emotion_logs',
  geminiApiKey: 'gemini_api_key',
  promisesAI: 'promise_keeper_ai_failsafe',
  apiKey: 'anthropic_api_key',
  settings: 'familyos_settings',
  cameraToken: 'camera_access_token',
  points: 'household_points',
  redemptions: 'reward_redemptions',
};
```

- [ ] **Step 5: Add reward catalog and point value constants**

Add near the other constant exports (e.g. after `TASK_CATEGORIES`):

```ts
export type RewardCatalogItem = { id: number; title: string; cost: number; icon: string };

export const REWARD_CATALOG: RewardCatalogItem[] = [
  { id: 1, title: 'Extra Screen Time (30m)', cost: 50, icon: 'Video' },
  { id: 2, title: 'Choose Movie Night', cost: 100, icon: 'Film' },
  { id: 3, title: '$5 Allowance Bonus', cost: 200, icon: 'DollarSign' },
  { id: 4, title: 'Stay Up 1hr Late', cost: 150, icon: 'Moon' },
  { id: 5, title: 'Trip to Ice Cream Shop', cost: 300, icon: 'IceCream' },
  { id: 6, title: 'Skip One Chore', cost: 120, icon: 'PartyPopper' },
];

export const POINT_VALUES = { easy: 15, medium: 30, hard: 50, default: 10 };
```

- [ ] **Step 6: Add points balance and redemption storage functions**

Add near the other `loadJSON`/`saveJSON`-based helpers (e.g. after `savePantry`):

```ts
export type PointsBalance = Record<string, number>;

export function loadPointsBalance(): PointsBalance {
  return loadJSON<PointsBalance>(KEYS.points, {});
}

export function awardPoints(memberId: string, amount: number): void {
  const balance = loadPointsBalance();
  balance[memberId] = (balance[memberId] ?? 0) + amount;
  saveJSON(KEYS.points, balance);
}

export type RedemptionStatus = 'pending' | 'approved' | 'denied';

export type RewardRedemption = {
  id: string;
  memberId: string;
  memberName: string;
  rewardId: number;
  rewardTitle: string;
  cost: number;
  status: RedemptionStatus;
  requestedAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
};

export function loadRedemptions(): RewardRedemption[] {
  return loadJSON<RewardRedemption[]>(KEYS.redemptions, []);
}

export function saveRedemptions(items: RewardRedemption[]): void {
  saveJSON(KEYS.redemptions, items);
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/lib/familyos.test.ts`
Expected: PASS (all 8 tests green)

- [ ] **Step 8: Commit**

```bash
git add src/lib/familyos.ts src/lib/familyos.test.ts
git commit -m "feat(rewards): add points balance and redemption storage helpers"
```

---

### Task 2: Award points on task completion

**Files:**
- Modify: `src/components/familyos/HouseholdBrain.tsx`

**Interfaces:**
- Consumes: `awardPoints(memberId: string, amount: number): void` and `POINT_VALUES` from `@/lib/familyos` (Task 1); `useAppContext().householdMembers` (existing) to resolve a `person` name string to a member `id`.
- Produces: nothing new consumed by later tasks — this is a leaf integration.

**Context:** `HouseholdBrain.tsx`'s `Task` interface has `person: string` (a display name, not a member id — see `interface Task` at line 28) and `completed: boolean`. Find the function that toggles `completed` (search for where `setTasks` flips `completed` from `false` to `true` — likely named something like `toggleTask` or inline in the task-row `onClick`). Tasks don't currently have a `difficulty` field, so award `POINT_VALUES.default` (10) on every completion — matching the "default (no difficulty specified) = 10" global constraint. (A `difficulty` field and variable award amounts are out of scope for this plan; the original's difficulty-based awards came from its AI chore-scanner integration, which is a separate concern.)

- [ ] **Step 1: Locate the task-completion toggle**

Run: `grep -n "completed:" src/components/familyos/HouseholdBrain.tsx`

Find the handler that sets `completed: true` on a task (not the initial creation, which sets `completed: false`). Read 15 lines of context around it with the Read tool to see the exact current implementation before editing.

- [ ] **Step 2: Write the failing test**

This component has no existing test file and heavy DOM/AI/voice dependencies that make a full render-test expensive to set up. Instead, write a focused unit test for a small extracted pure function rather than testing through the component. Add this helper directly in `HouseholdBrain.tsx` (not exported elsewhere, but exported from the module for testability) above the component:

```ts
export function resolveMemberIdByName(members: { id: string; name: string }[], name: string): string | null {
  return members.find((m) => m.name === name)?.id ?? null;
}
```

Create `src/components/familyos/HouseholdBrain.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveMemberIdByName } from './HouseholdBrain';

describe('resolveMemberIdByName', () => {
  it('finds a member id by matching name', () => {
    const members = [{ id: 'm1', name: 'Maya' }, { id: 'm2', name: 'Jordan' }];
    expect(resolveMemberIdByName(members, 'Jordan')).toBe('m2');
  });

  it('returns null when no member matches', () => {
    const members = [{ id: 'm1', name: 'Maya' }];
    expect(resolveMemberIdByName(members, 'General')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/familyos/HouseholdBrain.test.ts`
Expected: FAIL — `resolveMemberIdByName` is not exported from `./HouseholdBrain` (it doesn't exist yet).

- [ ] **Step 4: Add the helper function**

In `src/components/familyos/HouseholdBrain.tsx`, add this exported function above the `HouseholdBrain` component definition (after the `interface Task` block, before `const PRIORITY_COLORS`):

```ts
export function resolveMemberIdByName(members: { id: string; name: string }[], name: string): string | null {
  return members.find((m) => m.name === name)?.id ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/familyos/HouseholdBrain.test.ts`
Expected: PASS (2 tests green)

- [ ] **Step 6: Wire point-award into the completion toggle**

Add the import at the top of `src/components/familyos/HouseholdBrain.tsx` (in the existing `@/lib/familyos` import block):

```ts
import {
  KEYS,
  householdPersons,
  PRIORITIES,
  TASK_CATEGORIES,
  RECURRENCE_OPTIONS,
  loadJSON,
  saveJSON,
  uid,
  callClaude,
  tryParseJSON,
  isOverdue,
  formatDate,
  nextRecurrence,
  describeRecurrence,
  daysUntilDue,
  formatDueBadge,
  dateInputValue,
  parseDateInput,
  Recurrence,
  awardPoints,
  POINT_VALUES,
} from '@/lib/familyos';
```

Also add `useAppContext` already imported — confirm `householdMembers` is destructured where `currentUser`/`currentRole` (or similar) is pulled from `useAppContext()`. If `householdMembers` isn't already destructured there, add it:

```ts
const { householdMembers } = useAppContext();
```

(Note: `HouseholdBrain.tsx` line 59 already has `const { householdMembers } = useAppContext();` — verify this before adding a duplicate declaration; if present, skip this sub-step.)

In the task-completion toggle handler located in Step 1, after the line that sets `completed: true` on the task (and before/after `setTasks(...)`, whichever preserves the existing control flow), add:

```ts
const memberId = resolveMemberIdByName(householdMembers, task.person);
if (memberId) awardPoints(memberId, POINT_VALUES.default);
```

Use the actual variable name for the task being completed as it appears in the existing handler (e.g. if the handler is `toggleTask(id: string)`, look up the task object from `tasks` by `id` first to get its `.person` before calling `resolveMemberIdByName`). Do NOT award points when a task transitions from `completed: true` back to `false` (un-completing) — only on the `false → true` transition, matching the "non-reversible" global constraint.

- [ ] **Step 7: Manual verification (no automated test for the full integration — documented limitation)**

This step requires the real running app (see the parent plan's env-var prerequisite). Once `.env.local` has `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` and `npm run dev` reaches a real household session:
1. Navigate to Household → Tasks.
2. Complete a task assigned to a specific member.
3. Open browser devtools → Application → Local Storage → find key `household_points` → confirm it contains `{"<memberId>": 10}` (or accumulated if other tasks were already completed).

Expected: the member's id (matching their `household_members.id`) appears with a value incremented by 10.

- [ ] **Step 8: Commit**

```bash
git add src/components/familyos/HouseholdBrain.tsx src/components/familyos/HouseholdBrain.test.ts
git commit -m "feat(rewards): award points automatically when a task is completed"
```

---

### Task 3: RewardStore component — balances view and catalog/request view

**Files:**
- Create: `src/components/familyos/RewardStore.tsx`
- Test: `src/components/familyos/RewardStore.test.tsx`

**Interfaces:**
- Consumes:
  - `loadPointsBalance(): PointsBalance`, `REWARD_CATALOG`, `loadRedemptions(): RewardRedemption[]`, `saveRedemptions(items: RewardRedemption[]): void`, `uid(): string` from `@/lib/familyos` (Task 1).
  - `useAppContext()` → `{ householdMembers, currentUser, currentRole }` (existing).
- Produces: `export default function RewardStore(): JSX.Element` — consumed by `AppLayout.tsx` in Task 5. No props (self-contained, reads context directly, matching the pattern of `HouseholdBrain`/`Promises`/`Emotions`).

**Context:** Follow the existing component conventions seen in `Promises.tsx` and `HouseholdBrain.tsx`: plain function component, `useState` for local UI state, `loadJSON`/direct helper calls (not React Query — this codebase doesn't use it for feature data, only `AppContext` for identity), Tailwind slate/accent utility classes matching the dark theme (`bg-slate-900`, `border-slate-800`, `text-slate-400`, rounded-xl/2xl cards), shadcn `Dialog` component from `@/components/ui/dialog` for the request modal (check `src/components/ui/dialog.tsx` exists — it does, per the `@radix-ui/react-dialog` dependency in `package.json`).

This task builds the two member-facing views (Balances, Catalog+Request) as internal tabs. The Admin Approval Queue view is Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/components/familyos/RewardStore.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RewardStore from './RewardStore';
import { AppContext } from '@/contexts/AppContext';
import { KEYS } from '@/lib/familyos';

const mockContextValue = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  currentUser: { id: 'm1', name: 'Jordan', email: '', role: 'child' as const, color: 'blue' },
  currentRole: 'child' as const,
  householdMembers: [
    { id: 'm1', name: 'Jordan', email: '', role: 'child' as const, color: 'blue' },
    { id: 'm2', name: 'Maya', email: '', role: 'admin' as const, color: 'purple' },
  ],
  householdId: 'h1',
  subscriptionStatus: 'active',
  bypassBilling: false,
  logout: () => {},
  setCurrentUser: () => {},
};

function renderWithContext(overrides = {}) {
  return render(
    <AppContext.Provider value={{ ...mockContextValue, ...overrides }}>
      <RewardStore />
    </AppContext.Provider>
  );
}

describe('RewardStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows each household member\'s point balance', () => {
    localStorage.setItem(KEYS.points, JSON.stringify({ m1: 120, m2: 300 }));
    renderWithContext();
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByText(/300/)).toBeInTheDocument();
  });

  it('shows 0 points for a member with no balance recorded', () => {
    renderWithContext();
    const zeros = screen.getAllByText(/0 pts/);
    expect(zeros.length).toBeGreaterThan(0);
  });

  it('renders all 6 reward catalog items', () => {
    renderWithContext();
    expect(screen.getByText('Extra Screen Time (30m)')).toBeInTheDocument();
    expect(screen.getByText('Choose Movie Night')).toBeInTheDocument();
    expect(screen.getByText('$5 Allowance Bonus')).toBeInTheDocument();
    expect(screen.getByText('Stay Up 1hr Late')).toBeInTheDocument();
    expect(screen.getByText('Trip to Ice Cream Shop')).toBeInTheDocument();
    expect(screen.getByText('Skip One Chore')).toBeInTheDocument();
  });

  it('creates a pending redemption request when the current user has enough points and confirms', () => {
    localStorage.setItem(KEYS.points, JSON.stringify({ m1: 100 }));
    renderWithContext();
    const requestButtons = screen.getAllByRole('button', { name: /request/i });
    fireEvent.click(requestButtons[0]); // Extra Screen Time, cost 50
    const confirmButton = screen.getByRole('button', { name: /confirm request/i });
    fireEvent.click(confirmButton);

    const stored = JSON.parse(localStorage.getItem(KEYS.redemptions) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      memberId: 'm1',
      memberName: 'Jordan',
      rewardTitle: 'Extra Screen Time (30m)',
      cost: 50,
      status: 'pending',
    });
  });

  it('disables the request button when the current user cannot afford a reward', () => {
    localStorage.setItem(KEYS.points, JSON.stringify({ m1: 10 }));
    renderWithContext();
    const requestButtons = screen.getAllByRole('button', { name: /request/i });
    // Extra Screen Time costs 50, member has 10 — button should be disabled
    expect(requestButtons[0]).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/familyos/RewardStore.test.tsx`
Expected: FAIL — cannot find module `./RewardStore` (file doesn't exist yet). Also confirm `AppContext` is exported as a named export from `@/contexts/AppContext` (check `src/contexts/AppContext.tsx` — currently only `AppProvider` and `useAppContext` are exported, not `AppContext` itself). If `AppContext` is not exported, this test file's import will fail separately — that's expected and fixed in Step 3.

- [ ] **Step 3: Export AppContext for testability (if not already exported)**

Check `src/contexts/AppContext.tsx` line 31: `const AppContext = createContext<AppContextType>(defaultAppContext);`. Change to:

```ts
export const AppContext = createContext<AppContextType>(defaultAppContext);
```

This is a pure additive export — no existing behavior changes, since `useAppContext` already wraps this context and every other consumer keeps using `useAppContext()`.

- [ ] **Step 4: Confirm testing-library dependencies are present**

Run: `grep -n "@testing-library" package.json`

Expected output should include `@testing-library/react` and `@testing-library/jest-dom` (or similar). If missing, check `vitest.config.ts` for the test setup file and existing test patterns elsewhere in the repo (e.g. `api/_billingAuth.test.ts`, `api/_schemas.test.ts`) to see whether component-level testing-library tests exist anywhere already, since this repo's existing tests appear to be for `/api` backend logic, not React components. If `@testing-library/react` is not installed, install it as a dev dependency:

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 5: Write RewardStore.tsx — balances and catalog/request views**

Create `src/components/familyos/RewardStore.tsx`:

```tsx
import React, { useState, useMemo } from 'react';
import {
  Video, Film, DollarSign, Moon, IceCream, PartyPopper, Gift, Trophy,
} from 'lucide-react';
import {
  REWARD_CATALOG, loadPointsBalance, loadRedemptions, saveRedemptions,
  uid, RewardRedemption, RewardCatalogItem,
} from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Video, Film, DollarSign, Moon, IceCream, PartyPopper,
};

const COLOR_DOT: Record<string, string> = {
  indigo: 'bg-indigo-400', pink: 'bg-pink-400', purple: 'bg-purple-400',
  blue: 'bg-blue-400', orange: 'bg-orange-400', rose: 'bg-rose-400',
  emerald: 'bg-emerald-400', slate: 'bg-slate-400',
};

const RewardStore: React.FC = () => {
  const { householdMembers, currentUser, currentRole } = useAppContext();
  const isAdm = currentRole === 'superadmin' || currentRole === 'admin';

  const [redemptions, setRedemptions] = useState<RewardRedemption[]>(() => loadRedemptions());
  const [balance] = useState(() => loadPointsBalance());
  const [requestModal, setRequestModal] = useState<RewardCatalogItem | null>(null);

  const myBalance = currentUser ? (balance[currentUser.id] ?? 0) : 0;
  const myPendingCost = useMemo(
    () => redemptions
      .filter((r) => r.memberId === currentUser?.id && r.status === 'pending')
      .reduce((sum, r) => sum + r.cost, 0),
    [redemptions, currentUser]
  );
  const mySpendable = myBalance - myPendingCost;

  const persistRedemptions = (next: RewardRedemption[]) => {
    setRedemptions(next);
    saveRedemptions(next);
  };

  const confirmRequest = () => {
    if (!requestModal || !currentUser) return;
    const entry: RewardRedemption = {
      id: uid(),
      memberId: currentUser.id,
      memberName: currentUser.name,
      rewardId: requestModal.id,
      rewardTitle: requestModal.title,
      cost: requestModal.cost,
      status: 'pending',
      requestedAt: Date.now(),
    };
    persistRedemptions([entry, ...redemptions]);
    setRequestModal(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-3">Point balances</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {householdMembers.map((m) => {
            const pts = balance[m.id] ?? 0;
            return (
              <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${COLOR_DOT[m.color] || 'bg-slate-400'}`} />
                <div>
                  <div className="text-sm font-medium text-slate-200">{m.name}</div>
                  <div className="text-xs text-slate-400">{pts} pts</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Reward store</h2>
          {currentUser && (
            <div className="text-sm text-slate-400">
              You have <span className="text-amber-400 font-semibold">{mySpendable} pts</span> to spend
              {myPendingCost > 0 && <span className="text-slate-500"> ({myPendingCost} pending)</span>}
            </div>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REWARD_CATALOG.map((r) => {
            const Icon = ICONS[r.icon] || Gift;
            const affordable = mySpendable >= r.cost;
            return (
              <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-900/30 border border-amber-500/30 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">{r.title}</div>
                  <div className="text-xs text-slate-400">{r.cost} pts</div>
                </div>
                <Button
                  size="sm"
                  disabled={!affordable || !currentUser}
                  onClick={() => setRequestModal(r)}
                >
                  Request
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!requestModal} onOpenChange={(open) => !open && setRequestModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request "{requestModal?.title}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-400">
            This will send a request to a parent for approval. {requestModal?.cost} points will be
            held until they respond.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestModal(null)}>Cancel</Button>
            <Button onClick={confirmRequest}>Confirm request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RewardStore;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/familyos/RewardStore.test.tsx`
Expected: PASS (5 tests green). If the "disables the request button" test fails because `mySpendable` starts undefined before `currentUser` resolves, double check `mockContextValue.currentUser.id` is `'m1'` and the balance test seeds `KEYS.points` with `{ m1: 10 }` — cost 50 > spendable 10, button should carry the `disabled` attribute via shadcn `Button`'s native `disabled` prop passthrough.

- [ ] **Step 7: Commit**

```bash
git add src/components/familyos/RewardStore.tsx src/components/familyos/RewardStore.test.tsx src/contexts/AppContext.tsx package.json package-lock.json
git commit -m "feat(rewards): add RewardStore component with balances and request flow"
```

---

### Task 4: Admin approval queue and redemption history

**Files:**
- Modify: `src/components/familyos/RewardStore.tsx`
- Modify: `src/components/familyos/RewardStore.test.tsx`

**Interfaces:**
- Consumes: same as Task 3, plus `currentRole` (already destructured in Task 3) to gate the admin queue section.
- Produces: no new exports — same `export default RewardStore`.

**Context:** Add an admin-only section (rendered when `isAdm` is true, already computed in Task 3) below the reward store grid: a list of `pending` redemptions with Approve/Deny buttons, and below that, a collapsed/scrollable history list of all `approved`/`denied` redemptions (both, not just admin's own). Approving deducts points from the requester's balance and updates the entry to `status: 'approved'`; denying updates to `status: 'denied'` with no point deduction. Both set `resolvedAt` and `resolvedBy` (the acting admin's name).

- [ ] **Step 1: Write the failing test**

Append to `src/components/familyos/RewardStore.test.tsx` (inside the existing `describe('RewardStore', ...)` block, after the last existing `it(...)`):

```tsx
  it('shows the pending approval queue to admins and lets them approve, deducting points', () => {
    localStorage.setItem(KEYS.points, JSON.stringify({ m1: 100 }));
    localStorage.setItem(KEYS.redemptions, JSON.stringify([
      { id: 'r1', memberId: 'm1', memberName: 'Jordan', rewardId: 1, rewardTitle: 'Extra Screen Time (30m)', cost: 50, status: 'pending', requestedAt: 1000 },
    ]));
    renderWithContext({ currentUser: mockContextValue.householdMembers[1], currentRole: 'admin' });

    expect(screen.getByText(/Jordan/)).toBeInTheDocument();
    expect(screen.getByText(/Extra Screen Time/)).toBeInTheDocument();

    const approveButton = screen.getByRole('button', { name: /approve/i });
    fireEvent.click(approveButton);

    const stored = JSON.parse(localStorage.getItem(KEYS.redemptions) || '[]');
    expect(stored[0].status).toBe('approved');
    expect(stored[0].resolvedBy).toBe('Maya');

    const balance = JSON.parse(localStorage.getItem(KEYS.points) || '{}');
    expect(balance.m1).toBe(50); // 100 - 50
  });

  it('denying a pending request does not deduct points', () => {
    localStorage.setItem(KEYS.points, JSON.stringify({ m1: 100 }));
    localStorage.setItem(KEYS.redemptions, JSON.stringify([
      { id: 'r1', memberId: 'm1', memberName: 'Jordan', rewardId: 1, rewardTitle: 'Extra Screen Time (30m)', cost: 50, status: 'pending', requestedAt: 1000 },
    ]));
    renderWithContext({ currentUser: mockContextValue.householdMembers[1], currentRole: 'admin' });

    const denyButton = screen.getByRole('button', { name: /deny/i });
    fireEvent.click(denyButton);

    const stored = JSON.parse(localStorage.getItem(KEYS.redemptions) || '[]');
    expect(stored[0].status).toBe('denied');

    const balance = JSON.parse(localStorage.getItem(KEYS.points) || '{}');
    expect(balance.m1).toBe(100); // unchanged
  });

  it('does not show the approval queue to non-admin members', () => {
    localStorage.setItem(KEYS.redemptions, JSON.stringify([
      { id: 'r1', memberId: 'm1', memberName: 'Jordan', rewardId: 1, rewardTitle: 'Extra Screen Time (30m)', cost: 50, status: 'pending', requestedAt: 1000 },
    ]));
    renderWithContext(); // default context is currentRole: 'child'
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
  });

  it('shows resolved redemptions in a history list', () => {
    localStorage.setItem(KEYS.redemptions, JSON.stringify([
      { id: 'r1', memberId: 'm1', memberName: 'Jordan', rewardId: 3, rewardTitle: '$5 Allowance Bonus', cost: 200, status: 'approved', requestedAt: 1000, resolvedAt: 2000, resolvedBy: 'Maya' },
    ]));
    renderWithContext({ currentUser: mockContextValue.householdMembers[1], currentRole: 'admin' });
    expect(screen.getByText(/\$5 Allowance Bonus/)).toBeInTheDocument();
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/familyos/RewardStore.test.tsx`
Expected: FAIL — no "Approve"/"Deny" buttons exist yet, no history section exists yet.

- [ ] **Step 3: Add the approval queue and history sections**

In `src/components/familyos/RewardStore.tsx`, add two more handler functions after `confirmRequest`:

```ts
const resolveRedemption = (id: string, status: 'approved' | 'denied') => {
  const entry = redemptions.find((r) => r.id === id);
  if (!entry || !currentUser) return;

  const next = redemptions.map((r) =>
    r.id === id ? { ...r, status, resolvedAt: Date.now(), resolvedBy: currentUser.name } : r
  );
  persistRedemptions(next);

  if (status === 'approved') {
    const bal = loadPointsBalance();
    bal[entry.memberId] = (bal[entry.memberId] ?? 0) - entry.cost;
    saveJSON(KEYS.points, bal);
  }
};
```

This requires importing `saveJSON` and `KEYS` at the top — update the import block:

```ts
import {
  REWARD_CATALOG, loadPointsBalance, loadRedemptions, saveRedemptions,
  uid, RewardRedemption, RewardCatalogItem, saveJSON, KEYS,
} from '@/lib/familyos';
```

Add derived lists inside the component body, near the `myBalance`/`mySpendable` calculations:

```ts
const pending = useMemo(() => redemptions.filter((r) => r.status === 'pending'), [redemptions]);
const history = useMemo(
  () => redemptions.filter((r) => r.status !== 'pending').sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0)),
  [redemptions]
);
```

Add JSX after the reward-store grid `</div>` closing the catalog section, before the `<Dialog>`:

```tsx
      {isAdm && pending.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Pending requests</h2>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="bg-slate-900 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-200">
                    <span className="font-medium">{r.memberName}</span> wants <span className="text-amber-400">{r.rewardTitle}</span>
                  </div>
                  <div className="text-xs text-slate-500">{r.cost} pts</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => resolveRedemption(r.id, 'denied')}>Deny</Button>
                  <Button size="sm" onClick={() => resolveRedemption(r.id, 'approved')}>Approve</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isAdm && history.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Redemption history</h2>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {history.map((r) => (
              <div key={r.id} className="text-sm flex items-center justify-between gap-3 px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-lg">
                <div className="text-slate-300">
                  {r.memberName} — {r.rewardTitle} ({r.cost} pts)
                </div>
                <span className={`text-xs font-medium ${r.status === 'approved' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/familyos/RewardStore.test.tsx`
Expected: PASS (all 9 tests green)

- [ ] **Step 5: Commit**

```bash
git add src/components/familyos/RewardStore.tsx src/components/familyos/RewardStore.test.tsx
git commit -m "feat(rewards): add admin approval queue and redemption history"
```

---

### Task 5: Wire RewardStore into AppLayout navigation

**Files:**
- Modify: `src/components/AppLayout.tsx`

**Interfaces:**
- Consumes: `import RewardStore from '@/components/familyos/RewardStore'` (Task 3/4).
- Produces: nothing consumed by later tasks (leaf task).

- [ ] **Step 1: Add the import**

In `src/components/AppLayout.tsx`, add near the other `@/components/familyos/*` imports (after the `FinanceHub` import, before `QuickCapture`):

```ts
import RewardStore from '@/components/familyos/RewardStore';
```

- [ ] **Step 2: Add "rewards" to the TopModule type**

Change line 34 from:

```ts
type TopModule = 'dashboard' | 'household' | 'kids' | 'family' | 'health' | 'finance' | 'quality' | 'promises' | 'emotions';
```

to:

```ts
type TopModule = 'dashboard' | 'household' | 'kids' | 'family' | 'health' | 'finance' | 'rewards' | 'quality' | 'promises' | 'emotions';
```

- [ ] **Step 3: Add "Rewards" to MAIN_NAV**

Add the `Trophy` icon to the lucide-react import at the top of the file (line 2-6 block):

```ts
import {
  Home, Calendar, Handshake, Heart, LayoutDashboard, Settings as SettingsIcon,
  Search, History, Users, DollarSign, ChevronUp, ChevronDown, LogOut,
  ShoppingCart, Utensils, Receipt, Car, Wrench, Baby, Brain, Package, Trophy
} from 'lucide-react';
```

Update `MAIN_NAV` (around line 39-46) to insert Rewards after Household, visible to all roles (no `adminOnly`, and not in the child-restriction list, since kids are the intended primary audience for viewing/requesting):

```ts
const MAIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, accent: 'indigo' },
  { id: 'household', label: 'Household', icon: Home, accent: 'orange' },
  { id: 'rewards', label: 'Rewards', icon: Trophy, accent: 'amber' },
  { id: 'kids', label: 'Kids', icon: Baby, accent: 'purple' },
  { id: 'family', label: 'Family', icon: Users, accent: 'blue' },
  { id: 'health', label: 'Health', icon: Heart, accent: 'rose' },
  { id: 'finance', label: 'Finance', icon: DollarSign, accent: 'emerald', adminOnly: true },
];
```

- [ ] **Step 4: Add the render case**

In the `renderModule` function's `switch (active)` block (around line 186-233), add a case after `'household'`'s closing and before `case 'kids':`:

```ts
      case 'rewards':
        return <RewardStore />;
```

- [ ] **Step 5: Add "amber" to the Tailwind safelist**

The hidden safelist block (lines 240-254) force-generates dynamic Tailwind classes for each accent color used in nav highlighting (`bg-${accent}-600`, `shadow-${accent}-500/20`, etc. — these are template-string class names that Tailwind's JIT compiler can't statically detect, so they must appear literally somewhere in source). `amber` is NEW to `MAIN_NAV`/`MORE_NAV` accents (previously only used for the no-API-key banner, which already hardcodes `amber-900/30` etc. directly, not dynamically). Add an amber line to the safelist `<div className="hidden">` block, following the exact pattern of the existing `orange`/`emerald` lines:

```tsx
        <span className="bg-amber-500 bg-amber-600 bg-amber-900/40 bg-amber-600/20 bg-amber-600/30 border-amber-500 border-amber-500/20 border-amber-500/30 border-amber-500/40 text-amber-200 text-amber-300 text-amber-400 from-amber-900/40 from-amber-900/30 hover:bg-amber-500 hover:bg-amber-600/30 shadow-amber-500/20" />
```

Check whether this exact line already exists in the safelist (search for `bg-amber-500 bg-amber-600` — the no-API-key banner section uses plain `amber-900/30`/`amber-200` classes directly in JSX, which Tailwind can already see statically, so those don't need safelisting; only the *dynamically constructed* `` `bg-${accent}-600` `` etc. in the nav-button className template strings need the safelist entry). If an amber line with different classes already exists, extend it rather than duplicating — check the file's current safelist content with the Read tool first.

- [ ] **Step 6: Manual verification**

This is a navigation-wiring change with no isolated unit-testable surface (it's a `switch` case and array entry). Verify via the existing landing-page-style isolated smoke test pattern used previously in this repo (temporarily swap `src/main.tsx` to render `AppLayout` wrapped in `AppProvider` wrapped in a stub `AppContext.Provider` with mock data, matching the pattern from `RewardStore.test.tsx`'s `mockContextValue`), OR — preferred, since real env vars should be available per the parent plan's prerequisite — run `npm run dev` against the real app, log in, and confirm:
1. "Rewards" appears in both the desktop top nav and the mobile bottom tab bar.
2. Clicking it renders the `RewardStore` component with no console errors.
3. A child-role user can also see and click "Rewards" (not gated like Finance/Health).

- [ ] **Step 7: Commit**

```bash
git add src/components/AppLayout.tsx
git commit -m "feat(rewards): add Rewards to main navigation"
```

---

## Self-Review Notes

- **Spec coverage:** point-awarding on task completion (Task 2), hardcoded reward catalog (Task 1), redeem-request + parent-approval flow (Tasks 3-4), redemption history (Task 4), new top-level nav placement visible to all roles (Task 5) — all covered.
- **No new DB schema** — confirmed throughout, uses existing `KEYS`/`saveJSON` sync layer.
- **Known limitation, not fixed by this plan:** the `family_data` Supabase table's write-side RLS policy could not be confirmed from the migrations in this repo (only a `select` policy was found tracked in `supabase/migrations/`). This means, same as every other `KEYS`-based feature (tasks, promises, emotions), a technically-savvy household member could potentially write directly to their own points balance via the browser console/API, bypassing the UI. This is a pre-existing, app-wide pattern, not something newly introduced by this plan — flagged here rather than silently shipped. A proper fix (moving point balances to a server-validated column with RLS-enforced update rules, similar to the original `bear-house-os` Firestore rules bounding `pointsValue` to 0-1000) is out of scope and should be a follow-up if this is a real concern before wider rollout.
