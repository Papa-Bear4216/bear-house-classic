import React, { useState, useCallback } from 'react';
import { Edit3, Check, X, ChefHat, Sparkles, Loader2, ClipboardList, ShoppingCart, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { loadJSON, saveJSON, uid, KEYS, loadMemberPreferences, buildFoodPreferencePrompt, loadPantry, savePantry, calculateShortfall, decrementPantry } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { getAccessToken } from '@/lib/householdAuth';
import { getColorCardStyle } from '@/lib/colorStyles';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'familyos_meals';
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type Day = typeof DAYS[number];
export const MEALS = ['Breakfast', 'Lunch', 'Dinner'] as const;
export type MealType = typeof MEALS[number];

interface CookProfile {
  skill: 'expert' | 'skilled' | 'intermediate' | 'beginner' | null;
  ageGroup: 'adult' | 'teen' | 'child' | 'family' | null;
  note: string;
  color: string;
}

const EXTRA_COOK_PROFILES: Record<string, CookProfile> = {
  Together: { skill: 'intermediate', ageGroup: 'family', note: 'Family cooking time — great for teaching moments.', color: 'emerald' },
  Takeout:  { skill: null,           ageGroup: null,     note: '',                                                  color: 'slate'   },
};

const SKILL_LABEL: Record<string, string> = {
  expert: '★★★★', skilled: '★★★☆', intermediate: '★★☆☆', beginner: '★☆☆☆',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecipeDetail {
  description: string;
  time: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  servings: number;
  steps: string[];
}

interface DayPlan {
  Breakfast: string;
  Lunch: string;
  Dinner: string;
  cook: string;
  cookedIngredients?: Partial<Record<MealType, { name: string; quantity: number; unit: string }[]>>;
  cookedAt?: Partial<Record<MealType, number>>;
  // Populated either by the UI's own AI-suggestion flow (fetchSuggestion) or
  // by Hermes via setMealPlanAction — whichever planned the meal. Lets the
  // recipe drawer render identically regardless of who filled it in.
  recipeDetail?: Partial<Record<MealType, RecipeDetail>>;
}
export type WeekPlan = Record<Day, DayPlan>;
const EMPTY_DAY: DayPlan = { Breakfast: '', Lunch: '', Dinner: '', cook: '' };

interface Recipe {
  name: string;
  description: string;
  time: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  servings: number;
  recipe: { ingredients: { name: string; quantity: number; unit: string }[]; steps: string[] };
}
type SuggestionKey = string; // "Monday-Dinner"

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function defaultPlan(): WeekPlan {
  const plan = {} as WeekPlan;
  DAYS.forEach(d => { plan[d] = { ...EMPTY_DAY }; });
  return plan;
}

export const MEALS_STORAGE_KEY = STORAGE_KEY;

function suggestionKey(day: Day, meal: MealType): SuggestionKey { return `${day}-${meal}`; }

export function scaleIngredients(
  ingredients: { name: string; quantity: number; unit: string }[],
  fromServings: number,
  toServings: number
): { name: string; quantity: number; unit: string }[] {
  const from = fromServings || 1;
  const factor = toServings / from;
  return ingredients.map((ing) => ({ ...ing, quantity: Math.round(ing.quantity * factor * 100) / 100 }));
}

/** Pure plan transform — stamps cookedAt for one day/meal. Does not touch
 * pantry; callers scale ingredients and decrement pantry separately before
 * calling this, exactly as the UI's markCooked handler already does. */
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

type SuggestionResult = { ok: true; recipe: Recipe } | { ok: false; error: string };

async function fetchSuggestion(day: Day, meal: MealType, cook: string, profiles: Record<string, CookProfile>, foodPreference?: string): Promise<SuggestionResult> {
  const profile = profiles[cook];
  if (!profile?.skill) return { ok: false, error: `No cooking profile found for "${cook}" — check they're still a household member.` };

  const prompt = `Suggest one ${meal.toLowerCase()} meal for ${day}.
Cook: ${cook} | Skill: ${profile.skill} | Age group: ${profile.ageGroup}
Profile note: ${profile.note}${foodPreference ? `\nFood preferences for the household member eating this meal: ${foodPreference}` : ''}

Return ONLY valid JSON (no markdown):
{
  "name": "Meal name",
  "description": "One sentence, appealing description",
  "time": "XX min",
  "difficulty": "Easy",
  "servings": 4,
  "recipe": {
    "ingredients": [{"name": "Eggs", "quantity": 2, "unit": ""}, {"name": "Flour", "quantity": 1, "unit": "cup"}],
    "steps": ["Step 1", "Step 2", "Step 3"]
  }
}

Rules:
- Match skill level strictly — beginner means ≤5 steps, minimal technique
- For teen/child cooks: low-step, hard to mess up, avoid complex timing
- Keep steps array to max 6 items
- Return ingredients as a structured array with numeric quantity and a short unit string (e.g. "cups", "lb", "" for count-only items like eggs) — not free-text lines`;

  try {
    const geminiKey = localStorage.getItem(KEYS.geminiApiKey) || '';
    if (geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 500 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (raw) {
          try {
            return { ok: true, recipe: JSON.parse(raw) as Recipe };
          } catch {
            console.warn('Gemini recipe suggestion: could not parse JSON response', raw);
            // fall through to the cloud path below rather than failing outright
          }
        }
      } else {
        console.warn(`Gemini recipe suggestion failed: ${res.status} ${res.statusText}`);
      }
    }

    const token = await getAccessToken();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ prompt, maxTokens: 500 }),
    });
    if (!res.ok) {
      const reason = res.status === 401 ? 'Session expired — try signing out and back in.' : `Server error (${res.status}).`;
      console.warn(`Meal suggestion request failed: ${res.status} ${res.statusText}`);
      return { ok: false, error: reason };
    }
    const data = await res.json();
    const raw = (data.text || '').replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    try {
      return { ok: true, recipe: JSON.parse(raw) as Recipe };
    } catch {
      console.warn('Meal suggestion: could not parse AI response as JSON', raw);
      return { ok: false, error: 'The AI response was malformed — try again.' };
    }
  } catch (e: any) {
    console.warn('Meal suggestion request threw', e);
    return { ok: false, error: 'Network error — check your connection and try again.' };
  }
}

