'use client';

import { useState, useMemo } from 'react';
import { ChefHat, Plus, Trash2, Sparkles, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, parseISO } from 'date-fns';
import { useMeals, getWeekStart, shiftDate, type MealSlot } from '@/hooks/use-meals';
import { useShopping } from '@/hooks/use-shopping';
import { BUILT_IN_RECIPES, CATEGORY_LABELS, searchRecipes, getRecipeById, type Recipe } from '@/lib/recipes';
import { useFamilyMembers } from '@/hooks/use-family';
import { useEvents } from '@/hooks/use-events';
import { askHermes } from '@/lib/hermes';

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
const SLOT_EMOJI: Record<MealSlot, string> = { breakfast: '☀️', lunch: '🌤️', dinner: '🌙' };

export default function MealsPage() {
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const { meals, loading, addMeal, removeMeal } = useMeals(weekStart);
  const { addFromRecipe } = useShopping();
  const { users } = useFamilyMembers();
  const { events } = useEvents();

  const [picking, setPicking] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [search, setSearch] = useState('');
  const [hermesLoading, setHermesLoading] = useState(false);
  const [hermesSuggestion, setHermesSuggestion] = useState('');

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i)),
    [weekStart],
  );

  const getMeal = (date: string, slot: MealSlot) =>
    meals.find(m => m.date === date && m.slot === slot);

  const filteredRecipes = search.trim() ? searchRecipes(search) : BUILT_IN_RECIPES;

  async function handlePickRecipe(recipe: Recipe) {
    if (!picking) return;
    await addMeal({ date: picking.date, slot: picking.slot, recipeId: recipe.id, servings: recipe.servings });
    await addFromRecipe(recipe.ingredients, recipe.id, picking.date);
    setPicking(null);
    setSearch('');
  }

  async function handleRemove(date: string, slot: MealSlot) {
    const meal = getMeal(date, slot);
    if (meal) await removeMeal(meal.id);
  }

  async function askHermesForSuggestions() {
    setHermesLoading(true);
    setHermesSuggestion('');
    try {
      const plannedNames = meals.map(m => {
        const r = getRecipeById(m.recipeId);
        return r ? `${m.date} ${m.slot}: ${r.name}` : null;
      }).filter(Boolean);

      const weekEvents = events.filter(e => {
        const d = e.date?.split('T')[0] ?? '';
        return d >= weekStart && d < shiftDate(weekStart, 7);
      });

      const { content } = await askHermes(
        [{ role: 'user', content: `Based on this week's schedule and the meals already planned, what are 3 meal suggestions for the remaining empty slots? Consider the family's schedule and preferences. Keep it brief and specific.` }],
        {
          users,
          events: weekEvents,
          meals: plannedNames,
          date: `Week of ${weekStart}`,
        },
      );
      setHermesSuggestion(content);
    } catch {
      setHermesSuggestion('Could not reach Hermes right now. Set OPENROUTER_API_KEY in Vercel env vars.');
    } finally {
      setHermesLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-400 border-2 border-black rounded-xl flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <ChefHat className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Meal Planner</h1>
              <p className="text-xs text-slate-500">Plan meals · auto-fill shopping list</p>
            </div>
          </div>
          <button
            onClick={askHermesForSuggestions}
            disabled={hermesLoading}
            className="flex items-center gap-2 bg-purple-500 text-white text-sm font-bold px-4 py-2 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {hermesLoading ? 'Thinking…' : 'Ask Hermes'}
          </button>
        </div>

        {/* Hermes suggestion */}
        <AnimatePresence>
          {hermesSuggestion && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-4 bg-purple-50 border-2 border-purple-300 rounded-xl text-sm text-slate-700 whitespace-pre-line"
            >
              <p className="font-bold text-purple-700 mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Hermes suggests:</p>
              {hermesSuggestion}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Week nav */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setWeekStart(shiftDate(weekStart, -7))}
            className="p-2 bg-white border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-slate-700 text-sm">
            Week of {format(parseISO(weekStart), 'MMM d, yyyy')}
          </span>
          <button
            onClick={() => setWeekStart(shiftDate(weekStart, 7))}
            className="p-2 bg-white border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-12 text-slate-400">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  <th className="w-24 p-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wide"></th>
                  {weekDays.map(d => (
                    <th key={d} className="p-2 text-center">
                      <div className="text-xs font-bold text-slate-500 uppercase">{format(parseISO(d), 'EEE')}</div>
                      <div className={`text-lg font-black ${d === new Date().toISOString().split('T')[0] ? 'text-orange-500' : 'text-slate-800'}`}>
                        {format(parseISO(d), 'd')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOTS.map(slot => (
                  <tr key={slot} className="border-t border-slate-200">
                    <td className="p-2 align-top">
                      <span className="text-xs font-bold text-slate-500 uppercase">{SLOT_EMOJI[slot]} {slot}</span>
                    </td>
                    {weekDays.map(date => {
                      const meal = getMeal(date, slot);
                      const recipe = meal ? getRecipeById(meal.recipeId) : null;
                      return (
                        <td key={date} className="p-1 align-top">
                          {recipe ? (
                            <motion.div
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="bg-white border-2 border-black rounded-xl p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] relative group"
                            >
                              <span className="text-lg">{recipe.emoji}</span>
                              <p className="text-xs font-bold text-slate-800 leading-tight mt-0.5">{recipe.name}</p>
                              <p className="text-[10px] text-slate-400">{recipe.prepMinutes + recipe.cookMinutes}min</p>
                              <button
                                onClick={() => handleRemove(date, slot)}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:text-red-500"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </motion.div>
                          ) : (
                            <button
                              onClick={() => { setPicking({ date, slot }); setSearch(''); }}
                              className="w-full h-16 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center hover:border-orange-400 hover:bg-orange-50 transition-all group"
                            >
                              <Plus className="w-4 h-4 text-slate-300 group-hover:text-orange-400" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Shopping list nudge */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Ingredients are automatically added to your shopping list when you plan a meal.</span>
        </div>
      </div>

      {/* Recipe picker modal */}
      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) { setPicking(null); setSearch(''); } }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="bg-white border-2 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full max-w-lg max-h-[80vh] flex flex-col"
            >
              <div className="p-4 border-b border-slate-200">
                <p className="font-black text-slate-900 mb-3">
                  {SLOT_EMOJI[picking.slot]} {format(parseISO(picking.date), 'EEEE, MMM d')} — {picking.slot}
                </p>
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search recipes…"
                  className="w-full border-2 border-black rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div className="overflow-y-auto p-3 grid grid-cols-2 gap-2">
                {filteredRecipes.map(recipe => (
                  <button
                    key={recipe.id}
                    onClick={() => handlePickRecipe(recipe)}
                    className="text-left p-3 bg-slate-50 border-2 border-slate-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all"
                  >
                    <span className="text-2xl">{recipe.emoji}</span>
                    <p className="font-bold text-sm text-slate-800 mt-1 leading-tight">{recipe.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{CATEGORY_LABELS[recipe.category]} · {recipe.prepMinutes + recipe.cookMinutes}min · {recipe.servings} servings</p>
                  </button>
                ))}
                {filteredRecipes.length === 0 && (
                  <div className="col-span-2 py-8 text-center text-slate-400 text-sm">No recipes found for &quot;{search}&quot;</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
