# Member Preferences Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each household member an editable preferences profile (food, hobbies, entertainment, non-medical health notes) that feeds MealPlanner's AI recipe suggestions and HermesChat's system prompt.

**Architecture:** One `family_data` key per member (`familyos_preferences_<memberId>`), read/written via this app's existing client-side `loadJSON`/`saveJSON` pattern (localStorage + async Supabase push through `api/data-write.ts` — **not** the server-only `dbGet`/`dbSet` in `api/_db.ts`, which only edge functions can import). A new `MemberProfileModal.tsx` component provides the editing UI, opened from an edit affordance added to `Dashboard.tsx`'s roster cards.

**Tech Stack:** React/TypeScript client-side only for this plan — no new API routes, no new Supabase tables/columns (reuses the existing `family_data` table exactly as `familyos_meals`/`familyos_shopping` already do).

## Global Constraints

- Client-side reads/writes of `familyos_preferences_<memberId>` MUST use `loadJSON`/`saveJSON` from `src/lib/familyos.ts` — never `dbGet`/`dbSet` from `api/_db.ts` (server-only, importing it into `src/` would either fail the build or leak the service_role key).
- `QualityTime.tsx`'s existing free-text `interests` field, its edit UI, and its storage (`KEYS.pillars` / `'four_pillars'`) are untouched — preferences data is additive, read from a separate key.
- Any member can view any profile; edit controls are interactive only when `currentUser.id === memberId || isAdmin(currentRole)` — reuse the existing `isAdmin` helper from `src/lib/familyos.ts`.
- No new test framework — this repo already has Vitest (`vitest.config.ts`, `api/_db.test.ts` as the reference example). Add `.test.ts` files under `src/lib/` for pure logic, matching that existing setup.
- Follow the file-naming and code style already established: `src/components/familyos/*.tsx` for components, functions/constants exported from `src/lib/familyos.ts` for shared logic.

---

### Task 1: Preferences data model, option constants, and prompt-fragment builder

**Files:**
- Modify: `src/lib/familyos.ts`
- Test: `src/lib/familyos.preferences.test.ts`

