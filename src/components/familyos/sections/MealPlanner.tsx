import React, { useState, useCallback, useEffect } from 'react';
import { Edit3, Check, X, ChefHat, Sparkles, Loader2, ClipboardList, ShoppingCart, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { loadJSON, saveJSON, uid, KEYS, loadMemberPreferences, buildFoodPreferencePrompt, loadPantry, savePantry, calculateShortfall, decrementPantry } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { useAppContext } from '@/contexts/AppContext';
import { getAccessToken } from '@/lib/householdAuth';
import { apiUrl } from '@/lib/api';
import { getColorCardStyle } from '@/lib/colorStyles';
import { triggerConfetti } from '@/lib/confetti';
import { DAYS, MEALS, MEALS_STORAGE_KEY, defaultPlan, applyMealCooked, type Day, type MealType, type WeekPlan } from './mealPlannerShared';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = MEALS_STORAGE_KEY;
export { DAYS, MEALS, MEALS_STORAGE_KEY, defaultPlan, applyMealCooked };
export type { Day, MealType, WeekPlan };

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
    const token = await getAccessToken();
    const res = await fetch(apiUrl('/api/chat'), {
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
    const token = await getAccessToken();
    const res = await fetch(apiUrl('/api/chat'), {
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
  Easy: 'text-emerald-400', Medium: 'text-amber-400', Hard: 'text-rose-400',
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

  const loadPlan = (): WeekPlan => {
    const saved = loadJSON<WeekPlan | null>(STORAGE_KEY, null);
    if (!saved) return defaultPlan();
    const full = defaultPlan();
    DAYS.forEach(d => { if (saved[d]) full[d] = { ...EMPTY_DAY, ...saved[d] }; });
    return full;
  };

  const [plan, setPlan] = useState<WeekPlan>(loadPlan);

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

  useEffect(() => {
    return onSyncUpdate((key) => {
      if (key !== STORAGE_KEY && key !== '*') return;
      setPlan(loadPlan());
    });
  }, []);

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

    triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.4, 60);
    setChoreFeedback(`Chef mode! 🍳 "${plan[day][meal]}" marked cooked & pantry updated.`);
    setTimeout(() => setChoreFeedback(null), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <ChefHat className="w-3.5 h-3.5 text-amber-400" /> Kitchen & Nutrition
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Meal <span className="bg-gradient-to-r from-amber-400 via-orange-300 to-rose-400 bg-clip-text text-transparent">Planner</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Zero dinner paralysis. Smart AI recipes, pantry sync, and serving scaling.
          </p>
        </div>
        <button
          onClick={handleSuggestWeek}
          disabled={loadingWeek}
          className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all shadow-md shadow-purple-500/20 active:scale-95 shrink-0"
        >
          {loadingWeek ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Suggest Whole Week
        </button>
      </div>

      {/* Feedback toasts */}
      {choreFeedback && (
        <div className="bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs sm:text-sm px-4 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg animate-fade-in">
          <ClipboardList className="w-4 h-4 text-emerald-400" /> {choreFeedback}
        </div>
      )}
      {shopFeedback && (
        <div className="bg-purple-950/50 border border-purple-500/40 text-purple-200 text-xs sm:text-sm px-4 py-2.5 rounded-2xl flex items-center gap-2 shadow-lg animate-fade-in">
          <ShoppingCart className="w-4 h-4 text-purple-400" /> {shopFeedback}
        </div>
      )}

      {/* Cook skill legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(cookProfiles).filter(([, p]) => p.skill).map(([name, p]) => (
          <div
            key={name}
            className="flex items-center gap-1.5 bg-slate-900/60 border border-white/10 rounded-xl px-3 py-1.5 backdrop-blur-sm"
          >
            <span className="text-slate-200 font-semibold">{name}</span>
            <span className="text-amber-400 font-bold tracking-wider">{SKILL_LABEL[p.skill!]}</span>
          </div>
        ))}
      </div>

      {/* Week grid */}
      <div className="space-y-3.5">
        {DAYS.map(day => {
          const isToday = day === today;
          const dayPlan = plan[day];
          const cookProfile = dayPlan.cook ? cookProfiles[dayPlan.cook] : null;

          return (
            <div
              key={day}
              className={`bg-slate-900/60 backdrop-blur-md border rounded-2xl overflow-hidden transition-all shadow-sm ${
                isToday ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/5' : 'border-white/10 hover:border-white/20'
              }`}
            >
              {/* Day header */}
              <div
                className={`px-4 py-3 flex items-center justify-between flex-wrap gap-2 ${
                  isToday ? 'bg-emerald-500/15 border-b border-emerald-500/20' : 'bg-white/[0.02] border-b border-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm tracking-tight ${isToday ? 'text-emerald-300' : 'text-white'}`}>
                    {day}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full shadow-sm">
                      Today
                    </span>
                  )}
                </div>

                {/* Cook selector */}
                <div className="flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5 text-slate-400" />
                  {editingCook === day ? (
                    <select
                      autoFocus
                      value={dayPlan.cook}
                      onChange={e => setCook(day, e.target.value)}
                      onBlur={() => setEditingCook(null)}
                      className="bg-slate-950 border border-white/20 rounded-lg text-xs text-white px-2.5 py-1 outline-none"
                    >
                      <option value="">Who's cooking?</option>
                      {cooks.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingCook(day)}
                      className="text-xs hover:text-white transition flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/5 px-2.5 py-1 rounded-lg"
                    >
                      {dayPlan.cook ? (
                        <>
                          <span className={`${getColorCardStyle(cookProfile?.color || '').text} font-semibold`}>
                            {dayPlan.cook}
                          </span>
                          {cookProfile?.skill && (
                            <span className="text-amber-400 text-[10px] font-bold">
                              {SKILL_LABEL[cookProfile.skill]}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400 italic">Assign chef...</span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Meal slots */}
              <div className="divide-y divide-white/5">
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
                      <div className="px-4 py-3 flex items-center gap-3">
                        {/* Meal label */}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 w-16 flex-shrink-0">
                          {meal}
                        </span>

                        {/* Meal name edit */}
                        <div className="flex-1 min-w-0">
                          {isEdit ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                                className="flex-1 bg-white/[0.05] border border-amber-500/50 rounded-xl px-3 py-1.5 text-white text-sm outline-none"
                                placeholder="Enter meal..."
                              />
                              <button onClick={commitEdit} className="text-emerald-400 hover:text-emerald-300 p-1.5">
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-white p-1.5">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => startEdit(day, meal)} className="group flex items-center gap-1.5 w-full text-left">
                              <span className={`text-sm font-semibold tracking-tight ${mealValue ? 'text-white' : 'text-slate-500 italic font-normal'}`}>
                                {mealValue || 'Tap to add…'}
                              </span>
                              <Edit3 className="w-3 h-3 text-slate-500 group-hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
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
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 transition-all disabled:opacity-50 active:scale-95"
                            >
                              {isLoadingThis
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Sparkles className="w-3 h-3 text-purple-400" />
                              }
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : null}
                            </button>
                          )}

                          {/* Add as chore */}
                          {mealValue && hasCook && dayPlan.cook && (
                            <button
                              onClick={() => handleAddChore(mealValue, meal, dayPlan.cook, day)}
                              title="Add cooking as a chore"
                              className="text-xs px-2 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 transition-all active:scale-95"
                            >
                              <ClipboardList className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Mark cooked */}
                          {mealValue && !dayPlan.cookedAt?.[meal] && (
                            <button
                              onClick={() => markCooked(day, meal)}
                              title="Mark cooked"
                              className="text-slate-400 hover:text-emerald-400 hover:scale-110 transition-all p-1.5"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Suggestion error */}
                      {expanded === key && !suggestion && suggestError[key] && (
                        <div className="mx-4 mb-3 bg-rose-950/40 border border-rose-500/30 rounded-xl px-3.5 py-2 text-xs text-rose-300 flex items-center justify-between gap-2">
                          <span>{suggestError[key]}</span>
                          <button onClick={() => handleSuggest(day, meal)} className="text-rose-200 hover:text-white underline flex-shrink-0">Retry</button>
                        </div>
                      )}

                      {/* Recipe drawer */}
                      {isExpanded && suggestion && (
                        <div className="mx-4 mb-3.5 bg-slate-950/80 backdrop-blur-md border border-purple-500/30 rounded-2xl p-4 sm:p-5 text-sm space-y-3.5 shadow-xl">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-white text-base">{suggestion.name}</div>
                              <div className="text-slate-400 text-xs mt-0.5">{suggestion.description}</div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className={`text-xs font-semibold ${DIFF_COLOR[suggestion.difficulty] || 'text-slate-400'}`}>
                                {suggestion.difficulty}
                              </span>
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />{suggestion.time}
                              </span>
                            </div>
                          </div>

                          {/* Servings */}
                          <div className="flex items-center gap-2.5">
                            <span className="text-slate-400 text-xs font-medium">Servings:</span>
                            <button
                              onClick={() => setServingsOverride((prev) => ({ ...prev, [key]: Math.max(1, (prev[key] ?? suggestion.servings) - 1) }))}
                              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white text-sm transition-all"
                            >−</button>
                            <span className="w-6 text-center text-sm font-bold text-white">
                              {servingsOverride[key] ?? suggestion.servings}
                            </span>
                            <button
                              onClick={() => setServingsOverride((prev) => ({ ...prev, [key]: (prev[key] ?? suggestion.servings) + 1 }))}
                              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white text-sm transition-all"
                            >+</button>
                          </div>

                          {/* Ingredients */}
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Ingredients</div>
                            <div className="flex flex-wrap gap-1.5">
                              {scaleIngredients(suggestion.recipe.ingredients, suggestion.servings, servingsOverride[key] ?? suggestion.servings).map((ing, i) => (
                                <span key={i} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-slate-200 font-medium">
                                  {ing.quantity} {ing.unit} {ing.name}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Steps */}
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Steps</div>
                            <ol className="space-y-1.5">
                              {suggestion.recipe.steps.map((step, i) => (
                                <li key={i} className="flex gap-2 text-xs text-slate-300">
                                  <span className="text-purple-400 font-bold flex-shrink-0">{i + 1}.</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>

                          {/* Action row */}
                          <div className="flex gap-2 pt-1 flex-wrap">
                            {(() => {
                              const scaled = scaleIngredients(suggestion.recipe.ingredients, suggestion.servings, servingsOverride[key] ?? suggestion.servings);
                              return scaled.length > 0 && (
                                <button
                                  onClick={() => handleAddShopping(scaled)}
                                  className="flex items-center gap-1.5 text-xs bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 font-semibold px-3.5 py-2 rounded-xl transition-all shadow-sm"
                                >
                                  <ShoppingCart className="w-3.5 h-3.5" />
                                  Add {scaled.length} to shopping
                                </button>
                              );
                            })()}
                            {dayPlan.cook && (
                              <button
                                onClick={() => handleAddChore(suggestion.name, meal, dayPlan.cook, day)}
                                className="flex items-center gap-1.5 text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold px-3.5 py-2 rounded-xl transition-all shadow-sm"
                              >
                                <ClipboardList className="w-3.5 h-3.5" />
                                Add as chore
                              </button>
                            )}
                            <button
                              onClick={() => setExpanded(null)}
                              className="ml-auto text-xs text-slate-400 hover:text-white px-3 py-2 transition-colors font-medium"
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