async function suggestWholeWeek(plan: WeekPlan, profiles: Record<string, CookProfile>): Promise<Partial<Record<Day, Partial<DayPlan>>>> {
  const lines = DAYS.map(day => {
    const cook = plan[day].cook;
    const profile = cook ? profiles[cook] : null;
    return `${day}: Cook=${cook || 'unassigned'}, Skill=${profile?.skill || 'n/a'}`;
  }).join('\n');

  const prompt = `Suggest a full week of meals (Breakfast, Lunch, Dinner) for the household.

Week context:
${lines}

Match each day's meals to that day's assigned cook's skill level — beginner/teen or child cooks get simple recipes, skilled/expert cooks can do more involved meals.

Return ONLY valid JSON (no markdown):
{
  "Monday":    { "Breakfast": "meal name", "Lunch": "meal name", "Dinner": "meal name" },
  "Tuesday":   { "Breakfast": "meal name", "Lunch": "meal name", "Dinner": "meal name" },
  "Wednesday": { "Breakfast": "meal name", "Lunch": "meal name", "Dinner": "meal name" },
  "Thursday":  { "Breakfast": "meal name", "Lunch": "meal name", "Dinner": "meal name" },
  "Friday":    { "Breakfast": "meal name", "Lunch": "meal name", "Dinner": "meal name" },
  "Saturday":  { "Breakfast": "meal name", "Lunch": "meal name", "Dinner": "meal name" },
  "Sunday":    { "Breakfast": "meal name", "Lunch": "meal name", "Dinner": "meal name" }
}

Keep meal names short (2-4 words). Vary it — don't repeat meals. Make Monday dinner something special.`;

  try {
    const geminiKey = localStorage.getItem(KEYS.geminiApiKey) || '';
    if (geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 600 },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (raw) return JSON.parse(raw);
      }
    }
    const token = await getAccessToken();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ prompt, maxTokens: 600 }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const raw = (data.text || '').replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    return JSON.parse(raw);
  } catch { return {}; }
}

function addCookingChore(meal: string, mealType: MealType, cook: string, day: Day) {
  if (!meal || !cook || cook === 'Takeout') return;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }) as Day;
  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const text = `Cook ${meal} (${mealType.toLowerCase()}) — ${day}`;
  if (tasks.some(t => !t.completed && t.text === text)) return; // dedup
  tasks.unshift({
    id: uid(), createdAt: Date.now(), completed: false, source: 'meal_planner',
    text, person: cook, priority: 'Medium', category: 'General',
    dueEstimate: day === today ? 'Today' : 'This Week',
  });
  saveJSON(KEYS.tasks, tasks);
}

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