**Interfaces:**
- Produces: `MemberPreferences` type, `FOOD_LIKES_OPTIONS`, `FOOD_DISLIKES_OPTIONS`, `FOOD_ALLERGY_OPTIONS`, `FOOD_DIET_OPTIONS`, `HOBBY_OPTIONS`, `ENTERTAINMENT_OPTIONS`, `HEALTH_NOTE_OPTIONS` (all `string[]` constants), `preferencesKey(memberId: string): string`, `loadMemberPreferences(memberId: string): MemberPreferences`, `emptyMemberPreferences(memberId: string): MemberPreferences`, `buildFoodPreferencePrompt(prefs: MemberPreferences): string`, `buildHobbyPromptFragment(prefs: MemberPreferences): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/familyos.preferences.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  emptyMemberPreferences,
  buildFoodPreferencePrompt,
  buildHobbyPromptFragment,
  preferencesKey,
  type MemberPreferences,
} from './familyos';

describe('preferencesKey', () => {
  it('namespaces the family_data key by member id', () => {
    expect(preferencesKey('abc-123')).toBe('familyos_preferences_abc-123');
  });
});

describe('emptyMemberPreferences', () => {
  it('returns a fully-initialized empty profile for a given member', () => {
    const prefs = emptyMemberPreferences('member-1');
    expect(prefs.memberId).toBe('member-1');
    expect(prefs.food.likes).toEqual([]);
    expect(prefs.food.dislikes).toEqual([]);
    expect(prefs.food.allergies).toEqual([]);
    expect(prefs.food.diet).toEqual([]);
    expect(prefs.food.otherNotes).toBe('');
    expect(prefs.hobbies.selected).toEqual([]);
    expect(prefs.entertainment.selected).toEqual([]);
    expect(prefs.healthNotes.selected).toEqual([]);
  });
});

describe('buildFoodPreferencePrompt', () => {
  it('returns an empty string when no food preferences are set', () => {
    const prefs = emptyMemberPreferences('m1');
    expect(buildFoodPreferencePrompt(prefs)).toBe('');
  });

  it('includes dislikes, allergies, diet, and likes when set', () => {
    const prefs: MemberPreferences = {
      ...emptyMemberPreferences('m1'),
      food: {
        likes: ['Sweet'],
        dislikes: ['Mushrooms', 'Cilantro'],
        allergies: ['Peanuts'],
        diet: ['Vegetarian'],
        otherNotes: 'No red food dye',
      },
    };
    const prompt = buildFoodPreferencePrompt(prefs);
    expect(prompt).toContain('Vegetarian');
    expect(prompt).toContain('Peanuts');
    expect(prompt).toContain('Mushrooms');
    expect(prompt).toContain('Cilantro');
    expect(prompt).toContain('Sweet');
    expect(prompt).toContain('No red food dye');
  });

  it('omits empty categories rather than printing empty lists', () => {
    const prefs: MemberPreferences = {
      ...emptyMemberPreferences('m1'),
      food: { likes: [], dislikes: ['Seafood'], allergies: [], diet: [], otherNotes: '' },
    };
    const prompt = buildFoodPreferencePrompt(prefs);
    expect(prompt).toContain('Seafood');
    expect(prompt).not.toMatch(/Diet:/);
    expect(prompt).not.toMatch(/Allergies:/);
    expect(prompt).not.toMatch(/Likes:/);
  });
});

describe('buildHobbyPromptFragment', () => {
  it('returns an empty string when no hobbies are selected', () => {
    const prefs = emptyMemberPreferences('m1');
    expect(buildHobbyPromptFragment(prefs)).toBe('');
  });

  it('lists selected hobbies when present', () => {
    const prefs: MemberPreferences = {
      ...emptyMemberPreferences('m1'),
      hobbies: { selected: ['Gaming', 'Reading'], otherNotes: '' },
    };
    const fragment = buildHobbyPromptFragment(prefs);
    expect(fragment).toContain('Gaming');
    expect(fragment).toContain('Reading');
  });

  it('includes otherNotes hobbies text when set, even with no checked options', () => {
    const prefs: MemberPreferences = {
      ...emptyMemberPreferences('m1'),
      hobbies: { selected: [], otherNotes: 'competitive chess' },
    };
    expect(buildHobbyPromptFragment(prefs)).toContain('competitive chess');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/familyos.preferences.test.ts`
Expected: FAIL — `emptyMemberPreferences`, `buildFoodPreferencePrompt`, `buildHobbyPromptFragment`, `preferencesKey` are not exported from `./familyos`.

- [ ] **Step 3: Add the types, option constants, and functions to `src/lib/familyos.ts`**

Add near the other `KEYS`/constant exports (after the `KEYS` object, before the storage helpers section):

