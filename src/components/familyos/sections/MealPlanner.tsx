import React, { useState, useCallback } from 'react';
import { Edit3, Check, X, ChefHat, Sparkles, Loader2, ClipboardList, ShoppingCart, ChevronDown, ChevronUp } from 'lucide-react';
import { loadJSON, saveJSON, uid, KEYS, loadMemberPreferences, buildFoodPreferencePrompt, loadPantry, calculateShortfall } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { getAccessToken } from '@/lib/householdAuth';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'familyos_meals';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type Day = typeof DAYS[number];
const MEALS = ['Breakfast', 'Lunch', 'Dinner'] as const;
type MealType = typeof MEALS[number];

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

interface DayPlan {
  Breakfast: string;
  Lunch: string;
  Dinner: string;
  cook: string;
}
type WeekPlan = Record<Day, DayPlan>;
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

function defaultPlan(): WeekPlan {
  const plan = {} as WeekPlan;
  DAYS.forEach(d => { plan[d] = { ...EMPTY_DAY }; });
  return plan;
}

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

async function fetchSuggestion(day: Day, meal: MealType, cook: string, profiles: Record<string, CookProfile>, foodPreference?: string): Promise<Recipe | null> {
  const profile = profiles[cook];
  if (!profile?.skill) return null;

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
        if (raw) return JSON.parse(raw) as Recipe;
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
    if (!res.ok) return null;
    const data = await res.json();
    const raw = (data.text || '').replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    return JSON.parse(raw) as Recipe;
  } catch { return null; }
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
    const result = await fetchSuggestion(day, meal, cook, cookProfiles, foodPreferenceByCook[cook]);
    if (result) {
      setSuggestions(prev => ({ ...prev, [key]: result }));
      // Auto-fill the meal name
      save({ ...plan, [day]: { ...plan[day], [meal]: result.name } });
    }
    setLoading(null);
  }, [plan, cookProfiles, foodPreferenceByCook]);

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-orange-400" />
          Meal Planner
        </h2>
        <button
          onClick={handleSuggestWeek}
          disabled={loadingWeek}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition"
        >
          {loadingWeek ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Suggest whole week
        </button>
      </div>

      {/* Feedback toasts */}
      {choreFeedback && (
        <div className="bg-emerald-900/40 border border-emerald-600/40 text-emerald-300 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> {choreFeedback}
        </div>
      )}
      {shopFeedback && (
        <div className="bg-blue-900/40 border border-blue-600/40 text-blue-300 text-sm px-4 py-2 rounded-xl flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" /> {shopFeedback}
        </div>
      )}

      {/* Cook skill legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(cookProfiles).filter(([, p]) => p.skill).map(([name, p]) => (
          <div key={name} className={`flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1`}>
            <span className="text-slate-300 font-medium">{name}</span>
            <span className="text-slate-500">{SKILL_LABEL[p.skill!]}</span>
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
              className={`bg-slate-800/40 border rounded-xl overflow-hidden ${isToday ? 'border-emerald-500/50' : 'border-slate-700'}`}
            >
              {/* Day header */}
              <div className={`px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 ${isToday ? 'bg-emerald-900/20' : 'bg-slate-800/60'}`}>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${isToday ? 'text-emerald-300' : 'text-white'}`}>
                    {day}
                    {isToday && <span className="ml-2 text-xs bg-emerald-500 text-slate-900 px-1.5 py-0.5 rounded font-medium">Today</span>}
                  </span>
                </div>

                {/* Cook selector */}
                <div className="flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5 text-slate-500" />
                  {editingCook === day ? (
                    <select
                      autoFocus
                      value={dayPlan.cook}
                      onChange={e => setCook(day, e.target.value)}
                      onBlur={() => setEditingCook(null)}
                      className="bg-slate-700 border border-slate-600 rounded text-xs text-white px-2 py-1 outline-none"
                    >
                      <option value="">Who's cooking?</option>
                      {cooks.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <button onClick={() => setEditingCook(day)} className="text-xs hover:text-white transition flex items-center gap-1">
                      {dayPlan.cook ? (
                        <>
                          <span className={`text-${cookProfile?.color || 'slate'}-300 font-medium`}>{dayPlan.cook}</span>
                          {cookProfile?.skill && <span className="text-slate-500">{SKILL_LABEL[cookProfile.skill]}</span>}
                        </>
                      ) : (
                        <span className="text-slate-500 italic">Who's cooking?</span>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Meal slots */}
              <div className="divide-y divide-slate-700/40">
                {MEALS.map(meal => {
                  const isEdit = editing?.day === day && editing?.meal === meal;
                  const mealValue = dayPlan[meal];
                  const key = suggestionKey(day, meal);
                  const isLoadingThis = loading === key;
                  const suggestion = suggestions[key];
                  const isExpanded = expanded === key && !!suggestion;
                  const hasCook = !!(dayPlan.cook && dayPlan.cook !== 'Takeout');

                  return (
                    <div key={meal}>
                      <div className="px-4 py-2.5 flex items-center gap-3">
                        {/* Meal label */}
                        <span className="text-slate-500 text-[10px] uppercase tracking-wider w-16 flex-shrink-0">{meal}</span>

                        {/* Meal name edit */}
                        <div className="flex-1 min-w-0">
                          {isEdit ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-orange-500"
                                placeholder="Enter meal..."
                              />
                              <button onClick={commitEdit} className="text-emerald-400 hover:text-emerald-300 p-1"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-white p-1"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => startEdit(day, meal)} className="group flex items-center gap-1 w-full text-left">
                              <span className={`text-sm ${mealValue ? 'text-slate-200' : 'text-slate-600 italic'}`}>
                                {mealValue || 'Tap to add…'}
                              </span>
                              <Edit3 className="w-3 h-3 text-slate-600 group-hover:text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                            </button>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Suggest */}
                          {hasCook && (
                            <button
                              onClick={() => isExpanded ? setExpanded(null) : handleSuggest(day, meal)}
                              disabled={isLoadingThis}
                              title={`Suggest ${meal.toLowerCase()} for ${dayPlan.cook}`}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-violet-900/40 hover:bg-violet-800/60 border border-violet-600/30 text-violet-300 transition disabled:opacity-50"
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
                              className="text-xs px-2 py-1 rounded-lg bg-orange-900/30 hover:bg-orange-800/50 border border-orange-600/30 text-orange-300 transition"
                            >
                              <ClipboardList className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Recipe drawer */}
                      {isExpanded && suggestion && (
                        <div className="mx-4 mb-3 bg-slate-900 border border-violet-500/20 rounded-xl p-4 text-sm space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold text-white">{suggestion.name}</div>
                              <div className="text-slate-400 text-xs mt-0.5">{suggestion.description}</div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span className={`text-xs font-medium ${DIFF_COLOR[suggestion.difficulty] || 'text-slate-400'}`}>{suggestion.difficulty}</span>
                              <span className="text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{suggestion.time}</span>
                            </div>
                          </div>

                          {/* Servings */}
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-xs">Servings:</span>
                            <button
                              onClick={() => setServingsOverride((prev) => ({ ...prev, [key]: Math.max(1, (prev[key] ?? suggestion.servings) - 1) }))}
                              className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 text-sm"
                            >−</button>
                            <span className="w-6 text-center text-sm font-bold text-white">{servingsOverride[key] ?? suggestion.servings}</span>
                            <button
                              onClick={() => setServingsOverride((prev) => ({ ...prev, [key]: (prev[key] ?? suggestion.servings) + 1 }))}
                              className="w-6 h-6 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 text-sm"
                            >+</button>
                          </div>

                          {/* Ingredients */}
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Ingredients</div>
                            <div className="flex flex-wrap gap-1">
                              {scaleIngredients(suggestion.recipe.ingredients, suggestion.servings, servingsOverride[key] ?? suggestion.servings).map((ing, i) => (
                                <span key={i} className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-slate-300">
                                  {ing.quantity} {ing.unit} {ing.name}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Steps */}
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Steps</div>
                            <ol className="space-y-1">
                              {suggestion.recipe.steps.map((step, i) => (
                                <li key={i} className="flex gap-2 text-xs text-slate-300">
                                  <span className="text-violet-400 font-bold flex-shrink-0">{i + 1}.</span>
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
                                  className="flex items-center gap-1.5 text-xs bg-blue-900/40 hover:bg-blue-800/60 border border-blue-600/30 text-blue-300 px-3 py-1.5 rounded-lg transition"
                                >
                                  <ShoppingCart className="w-3.5 h-3.5" />
                                  Add {scaled.length} to shopping
                                </button>
                              );
                            })()}
                            {dayPlan.cook && (
                              <button
                                onClick={() => handleAddChore(suggestion.name, meal, dayPlan.cook, day)}
                                className="flex items-center gap-1.5 text-xs bg-orange-900/30 hover:bg-orange-800/50 border border-orange-600/30 text-orange-300 px-3 py-1.5 rounded-lg transition"
                              >
                                <ClipboardList className="w-3.5 h-3.5" />
                                Add as chore
                              </button>
                            )}
                            <button
                              onClick={() => setExpanded(null)}
                              className="ml-auto text-xs text-slate-500 hover:text-white px-2 py-1.5 transition"
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
