// Split from MealPlanner.tsx so HermesChat.tsx and hermesActions.ts can
// reference this shared plan logic without statically pulling in the whole
// (lazy-loaded) MealPlanner component.

const STORAGE_KEY = 'familyos_meals';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type Day = typeof DAYS[number];
export const MEALS = ['Breakfast', 'Lunch', 'Dinner'] as const;
export type MealType = typeof MEALS[number];

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
  recipeDetail?: Partial<Record<MealType, RecipeDetail>>;
}
export type WeekPlan = Record<Day, DayPlan>;
const EMPTY_DAY: DayPlan = { Breakfast: '', Lunch: '', Dinner: '', cook: '' };

export function defaultPlan(): WeekPlan {
  const plan = {} as WeekPlan;
  DAYS.forEach(d => { plan[d] = { ...EMPTY_DAY }; });
  return plan;
}

export const MEALS_STORAGE_KEY = STORAGE_KEY;

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
