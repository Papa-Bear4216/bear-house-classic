# Member Preferences Profile — Design Spec

Date: 2026-07-20

## Problem

Household members have no structured way to record likes/dislikes,
hobbies, entertainment tastes, or non-medical health notes. The one thing
close to this today — `QualityTime.tsx`'s per-pillar `interests` free-text
field — is single-purpose (feeds one AI prompt) and unstructured, so
nothing else in the app can reliably filter or personalize against it.
Most notably, `MealPlanner.tsx`'s AI recipe suggestions have no way to know
a household member dislikes mushrooms or is vegetarian.

## Goals

1. Each household member gets an editable **preferences profile**, opened
   via a new "Edit Profile" action wherever their name/avatar already
   appears in the roster (Dashboard's `personCard`, Settings' Family tab).
2. Four preference categories for v1, each a fixed checklist plus an
   "other" free-text field: **Food** (likes/dislikes/allergies/diet),
   **Hobbies & interests**, **Music & entertainment**, **Health notes
   (non-medical)**.
3. Food preferences actually filter `MealPlanner.tsx`'s AI recipe-
   suggestion prompt (skip dislikes, respect allergies/diet).
4. Hobbies/interests feed `HermesChat.tsx`'s system prompt and
   `QualityTime.tsx`'s AI activity-suggestion prompt, **additively** —
   `QualityTime`'s existing free-text `interests` field is untouched, kept
   as a separate data source, not replaced.
5. Any member can edit their own profile; superadmin/admin can edit
   anyone's (mirrors the existing role pattern already used throughout
   this app, e.g. `SettingsModal`'s Family tab, `canDelete`/`isAdmin`
   helpers in `src/lib/familyos.ts`).

## Non-goals

- Real medical/allergy data as a system of record — "Health notes" here is
  explicitly **non-medical** (e.g. "prefers low-sugar snacks," "sensitive
  to spicy food"); anything clinical belongs in `HealthHub.tsx`, untouched
  by this spec.
- Replacing or migrating `QualityTime.tsx`'s existing `interests` field —
  explicitly kept separate per decision above.
- Music/entertainment feeding any AI prompt yet — v1 records this data for
  display and future use; no feature consumes it this pass (nothing in the
  app currently does anything with music taste, so there's nothing to wire
  it into without inventing a feature that wasn't asked for).
- A picker for admins to browse "whose profile am I viewing" from inside
  Settings — access is via the roster click target only (Goal 1), not a
  second entry point.

## Data model

Same convention as the pantry spec — a `family_data` key, this time keyed
per-member rather than one shared blob, so each member's profile can be
read/written independently without a read-modify-write race when two
members edit their own profiles at the same time:

```ts
// family_data key: `familyos_preferences_${memberId}`
interface MemberPreferences {
  memberId: string;
  food: {
    likes: string[];        // from FOOD_LIKES_OPTIONS
    dislikes: string[];     // from FOOD_DISLIKES_OPTIONS
    allergies: string[];    // from FOOD_ALLERGY_OPTIONS
    diet: string[];         // from FOOD_DIET_OPTIONS (vegetarian, vegan, gluten-free, etc.)
    otherNotes: string;
  };
  hobbies: {
    selected: string[];     // from HOBBY_OPTIONS
    otherNotes: string;
  };
  entertainment: {
    selected: string[];     // from ENTERTAINMENT_OPTIONS
    otherNotes: string;
  };
  healthNotes: {
    selected: string[];     // from HEALTH_NOTE_OPTIONS
    otherNotes: string;
  };
  updatedAt: number;
}
```

Option lists live as constants in `src/lib/familyos.ts` (same place
`PRIORITIES`/`TASK_CATEGORIES`/etc. already live), each ~10-15 common
items per category:

- `FOOD_LIKES_OPTIONS` / `FOOD_DISLIKES_OPTIONS`: common ingredients/flavor
  profiles (spicy, seafood, mushrooms, cilantro, dairy-heavy, sweet, etc.)
- `FOOD_ALLERGY_OPTIONS`: peanuts, tree nuts, shellfish, dairy, eggs,
  gluten, soy — the common real-world allergen list
- `FOOD_DIET_OPTIONS`: vegetarian, vegan, pescatarian, gluten-free,
  dairy-free, low-carb, halal, kosher
- `HOBBY_OPTIONS`: sports (generic + a few specifics like soccer/
  basketball), gaming, reading, art/drawing, music (playing an
  instrument), outdoors/hiking, cooking, crafts, board games
- `ENTERTAINMENT_OPTIONS`: music genres (pop, rock, hip-hop, country,
  classical, metal, etc.) and a separate small list for shows/movies
  genres (comedy, action, animated, documentary)
- `HEALTH_NOTE_OPTIONS`: prefers low-sugar, sensitive to spicy food, easily
  overstimulated, prefers quiet activities, needs frequent breaks — a
  short, deliberately non-clinical list

Exact final option lists are drafted during implementation planning
(reasonable starting lists, not something requiring further design
back-and-forth) — the schema and category boundaries above are the part
that needs to be locked in now.

## UI

### Entry point

`Dashboard.tsx`'s `personCard` (and any other roster-display component
that already renders a member's name/avatar clickably or could easily
become so) gets an "Edit Profile" affordance — a small pencil/edit icon on
hover, matching this app's existing hover-reveal action pattern (e.g.
`HistoryModal.tsx`'s restore button, `HomeMaintenance.tsx`'s delete
button). Clicking opens the new profile modal for that member.

