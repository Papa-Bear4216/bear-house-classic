import { loadJSON, saveJSON, uid } from './familyos';
import { MEALS_STORAGE_KEY } from '@/components/familyos/sections/MealPlanner';

export interface DomainSpec {
  domain: string;
  storageKey: string;
  matchField: string;
  fields: string[];
}

export const DOMAIN_REGISTRY: DomainSpec[] = [
  { domain: 'shopping', storageKey: 'familyos_shopping', matchField: 'name',
    fields: ['name', 'category', 'assignedTo', 'quantity'] },
  { domain: 'bills', storageKey: 'familyos_bills', matchField: 'name',
    fields: ['name', 'amount', 'dueDate', 'recurring'] },
  { domain: 'appointments', storageKey: 'familyos_appointments', matchField: 'type',
    fields: ['person', 'type', 'doctor', 'date', 'notes'] },
  { domain: 'pantry', storageKey: 'familyos_pantry', matchField: 'name',
    fields: ['name', 'quantity', 'unit', 'category'] },
  { domain: 'messages', storageKey: 'familyos_messages', matchField: 'text',
    fields: ['author', 'text'] },
  { domain: 'askParents', storageKey: 'familyos_ask_parents', matchField: 'request',
    fields: ['kid', 'request', 'status'] },
  { domain: 'moments', storageKey: 'familyos_moments', matchField: 'caption',
    fields: ['caption', 'emoji', 'date', 'author'] },
  { domain: 'bucketList', storageKey: 'familyos_bucket_list', matchField: 'text',
    fields: ['text'] },
  { domain: 'watchlist', storageKey: 'familyos_watchlist', matchField: 'title',
    fields: ['title', 'type', 'wantsToWatch'] },
  { domain: 'games', storageKey: 'familyos_games', matchField: 'name',
    fields: ['name'] },
  { domain: 'medications', storageKey: 'familyos_medications', matchField: 'name',
    fields: ['person', 'name', 'dosage', 'frequency', 'nextRefill', 'notes'] },
  { domain: 'petLog', storageKey: 'familyos_lucy', matchField: 'type',
    fields: ['type', 'date', 'notes', 'nextDue'] },
  { domain: 'homework', storageKey: 'familyos_homework', matchField: 'task',
    fields: ['kid', 'subject', 'task', 'dueDate', 'status'] },
  { domain: 'grades', storageKey: 'familyos_grades', matchField: 'subject',
    fields: ['kid', 'subject', 'grade', 'date', 'notes'] },
  { domain: 'kidsActivities', storageKey: 'familyos_activities_kids', matchField: 'name',
    fields: ['kid', 'name', 'day', 'time', 'location'] },
  { domain: 'allowance', storageKey: 'familyos_allowance', matchField: 'reason',
    fields: ['kid', 'amount', 'type', 'reason', 'date'] },
  { domain: 'expenses', storageKey: 'familyos_expenses', matchField: 'notes',
    fields: ['amount', 'category', 'paidBy', 'date', 'notes'] },
  { domain: 'budget', storageKey: 'familyos_budget', matchField: 'name',
    fields: ['name', 'budgeted', 'month'] },
  { domain: 'homeMaintenance', storageKey: 'familyos_home_maintenance', matchField: 'item',
    fields: ['item', 'category', 'lastDone', 'nextDue', 'notes'] },
  { domain: 'qualityActivities', storageKey: 'quality_activities', matchField: 'name',
    fields: ['name', 'person', 'duration', 'scheduledAt'] },
  { domain: 'promises', storageKey: 'family_promises', matchField: 'text',
    fields: ['text', 'person', 'priority', 'dueDate'] },
  { domain: 'emotions', storageKey: 'emotion_logs', matchField: 'feeling',
    fields: ['person', 'feeling', 'context', 'intensity', 'category'] },
];