```ts
// ── Member Preferences ───────────────────────────────────────────────────────

export const FOOD_LIKES_OPTIONS = [
  'Sweet', 'Spicy', 'Savory', 'Cheesy', 'Crunchy', 'Seafood', 'Grilled',
  'Fresh vegetables', 'Bread/carbs', 'Fruit',
];
export const FOOD_DISLIKES_OPTIONS = [
  'Mushrooms', 'Cilantro', 'Seafood', 'Spicy food', 'Very sweet',
  'Mixed textures', 'Onions', 'Tomatoes', 'Mayo', 'Coconut',
];
export const FOOD_ALLERGY_OPTIONS = [
  'Peanuts', 'Tree nuts', 'Shellfish', 'Dairy', 'Eggs', 'Gluten', 'Soy',
];
export const FOOD_DIET_OPTIONS = [
  'Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free',
  'Low-carb', 'Halal', 'Kosher',
];
export const HOBBY_OPTIONS = [
  'Sports', 'Soccer', 'Basketball', 'Gaming', 'Reading', 'Art/drawing',
  'Playing an instrument', 'Outdoors/hiking', 'Cooking', 'Crafts',
  'Board games',
];
export const ENTERTAINMENT_OPTIONS = [
  'Pop', 'Rock', 'Hip-hop', 'Country', 'Classical', 'Metal',
  'Comedy shows', 'Action movies', 'Animated shows', 'Documentaries',
];
export const HEALTH_NOTE_OPTIONS = [
  'Prefers low-sugar', 'Sensitive to spicy food', 'Easily overstimulated',
  'Prefers quiet activities', 'Needs frequent breaks',
];

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

export function preferencesKey(memberId: string): string {
  return `familyos_preferences_${memberId}`;
}

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

export function loadMemberPreferences(memberId: string): MemberPreferences {
  return loadJSON<MemberPreferences>(preferencesKey(memberId), emptyMemberPreferences(memberId));
}

export function buildFoodPreferencePrompt(prefs: MemberPreferences): string {
  const parts: string[] = [];
  if (prefs.food.diet.length) parts.push(`Diet: ${prefs.food.diet.join(', ')}`);
  if (prefs.food.allergies.length) parts.push(`Allergies (must avoid): ${prefs.food.allergies.join(', ')}`);
  if (prefs.food.dislikes.length) parts.push(`Dislikes: ${prefs.food.dislikes.join(', ')}`);
  if (prefs.food.likes.length) parts.push(`Likes: ${prefs.food.likes.join(', ')}`);
  if (prefs.food.otherNotes.trim()) parts.push(prefs.food.otherNotes.trim());
  return parts.join('. ');
}

export function buildHobbyPromptFragment(prefs: MemberPreferences): string {
  const parts: string[] = [];
  if (prefs.hobbies.selected.length) parts.push(prefs.hobbies.selected.join(', '));
  if (prefs.hobbies.otherNotes.trim()) parts.push(prefs.hobbies.otherNotes.trim());
  return parts.join(', ');
}
```

Note: `loadJSON` is already defined further down in this same file — since
`loadMemberPreferences` calls it, place these additions *before* the
`// Storage helpers` section's `loadJSON` definition, or move
`loadMemberPreferences` itself below `loadJSON`'s definition (function
declarations are hoisted for `function` syntax, but this file mixes
`function` and arrow-function exports — place `loadMemberPreferences`
textually after `loadJSON` to avoid relying on hoisting).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/familyos.preferences.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Run the full test suite and build to confirm nothing else broke**

Run: `npx vitest run && npx vite build`
Expected: all existing tests still pass; build succeeds with the same pre-existing chunk-size warning as before, no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/familyos.ts src/lib/familyos.preferences.test.ts
git commit -m "feat(preferences): add MemberPreferences data model and prompt builders

Option constants for food/hobbies/entertainment/health-note checkboxes,
loadMemberPreferences() following this app's existing loadJSON pattern
(family_data key per member, not a new Supabase table), and pure
prompt-fragment builders for MealPlanner/HermesChat integration."
```

---

### Task 2: `MemberProfileModal` component

**Files:**
- Create: `src/components/familyos/MemberProfileModal.tsx`

**Interfaces:**
- Consumes: `MemberPreferences`, `loadMemberPreferences`, `preferencesKey`, `saveJSON`, `FOOD_LIKES_OPTIONS`/`FOOD_DISLIKES_OPTIONS`/`FOOD_ALLERGY_OPTIONS`/`FOOD_DIET_OPTIONS`/`HOBBY_OPTIONS`/`ENTERTAINMENT_OPTIONS`/`HEALTH_NOTE_OPTIONS` (Task 1), `useAppContext()` for `currentUser`/`currentRole`/`householdMembers`, `isAdmin` (existing, `src/lib/familyos.ts`).
- Produces: `<MemberProfileModal memberId={string} onClose={() => void} />` default export.

- [ ] **Step 1: Write the component**

```tsx
import React, { useState } from 'react';
import { X, Utensils, Music2, Gamepad2, HeartPulse, Save } from 'lucide-react';
import {
  loadMemberPreferences, preferencesKey, saveJSON, isAdmin,
  FOOD_LIKES_OPTIONS, FOOD_DISLIKES_OPTIONS, FOOD_ALLERGY_OPTIONS, FOOD_DIET_OPTIONS,
  HOBBY_OPTIONS, ENTERTAINMENT_OPTIONS, HEALTH_NOTE_OPTIONS,
  type MemberPreferences,
} from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