// ─── Component ────────────────────────────────────────────────────────────────

const DIFF_COLOR: Record<string, string> = {
  Easy: 'text-sage-500', Medium: 'text-honey-400', Hard: 'text-rose-400',
};

const MealPlanner: React.FC = () => {
  const { householdMembers } = useAppContext();

  const cookProfiles = React.useMemo(() => {
    const profiles: Record<string, CookProfile> = { ...EXTRA_COOK_PROFILES };
    householdMembers.forEach((m) => {
      if (m.role === 'pet') return;
      const ageGroup = m.role === 'child' ? 'child' : 'adult';
      profiles[m.name] = {
        skill: ageGroup === 'child' ? 'beginner' : 'skilled',
        ageGroup,
        note: ageGroup === 'child' ? 'Needs simple assembly meals. Supervision required for stovetop.' : 'Comfortable with most meals.',
        color: m.color || 'slate',
      };
    });
    return profiles;
  }, [householdMembers]);
  const cooks = Object.keys(cookProfiles);

  const foodPreferenceByCook = React.useMemo(() => {
    const map: Record<string, string> = {};
    householdMembers.forEach((m) => {
      const prefs = loadMemberPreferences(m.id);
      const fragment = buildFoodPreferencePrompt(prefs);
      if (fragment) map[m.name] = fragment;
    });
    return map;
  }, [householdMembers]);

  const [plan, setPlan] = useState<WeekPlan>(() => {
    const saved = loadJSON<WeekPlan | null>(STORAGE_KEY, null);
    if (!saved) return defaultPlan();
    const full = defaultPlan();
    DAYS.forEach(d => { if (saved[d]) full[d] = { ...EMPTY_DAY, ...saved[d] }; });
    return full;
  });

  const [editing, setEditing] = useState<{ day: Day; meal: MealType } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editingCook, setEditingCook] = useState<Day | null>(null);
  const [suggestions, setSuggestions] = useState<Record<SuggestionKey, Recipe>>({});
  const [suggestError, setSuggestError] = useState<Record<SuggestionKey, string>>({});
  const [loading, setLoading] = useState<SuggestionKey | null>(null);
  const [expanded, setExpanded] = useState<SuggestionKey | null>(null);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [choreFeedback, setChoreFeedback] = useState<string | null>(null);
  const [shopFeedback, setShopFeedback] = useState<string | null>(null);
  const [servingsOverride, setServingsOverride] = useState<Record<SuggestionKey, number>>({});

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }) as Day;

  const save = (next: WeekPlan) => { setPlan(next); saveJSON(STORAGE_KEY, next); };

  const startEdit = (day: Day, meal: MealType) => {
    setEditing({ day, meal }); setEditValue(plan[day][meal]); setEditingCook(null);
  };
  const commitEdit = () => {
    if (!editing) return;
    save({ ...plan, [editing.day]: { ...plan[editing.day], [editing.meal]: editValue.trim() } });
    setEditing(null);
  };
  const setCook = (day: Day, cook: string) => {
    save({ ...plan, [day]: { ...plan[day], cook } });
    setEditingCook(null);
  };

  const handleSuggest = useCallback(async (day: Day, meal: MealType) => {
    const cook = plan[day].cook;
    if (!cook || cook === 'Takeout') return;
    const key = suggestionKey(day, meal);
    setLoading(key); setExpanded(key);
    setSuggestError(prev => { const next = { ...prev }; delete next[key]; return next; });
    const result = await fetchSuggestion(day, meal, cook, cookProfiles, foodPreferenceByCook[cook]);
    if (result.ok) {
      setSuggestions(prev => ({ ...prev, [key]: result.recipe }));
      // Auto-fill the meal name and remember its ingredients/details so the
      // recipe drawer, Mark Cooked, and Add-to-shopping all keep working
      // even after a reload (suggestions state itself is not persisted).
      save({
        ...plan,
        [day]: {
          ...plan[day],
          [meal]: result.recipe.name,
          cookedIngredients: { ...plan[day].cookedIngredients, [meal]: result.recipe.recipe.ingredients },
          recipeDetail: {
            ...plan[day].recipeDetail,
            [meal]: {
              description: result.recipe.description,
              time: result.recipe.time,
              difficulty: result.recipe.difficulty,
              servings: result.recipe.servings,
              steps: result.recipe.recipe.steps,
            },
          },
        },
      });
    } else {
      setSuggestError(prev => ({ ...prev, [key]: result.error }));
    }
    setLoading(null);
  }, [plan, cookProfiles, foodPreferenceByCook]);

  // suggestions state (from clicking "Suggest") is ephemeral and lost on
  // reload; cookedIngredients/recipeDetail are persisted. When a meal was
  // planned by Hermes (setMealPlanAction) or survives a reload, synthesize
  // an equivalent Recipe from the persisted fields so the drawer renders
  // identically either way.
  const getDisplayRecipe = useCallback((day: Day, meal: MealType): Recipe | undefined => {
    const key = suggestionKey(day, meal);
    if (suggestions[key]) return suggestions[key];
    const ingredients = plan[day].cookedIngredients?.[meal];
    if (!ingredients) return undefined;
    const detail = plan[day].recipeDetail?.[meal];
    return {
      name: plan[day][meal],
      description: detail?.description || '',
      time: detail?.time || '',
      difficulty: detail?.difficulty || 'Easy',
      servings: detail?.servings || 1,
      recipe: { ingredients, steps: detail?.steps || [] },
    };
  }, [plan, suggestions]);

  const handleSuggestWeek = async () => {
    setLoadingWeek(true);
    const result = await suggestWholeWeek(plan, cookProfiles);
    if (result) {
      const next = { ...plan };
      DAYS.forEach(day => {
        const daySuggestions = result[day];
        if (daySuggestions) {
          next[day] = { ...next[day], ...daySuggestions };
        }
      });
      save(next);
    }
    setLoadingWeek(false);
  };

  const handleAddChore = (meal: string, mealType: MealType, cook: string, day: Day) => {
    addCookingChore(meal, mealType, cook, day);
    setChoreFeedback(`${cook}'s cooking chore added`);
    setTimeout(() => setChoreFeedback(null), 2000);
  };

  const handleAddShopping = (ingredients: { name: string; quantity: number; unit: string }[]) => {
    const n = addIngredientsToShopping(ingredients);
    setShopFeedback(n > 0 ? `${n} ingredient${n !== 1 ? 's' : ''} added to shopping list` : 'Pantry already covers this recipe — nothing added.');
    setTimeout(() => setShopFeedback(null), 2500);
  };

  const markCooked = (day: Day, meal: MealType) => {
    const ingredients = plan[day].cookedIngredients?.[meal];
    if (!ingredients) return;
    const key = suggestionKey(day, meal);
    const recipeServings = suggestions[key]?.servings ?? plan[day].recipeDetail?.[meal]?.servings ?? 1;
    const chosenServings = servingsOverride[key] ?? recipeServings;
    const scaled = scaleIngredients(ingredients, recipeServings, chosenServings);

    const pantryItems = loadPantry();
    savePantry(decrementPantry(pantryItems, scaled));

    save(applyMealCooked(plan, day, meal, ingredients, recipeServings, chosenServings));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-honey-400" />
          Meal Planner
        </h2>
        <button
          onClick={handleSuggestWeek}
          disabled={loadingWeek}
          className="flex items-center gap-2 bg-berry-600 hover:bg-berry-500 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition focus-ring"
        >
          {loadingWeek ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Suggest whole week
        </button>
      </div>

      {/* Feedback toasts */}
      {choreFeedback && (
        <div className="bg-sage-600/40 border border-sage-600/40 text-sage-200 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> {choreFeedback}
        </div>
      )}
      {shopFeedback && (
        <div className="bg-berry-600/40 border border-berry-600/40 text-berry-400 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" /> {shopFeedback}
        </div>
      )}

      {/* Cook skill legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(cookProfiles).filter(([, p]) => p.skill).map(([name, p]) => (
          <div key={name} className={`flex items-center gap-1 bg-bark-700 border border-cream-400/10 rounded-lg px-2.5 py-1`}>
            <span className="text-cream-200 font-medium">{name}</span>
            <span className="text-cream-400/50">{SKILL_LABEL[p.skill!]}</span>
          </div>
        ))}
      </div>

      {/* Week grid */}
      <div className="space-y-3">
        {DAYS.map(day => {
          const isToday = day === today;
          const dayPlan = plan[day];
          const cookProfile = dayPlan.cook ? cookProfiles[dayPlan.cook] : null;

          return (
            <div
              key={day}
              className={`bg-bark-700/40 border rounded-xl overflow-hidden ${isToday ? 'border-sage-500/50' : 'border-cream-400/10'}`}
            >
              {/* Day header */}
              <div className={`px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 ${isToday ? 'bg-sage-600/20' : 'bg-bark-700/60'}`}>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${isToday ? 'text-sage-200' : 'text-white'}`}>
                    {day}
                    {isToday && <span className="ml-2 text-xs bg-sage-500 text-bark-800 px-1.5 py-0.5 rounded font-medium">Today</span>}
                  </span>
                </div>

                {/* Cook selector */}
                <div className="flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5 text-cream-400/50" />
                  {editingCook === day ? (
                    <select
                      autoFocus
                      value={dayPlan.cook}
                      onChange={e => setCook(day, e.target.value)}
                      onBlur={() => setEditingCook(null)}
                      className="bg-bark-800 border border-cream-400/10 rounded text-xs text-white px-2 py-1 outline-none focus-ring"
                    >
                      <option value="">Who's cooking?</option>
                      {cooks.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <button onClick={() => setEditingCook(day)} className="text-xs hover:text-white transition flex items-center gap-1 focus-ring">
                      {dayPlan.cook ? (
                        <>
                          <span className={`${getColorCardStyle(cookProfile?.color || '').text} font-medium`}>{dayPlan.cook}</span>
                          {cookProfile?.skill && <span className="text-cream-400/50">{SKILL_LABEL[cookProfile.skill]}</span>}
                        </>
                      ) : (
                        <span className="text-cream-400/50 italic">Who's cooking?</span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Meal slots */}
              <div className="divide-y divide-cream-400/10">
                {MEALS.map(meal => {
                  const isEdit = editing?.day === day && editing?.meal === meal;
                  const mealValue = dayPlan[meal];
                  const key = suggestionKey(day, meal);
                  const isLoadingThis = loading === key;
                  const suggestion = getDisplayRecipe(day, meal);
                  const isExpanded = expanded === key && !!suggestion;
                  const hasCook = !!(dayPlan.cook && dayPlan.cook !== 'Takeout');
                  const hasStoredRecipe = !!dayPlan.cookedIngredients?.[meal];

                  return (
                    <div key={meal}>
                      <div className="px-4 py-2.5 flex items-center gap-3">
                        {/* Meal label */}
                        <span className="text-cream-400/50 text-[10px] uppercase tracking-wider w-16 flex-shrink-0">{meal}</span>

                        {/* Meal name edit */}
                        <div className="flex-1 min-w-0">
                          {isEdit ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                                className="flex-1 bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-honey-500 focus-ring"
                                placeholder="Enter meal..."
                              />
                              <button onClick={commitEdit} className="text-sage-400 hover:text-sage-500 p-1 focus-ring"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditing(null)} className="text-cream-400/50 hover:text-white p-1 focus-ring"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => startEdit(day, meal)} className="group flex items-center gap-1 w-full text-left focus-ring">
                              <span className={`text-sm ${mealValue ? 'text-cream-200' : 'text-cream-400/40 italic'}`}>
                                {mealValue || 'Tap to add…'}
                              </span>
                              <Edit3 className="w-3 h-3 text-cream-400/40 group-hover:text-cream-400/60 opacity-0 group-hover:opacity-100 transition" />
                            </button>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Suggest */}
                          {hasCook && (
                            <button
                              onClick={() => {
                                if (isExpanded) { setExpanded(null); return; }
                                if (hasStoredRecipe && !suggestions[key]) { setExpanded(key); return; }
                                handleSuggest(day, meal);
                              }}
                              disabled={isLoadingThis}
                              title={hasStoredRecipe ? `View recipe for ${meal.toLowerCase()}` : `Suggest ${meal.toLowerCase()} for ${dayPlan.cook}`}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-berry-600/40 hover:bg-berry-600/60 border border-berry-600/30 text-berry-400 transition disabled:opacity-50 focus-ring"
                            >
                              {isLoadingThis
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Sparkles className="w-3 h-3" />
                              }
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : null}
                            </button>
                          )}

                          {/* Add as chore */}
                          {mealValue && hasCook && dayPlan.cook && (
                            <button
                              onClick={() => handleAddChore(mealValue, meal, dayPlan.cook, day)}
                              title="Add cooking as a chore"
                              className="text-xs px-2 py-1 rounded-lg bg-honey-700/30 hover:bg-honey-600/50 border border-honey-600/30 text-honey-200 transition focus-ring"
                            >
                              <ClipboardList className="w-3 h-3" />
                            </button>
                          )}

                          {/* Mark cooked */}
                          {mealValue && !dayPlan.cookedAt?.[meal] && (
                            <button
                              onClick={() => markCooked(day, meal)}
                              title="Mark cooked"
                              className="text-cream-400/50 hover:text-sage-400 transition focus-ring"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Suggestion error */}
                      {expanded === key && !suggestion && suggestError[key] && (
                        <div className="mx-4 mb-3 bg-rose-950/40 border border-rose-800/40 rounded-xl px-3 py-2 text-xs text-rose-300 flex items-center justify-between gap-2">
                          <span>{suggestError[key]}</span>
                          <button onClick={() => handleSuggest(day, meal)} className="text-rose-200 hover:text-white underline flex-shrink-0 focus-ring">Retry</button>
                        </div>
                      )}

                      {/* Recipe drawer */}
                      {isExpanded && suggestion && (
                        <div className="mx-4 mb-3 bg-bark-800 border border-berry-500/20 rounded-xl p-4 text-sm space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-white">{suggestion.name}</div>
                              <div className="text-cream-400/60 text-xs mt-0.5">{suggestion.description}</div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className={`text-xs font-medium ${DIFF_COLOR[suggestion.difficulty] || 'text-cream-400/60'}`}>{suggestion.difficulty}</span>
                              <span className="text-xs text-cream-400/50 flex items-center gap-1"><Clock className="w-3 h-3" />{suggestion.time}</span>
                            </div>
                          </div>

                          {/* Servings */}
                          <div className="flex items-center gap-2">
                            <span className="text-cream-400/60 text-xs">Servings:</span>
                            <button
                              onClick={() => setServingsOverride((prev) => ({ ...prev, [key]: Math.max(1, (prev[key] ?? suggestion.servings) - 1) }))}
                              className="w-6 h-6 rounded-lg bg-bark-700 hover:bg-bark-700/70 flex items-center justify-center text-cream-200 text-sm focus-ring"
                            >−</button>
                            <span className="w-6 text-center text-sm font-bold text-white">{servingsOverride[key] ?? suggestion.servings}</span>
                            <button
                              onClick={() => setServingsOverride((prev) => ({ ...prev, [key]: (prev[key] ?? suggestion.servings) + 1 }))}
                              className="w-6 h-6 rounded-lg bg-bark-700 hover:bg-bark-700/70 flex items-center justify-center text-cream-200 text-sm focus-ring"
                            >+</button>
                          </div>

                          {/* Ingredients */}
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-cream-400/50 mb-1.5">Ingredients</div>
                            <div className="flex flex-wrap gap-1">
                              {scaleIngredients(suggestion.recipe.ingredients, suggestion.servings, servingsOverride[key] ?? suggestion.servings).map((ing, i) => (
                                <span key={i} className="text-xs bg-bark-700 border border-cream-400/10 rounded px-2 py-0.5 text-cream-200">
                                  {ing.quantity} {ing.unit} {ing.name}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Steps */}
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-cream-400/50 mb-1.5">Steps</div>
                            <ol className="space-y-1">
                              {suggestion.recipe.steps.map((step, i) => (
                                <li key={i} className="flex gap-2 text-xs text-cream-200">
                                  <span className="text-berry-400 font-bold flex-shrink-0">{i + 1}.</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>

                          {/* Action row */}
                          <div className="flex gap-2 pt-1">
                            {(() => {
                              const scaled = scaleIngredients(suggestion.recipe.ingredients, suggestion.servings, servingsOverride[key] ?? suggestion.servings);
                              return scaled.length > 0 && (
                                <button
                                  onClick={() => handleAddShopping(scaled)}
                                  className="flex items-center gap-1.5 text-xs bg-berry-600/40 hover:bg-berry-600/60 border border-berry-600/30 text-berry-400 px-3 py-1.5 rounded-lg transition focus-ring"
                                >
                                  <ShoppingCart className="w-3.5 h-3.5" />
                                  Add {scaled.length} to shopping
                                </button>
                              );
                            })()}
                            {dayPlan.cook && (
                              <button
                                onClick={() => handleAddChore(suggestion.name, meal, dayPlan.cook, day)}
                                className="flex items-center gap-1.5 text-xs bg-honey-700/30 hover:bg-honey-600/50 border border-honey-600/30 text-honey-200 px-3 py-1.5 rounded-lg transition focus-ring"
                              >
                                <ClipboardList className="w-3.5 h-3.5" />
                                Add as chore
                              </button>
                            )}
                            <button
                              onClick={() => setExpanded(null)}
                              className="ml-auto text-xs text-cream-400/50 hover:text-white px-2 py-1.5 transition focus-ring"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MealPlanner;