function pick(obj: Record<string, any>, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function runGenericAction(
  domain: string,
  op: 'add' | 'update' | 'delete' | 'clear',
  params: Record<string, any>
): { result: string; ok: boolean } {
  const spec = DOMAIN_REGISTRY.find((d) => d.domain === domain);
  if (!spec) return { result: `Unknown domain: "${domain}"`, ok: false };

  if (op === 'clear') {
    saveJSON(spec.storageKey, []);
    return { result: `Cleared ${spec.domain}`, ok: true };
  }

  const items = loadJSON<any[]>(spec.storageKey, []);

  if (op === 'add') {
    const item = { id: uid(), createdAt: Date.now(), source: 'hermes', ...pick(params, spec.fields) };
    saveJSON(spec.storageKey, [item, ...items]);
    return { result: `Added to ${spec.domain}: "${item[spec.matchField] ?? item.id}"`, ok: true };
  }

  const match = (params.match || '').toLowerCase();
  const idx = items.findIndex(
    (i) => (params.id && i.id === params.id) || (match && String(i[spec.matchField] ?? '').toLowerCase().includes(match))
  );
  if (idx === -1) return { result: `No ${spec.domain} item matching "${params.match ?? params.id}"`, ok: false };

  if (op === 'delete') {
    const [removed] = items.splice(idx, 1);
    saveJSON(spec.storageKey, items);
    return { result: `Removed from ${spec.domain}: "${removed[spec.matchField] ?? removed.id}"`, ok: true };
  }

  // update
  items[idx] = { ...items[idx], ...pick(params, spec.fields) };
  saveJSON(spec.storageKey, items);
  return { result: `Updated ${spec.domain}: "${items[idx][spec.matchField] ?? items[idx].id}"`, ok: true };
}

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const VALID_MEALS = ['Breakfast', 'Lunch', 'Dinner'];
const EMPTY_DAY = { Breakfast: '', Lunch: '', Dinner: '', cook: '' };

function defaultWeekPlan(): Record<string, any> {
  const plan: Record<string, any> = {};
  VALID_DAYS.forEach((d) => { plan[d] = { ...EMPTY_DAY }; });
  return plan;
}

export interface MealPlanRecipeInput {
  description?: string;
  time?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  servings?: number;
  ingredients?: { name: string; quantity: number; unit: string }[];
  steps?: string[];
}

/** Sets one meal slot (day+meal) in the week plan, optionally assigning a
 * cook and/or a full recipe. Without `recipe.ingredients`, this only sets
 * the plain meal-name text — no recipe card, Mark Cooked, or
 * Add-to-shopping button will appear for it (matching how manually typing
 * a meal name in the UI behaves). Pass ingredients (at minimum) for the
 * meal to behave exactly like one planned via the UI's own AI-suggestion
 * flow — MealPlanner.tsx renders both sources identically.
 *
 * Kept independent of MealPlanner.tsx's own defaultPlan/DAYS/MEALS to
 * avoid a cross-module dependency for a single small action — this is the
 * only writer of familyos_meals outside MealPlanner.tsx itself, and the
 * shape (Record<Day, {Breakfast,Lunch,Dinner,cook,cookedIngredients,
 * recipeDetail,...}>) is stable. */
export function setMealPlanAction(
  day: string, meal: string, name: string, cook?: string, recipe?: MealPlanRecipeInput
): { result: string; ok: boolean } {
  if (!VALID_DAYS.includes(day) || !VALID_MEALS.includes(meal)) {
    return { result: `Invalid day/meal: "${day}" / "${meal}"`, ok: false };
  }
  const weekPlan = loadJSON<Record<string, any>>(MEALS_STORAGE_KEY, defaultWeekPlan());
  const updatedDay: Record<string, any> = { ...weekPlan[day], [meal]: name || '' };
  if (cook) updatedDay.cook = cook;

  if (recipe?.ingredients?.length) {
    updatedDay.cookedIngredients = { ...updatedDay.cookedIngredients, [meal]: recipe.ingredients };
    updatedDay.recipeDetail = {
      ...updatedDay.recipeDetail,
      [meal]: {
        description: recipe.description || '',
        time: recipe.time || '',
        difficulty: recipe.difficulty || 'Easy',
        servings: recipe.servings || 4,
        steps: recipe.steps || [],
      },
    };
  }

  saveJSON(MEALS_STORAGE_KEY, { ...weekPlan, [day]: updatedDay });
  return { result: `Set ${day} ${meal}: "${name}"${cook ? ` (${cook} cooking)` : ''}${recipe?.ingredients?.length ? ` with ${recipe.ingredients.length} ingredients` : ''}`, ok: true };
}