interface Props {
  memberId: string;
  onClose: () => void;
}

type Section = 'food' | 'hobbies' | 'entertainment' | 'health';

function CheckboxGrid({ options, selected, onToggle, disabled }: {
  options: string[]; selected: string[]; onToggle: (opt: string) => void; disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const checked = selected.includes(opt);
        return (
          <label
            key={opt}
            className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer transition ${
              checked ? 'bg-indigo-900/40 border-indigo-500/50 text-indigo-200' : 'bg-slate-900 border-slate-700 text-slate-300'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-slate-500'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(opt)}
              className="accent-indigo-500"
            />
            {opt}
          </label>
        );
      })}
    </div>
  );
}

const MemberProfileModal: React.FC<Props> = ({ memberId, onClose }) => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const member = householdMembers.find((m) => m.id === memberId);
  const canEdit = !!currentUser && (currentUser.id === memberId || (currentRole && isAdmin(currentRole)));

  const [prefs, setPrefs] = useState<MemberPreferences>(() => loadMemberPreferences(memberId));
  const [section, setSection] = useState<Section>('food');
  const [saved, setSaved] = useState(false);

  const toggle = (category: 'food' | 'hobbies' | 'entertainment' | 'healthNotes', field: string, opt: string) => {
    setPrefs((prev) => {
      const list: string[] = (prev as any)[category][field];
      const next = list.includes(opt) ? list.filter((o) => o !== opt) : [...list, opt];
      return { ...prev, [category]: { ...(prev as any)[category], [field]: next } };
    });
  };

  const setOtherNotes = (category: 'food' | 'hobbies' | 'entertainment' | 'healthNotes', value: string) => {
    setPrefs((prev) => ({ ...prev, [category]: { ...(prev as any)[category], otherNotes: value } }));
  };

  const save = () => {
    saveJSON(preferencesKey(memberId), { ...prefs, updatedAt: Date.now() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const SECTIONS: { id: Section; label: string; icon: typeof Utensils }[] = [
    { id: 'food', label: 'Food', icon: Utensils },
    { id: 'hobbies', label: 'Hobbies', icon: Gamepad2 },
    { id: 'entertainment', label: 'Entertainment', icon: Music2 },
    { id: 'health', label: 'Health Notes', icon: HeartPulse },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl max-w-2xl w-full mx-auto my-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-white">{member?.name || 'Member'}'s Preferences</h2>
            {!canEdit && <p className="text-xs text-slate-500 mt-0.5">View only</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 p-4 border-b border-slate-700 overflow-x-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                section === s.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </button>
          ))}
        </div>

        <div className="p-6 max-h-[55vh] overflow-y-auto space-y-4">
          {section === 'food' && (
            <>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Diet</div>
                <CheckboxGrid options={FOOD_DIET_OPTIONS} selected={prefs.food.diet} disabled={!canEdit}
                  onToggle={(o) => toggle('food', 'diet', o)} />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Allergies</div>
                <CheckboxGrid options={FOOD_ALLERGY_OPTIONS} selected={prefs.food.allergies} disabled={!canEdit}
                  onToggle={(o) => toggle('food', 'allergies', o)} />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Dislikes</div>
                <CheckboxGrid options={FOOD_DISLIKES_OPTIONS} selected={prefs.food.dislikes} disabled={!canEdit}
                  onToggle={(o) => toggle('food', 'dislikes', o)} />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Likes</div>
                <CheckboxGrid options={FOOD_LIKES_OPTIONS} selected={prefs.food.likes} disabled={!canEdit}
                  onToggle={(o) => toggle('food', 'likes', o)} />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Other</div>
                <input
                  value={prefs.food.otherNotes}
                  onChange={(e) => setOtherNotes('food', e.target.value)}
                  disabled={!canEdit}
                  placeholder="Anything else about food preferences…"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-60"
                />
              </div>
            </>
          )}

          {section === 'hobbies' && (
            <>
              <CheckboxGrid options={HOBBY_OPTIONS} selected={prefs.hobbies.selected} disabled={!canEdit}
                onToggle={(o) => toggle('hobbies', 'selected', o)} />
              <input
                value={prefs.hobbies.otherNotes}
                onChange={(e) => setOtherNotes('hobbies', e.target.value)}
                disabled={!canEdit}
                placeholder="Other hobbies…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-60"
              />
            </>
          )}

          {section === 'entertainment' && (
            <>
              <CheckboxGrid options={ENTERTAINMENT_OPTIONS} selected={prefs.entertainment.selected} disabled={!canEdit}
                onToggle={(o) => toggle('entertainment', 'selected', o)} />
              <input
                value={prefs.entertainment.otherNotes}
                onChange={(e) => setOtherNotes('entertainment', e.target.value)}
                disabled={!canEdit}
                placeholder="Other favorites…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-60"
              />
            </>
          )}

          {section === 'health' && (
            <>
              <CheckboxGrid options={HEALTH_NOTE_OPTIONS} selected={prefs.healthNotes.selected} disabled={!canEdit}
                onToggle={(o) => toggle('healthNotes', 'selected', o)} />
              <input
                value={prefs.healthNotes.otherNotes}
                onChange={(e) => setOtherNotes('healthNotes', e.target.value)}
                disabled={!canEdit}
                placeholder="Other notes…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-60"
              />
            </>
          )}
        </div>

        {canEdit && (
          <div className="p-6 border-t border-slate-700 flex items-center gap-3">
            <button
              onClick={save}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              <Save className="w-4 h-4" /> Save
            </button>
            {saved && <span className="text-emerald-400 text-sm">Saved</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberProfileModal;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors from `MemberProfileModal.tsx`.

- [ ] **Step 3: Build**

Run: `npx vite build`
Expected: succeeds — the new component isn't imported anywhere yet, so this only confirms it compiles in isolation.

- [ ] **Step 4: Commit**

```bash
git add src/components/familyos/MemberProfileModal.tsx
git commit -m "feat(preferences): add MemberProfileModal component

Tabbed checkbox UI (food/hobbies/entertainment/health notes) over the
MemberPreferences model from familyos.ts. View-only unless the viewer
is the profile owner or a household admin, matching this app's
existing isAdmin() permission pattern."
```

---

### Task 3: Wire the "Edit Profile" entry point into Dashboard

**Files:**
- Modify: `src/components/familyos/Dashboard.tsx`

**Interfaces:**
- Consumes: `MemberProfileModal` (Task 2), `householdMembers` (existing, from `useAppContext()`).

- [ ] **Step 1: Read the current `personCard` call site**

`Dashboard.tsx` currently calls `personCard(m.name, m.color)` inside a `.map()` over `householdMembers`. The function only receives `name`/`color`, not `id` — it needs the id to open the right profile.

- [ ] **Step 2: Add modal state and an edit affordance**

In `Dashboard.tsx`, add to the imports:

```tsx
import { UserCog } from 'lucide-react';
import MemberProfileModal from './MemberProfileModal';
```

Add state near the existing `modal` state declaration:

```tsx
const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
```

Change `personCard`'s signature and body to accept and use `id`:

```tsx
const personCard = (id: string, name: string, color: string) => {
    const open = promises.filter((p) => !p.completed && p.person === name).length;
    const pillar = pillars.find((p) => p.name === name);
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = emotions.filter((e) => e.person === name && e.createdAt > weekAgo);
    const avg = recent.length ? (recent.reduce((s, e) => s + e.intensity, 0) / recent.length).toFixed(1) : '—';
    const overdueT = tasks.filter((t) => !t.completed && t.person === name && isOverdue(t)).length;
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
      </div>
    );
  };
```

Update the call site (`householdMembers.map((m) => (<React.Fragment key={m.id}>{personCard(m.name, m.color)}</React.Fragment>))`) to pass `m.id`:

```tsx
{householdMembers.map((m) => (
  <React.Fragment key={m.id}>{personCard(m.id, m.name, m.color)}</React.Fragment>
))}
```

Add the modal render, near the component's other modals (e.g. right before or after the existing `<AlertModal ... />` render):

```tsx
{profileMemberId && (
  <MemberProfileModal memberId={profileMemberId} onClose={() => setProfileMemberId(null)} />
)}
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npx vite build`
Expected: no new errors; build succeeds.

- [ ] **Step 4: Manual verification**

1. Start the dev server (`npm run dev`), sign in, go to the Dashboard tab.
2. Hover over a person card — confirm the small edit icon appears top-right.
3. Click it — confirm `MemberProfileModal` opens showing that member's name in the header.
4. Check a few checkboxes across different section tabs (Food, Hobbies, Entertainment, Health Notes), type something in an "Other" field, click Save — confirm the "Saved" confirmation text appears.
5. Close and reopen the modal for the same member — confirm the previously-checked boxes and typed text persisted (proves `loadMemberPreferences`/`saveJSON` round-trip correctly).
6. Open the modal for a different member (as a non-admin, if your test account is a child role) — confirm the checkboxes are disabled and no Save button renders.

- [ ] **Step 5: Commit**

```bash
git add src/components/familyos/Dashboard.tsx
git commit -m "feat(preferences): add Edit Profile entry point to Dashboard roster cards

personCard() now takes the member id and shows a hover-reveal edit
icon that opens MemberProfileModal, matching this app's existing
hover-reveal action pattern (HistoryModal's restore button, etc.)."
```

---

### Task 4: Feed food preferences into MealPlanner's AI recipe-suggestion prompt

**Files:**
- Modify: `src/components/familyos/sections/MealPlanner.tsx`

**Interfaces:**
- Consumes: `loadMemberPreferences`, `buildFoodPreferencePrompt` (Task 1), `useAppContext()`'s `householdMembers` (existing).

- [ ] **Step 1: Read the current `fetchSuggestion` signature**

`fetchSuggestion(day: Day, meal: MealType, cook: string, profiles: Record<string, CookProfile>): Promise<Recipe | null>` builds an AI prompt using `profile.skill`/`profile.ageGroup`/`profile.note`. It's called from `handleSuggest` inside the component, where `cook` is the plan's assigned cook name for that slot.

- [ ] **Step 2: Resolve the cook's memberId and add a food-preference line to the prompt**

`fetchSuggestion` currently only has the cook's *name* (string), not their member id — preferences are keyed by id. Add a `householdMembers` lookup inside the component (where `cookProfiles` is already built) and pass the resolved preference prompt fragment down.

In `MealPlanner.tsx`, find where `cookProfiles` is computed (inside the component body, via `useMemo` per this session's earlier roster-fix work) and add alongside it:

```tsx
const foodPreferenceByCook = React.useMemo(() => {
  const map: Record<string, string> = {};
  householdMembers.forEach((m) => {
    const prefs = loadMemberPreferences(m.id);
    const fragment = buildFoodPreferencePrompt(prefs);
    if (fragment) map[m.name] = fragment;
  });
  return map;
}, [householdMembers]);
```

Add the import:

```tsx
import { loadJSON, saveJSON, uid, KEYS, loadMemberPreferences, buildFoodPreferencePrompt } from '@/lib/familyos';
```

(This replaces the existing `import { loadJSON, saveJSON, uid, KEYS } from '@/lib/familyos';` line — add the two new names to the same import.)

- [ ] **Step 3: Pass the fragment into `fetchSuggestion` and its prompt**

Change `fetchSuggestion`'s signature to accept an optional preference string:

```ts
async function fetchSuggestion(day: Day, meal: MealType, cook: string, profiles: Record<string, CookProfile>, foodPreference?: string): Promise<Recipe | null> {
```

In the prompt string built inside `fetchSuggestion` (the template literal passed to `callAI`/`fetch('/api/chat', ...)`), add one line right after the existing profile-note line:

```ts
  const prompt = `Suggest one ${meal.toLowerCase()} meal for ${day}.
Cook: ${cook} | Skill: ${profile.skill} | Age group: ${profile.ageGroup}
Profile note: ${profile.note}${foodPreference ? `\nFood preferences for the household member eating this meal: ${foodPreference}` : ''}

Return ONLY valid JSON (no markdown):
```

(Exact surrounding prompt text stays as it already is in this file — this only inserts the one new conditional line.)

- [ ] **Step 4: Update the call site**

Find `handleSuggest`'s call `fetchSuggestion(day, meal, cook, cookProfiles)` and change it to:

```tsx
fetchSuggestion(day, meal, cook, cookProfiles, foodPreferenceByCook[cook])
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npx vite build`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

1. In the running app, open a member's profile (Task 3's entry point) and check a few Food dislikes/allergies, save.
2. Go to Meal Planner, assign that member as the cook for a day/meal slot, click the AI suggest button for that slot.
3. Confirm (by inspecting the network request body in devtools, or by observing the suggested recipe avoiding the disliked ingredients) that the preference text is present in the outgoing `/api/chat` request's `prompt` field.

- [ ] **Step 7: Commit**

```bash
git add src/components/familyos/sections/MealPlanner.tsx
git commit -m "feat(preferences): feed food preferences into MealPlanner's AI prompt

fetchSuggestion() now includes the assigned cook's saved food
preferences (dislikes, allergies, diet, likes) when generating a
recipe suggestion, read fresh via loadMemberPreferences() at
suggestion time rather than cached."
```

---

### Task 5: Feed hobbies into HermesChat's system prompt

**Files:**
- Modify: `src/components/familyos/HermesChat.tsx`

**Interfaces:**
- Consumes: `loadMemberPreferences`, `buildHobbyPromptFragment` (Task 1).

- [ ] **Step 1: Read the current `buildSystemPrompt` function**

`buildSystemPrompt(householdMembers: {name,role}[], currentUserName: string | undefined)` builds a `familyLine` from `householdMembers.map((m) => \`${m.name} (${m.role})\`)`. It does not currently have access to member `id`, only `name`/`role` (per this session's earlier roster-hardcoding fix).

- [ ] **Step 2: Widen the `householdMembers` param to include `id`, and add a hobbies line**

Change `buildSystemPrompt`'s signature:

```ts
function buildSystemPrompt(householdMembers: { id: string; name: string; role: string }[], currentUserName: string | undefined): string {
```

Inside the function, after the existing `familyLine` construction, add:

```ts
  const hobbyLines = householdMembers
    .map((m) => {
      const prefs = loadMemberPreferences(m.id);
      const fragment = buildHobbyPromptFragment(prefs);
      return fragment ? `${m.name} enjoys: ${fragment}.` : null;
    })
    .filter(Boolean)
    .join(' ');
```

Add `${hobbyLines ? `\n${hobbyLines}` : ''}` to the returned prompt template, immediately after the existing `Family: ${familyLine}.` line.

Add the import at the top of the file:

```tsx
import { loadMemberPreferences, buildHobbyPromptFragment } from '@/lib/familyos';
```

- [ ] **Step 3: Update `callHermes`'s call site**

`callHermes(history, householdMembers, currentUserName)` passes `householdMembers` straight through to `buildSystemPrompt` — since `useAppContext()`'s `householdMembers` already includes `id` (it's typed as `User[]` from `src/lib/familyos.ts`, which has `id: string`), no call-site change is needed beyond confirming the type flows through — update `callHermes`'s own type annotation if it currently narrows to `{name, role}[]` instead of accepting `id` too:

```ts
async function callHermes(history: { role: string; content: string }[], householdMembers: { id: string; name: string; role: string }[], currentUserName: string | undefined): Promise<HermesResponse> {
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npx vite build`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

1. Set hobbies on your own profile via the Task 3 entry point, save.
2. Open HermesChat, ask something generic like "what should we do this weekend?"
3. Confirm (via devtools network inspection of the `/api/chat` request body, or by the response referencing your hobbies) the hobby line is present in the system prompt.

- [ ] **Step 6: Commit**

```bash
git add src/components/familyos/HermesChat.tsx
git commit -m "feat(preferences): feed hobbies into HermesChat's system prompt

buildSystemPrompt() now includes a per-member hobby line when set,
read via loadMemberPreferences(). Omitted entirely for members with
no hobbies selected to avoid prompt bloat for unfilled profiles."
```

---

### Task 6: Feed hobbies into QualityTime's AI activity-suggestion prompt (additive)

**Files:**
- Modify: `src/components/familyos/QualityTime.tsx`

**Interfaces:**
- Consumes: `loadMemberPreferences`, `buildHobbyPromptFragment` (Task 1).

- [ ] **Step 1: Read the current `aiSuggest` prompt**

`aiSuggest()` builds `summary` as `pillars.map((p) => \`${p.name}: last ${relativeDate(p.lastQualityTime)}, interests: ${p.interests}\`).join('\n')` — this uses `p.interests`, the existing free-text field on the `Pillar` type. This step is additive only — do not modify `p.interests`, its storage, or its edit UI anywhere in this file.

- [ ] **Step 2: Append structured hobbies keyed by the pillar's own id**

`Pillar.id` (defined in this file, `interface Pillar { id: string; ... }`) already equals the household member's id directly for real members — `householdPillars()` in `src/lib/familyos.ts` builds each pillar as `{ id: m.id, name: m.name, ... }`. The one exception is the synthetic `'home'` pillar (`{ id: 'home', name: 'Home & Shared', ... }`), which has no matching household member — `loadMemberPreferences('home')` would just return an empty profile via `emptyMemberPreferences`, which is harmless (produces an empty hobby fragment, adds nothing to the prompt), so no special-casing is needed.

Change the `summary` construction in `aiSuggest()`:

```tsx
const summary = pillars.map((p) => {
  const hobbyFragment = buildHobbyPromptFragment(loadMemberPreferences(p.id));
  return `${p.name}: last ${relativeDate(p.lastQualityTime)}, interests: ${p.interests}${hobbyFragment ? `, structured hobbies: ${hobbyFragment}` : ''}`;
}).join('\n');
```

Add the import:

```tsx
import { loadMemberPreferences, buildHobbyPromptFragment } from '@/lib/familyos';
```

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npx vite build`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

1. Confirm the existing free-text "interests" field in QualityTime's UI still displays and saves exactly as before (regression check — this task must not change that behavior).
2. Set structured hobbies via the profile modal for a pillar's member, save.
3. Click "Ask Hermes"/AI-suggest in QualityTime, confirm (via devtools) the outgoing prompt includes both the existing free-text interests line and the new "structured hobbies" addition.

- [ ] **Step 5: Commit**

```bash
git add src/components/familyos/QualityTime.tsx
git commit -m "feat(preferences): additively include structured hobbies in QualityTime's AI prompt

aiSuggest()'s prompt now appends structured hobby data alongside the
existing free-text interests field — interests itself, its storage,
and its edit UI are completely unchanged, per explicit design
decision to keep the two data sources separate."
```

---

## Self-Review Notes

- **Spec coverage:** Goal 1 (entry point) → Task 3. Goal 2 (four categories, fixed checklist + other) → Tasks 1–2. Goal 3 (MealPlanner food filtering) → Task 4. Goal 4 (HermesChat + QualityTime hobbies, additive) → Tasks 5–6. Goal 5 (self/admin edit permission) → Task 2's `canEdit` logic.
- **Non-goals respected:** No HealthHub changes (health notes are a separate `family_data` key, `HEALTH_NOTE_OPTIONS` deliberately non-clinical). No entertainment-data consumer added (Task 1 stores it, nothing reads it yet, per spec's explicit non-goal). No second admin entry point beyond the roster click target.
- **Architecture correction from the spec:** the approved spec referenced `dbGet`/`dbSet` for reads — those are server-only (`api/_db.ts`, service_role key, not importable from `src/`). This plan uses `loadJSON`/`saveJSON` throughout instead, matching every other client-side feature in this codebase (`familyos_meals`, `familyos_shopping`, etc.). Same `family_data` table underneath, correct access path on top.
- **Type consistency:** `MemberPreferences`, `preferencesKey`, `loadMemberPreferences`, `buildFoodPreferencePrompt`, `buildHobbyPromptFragment` are defined once in Task 1 and used with identical names/signatures in every later task — no renaming drift.