### Profile modal

New `src/components/familyos/MemberProfileModal.tsx`, following the same
structural pattern as `SettingsModal.tsx` (tabbed sections, checkbox grids
matching the existing `TASK_CATEGORIES`-style multi-select UI already used
elsewhere in this app). Four sections — Food, Hobbies, Entertainment,
Health Notes — each a checkbox grid against its option list plus an
"Other" text input. A save button persists via `dbSet` (client-authenticated
path, not the webhook/service-role path — this is a logged-in user editing
their own or a household-mate's data).

**Permission**: the modal opens for anyone (view-only if not self and not
admin — matches Goal 5), edit controls (checkboxes, save button) only
interactive when `currentUser.id === memberId || isAdmin(currentRole)`.

## Integration points

### MealPlanner.tsx

`fetchSuggestion()`'s AI prompt (already being restructured per the pantry
spec to request structured ingredients) gains the assigned cook's food
preferences: "Dietary restrictions: {diet.join(', ')}. Avoid: {dislikes
+ allergies}. Prefers: {likes}." — read via `dbGet('familyos_preferences_'
+ memberId)` at suggestion time, not cached in the component, so it always
reflects the latest saved preferences.

### HermesChat.tsx

`buildSystemPrompt()` (already includes household member names/roles per
this session's earlier roster-hardcoding fix) gains one line per member
with hobbies, if any are set: `${member.name} enjoys: ${hobbies.join(', ')}.`
— omitted entirely for members with no hobbies selected, to avoid prompt
bloat for households that haven't filled this in yet.

### QualityTime.tsx

`aiSuggest()`'s existing prompt (`${p.name}: last ${relativeDate(...)},
interests: ${p.interests}`) gains a second line reading from the new
structured hobbies data, additively: `structured hobbies:
${hobbies.join(', ')}` appended when set. The existing free-text
`interests` field, its edit UI, and its storage are completely untouched.

## Error handling

- Saving with no changes / all categories empty is allowed — an empty
  profile is valid, not an error state (matches "any household member
  starts with nothing set" as the default, same as pantry starting empty).
- `dbGet` failure when building an AI prompt (network blip, etc.) is
  treated as "no preferences known" — the prompt simply omits that
  member's preferences rather than failing the whole suggestion/chat call.
  This follows the same fail-open pattern `fetchSuggestion`/`callHermes`
  already use for other optional context.

## Testing

Unit-testable pure logic: the "build the preferences prompt fragment from
a `MemberPreferences` object" function (used by both MealPlanner and
HermesChat) is a pure string-building function with no I/O — a natural
Vitest candidate, same pattern as the pantry spec's scaling-math tests.

## Open items carried into implementation planning

- Final wording/exact items for each `*_OPTIONS` constant — draft during
  planning (noted above, not a blocking design question).
- Whether `MemberProfileModal` needs its own "who can see this" privacy
  toggle (e.g. a teen not wanting a sibling to see their profile) — not
  raised as a requirement; default to the same visibility as the rest of
  the roster (any household member can view, matching how `householdMembers`
  is already broadly readable per existing RLS) unless raised during
  planning or by the user later.
