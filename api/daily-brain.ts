/**
 * api/daily-brain.ts — background household checks that need no user input.
 *
 * Not its own Vercel cron (the account may be on Hobby, capped at 2 crons)
 * — instead runDailyBrainChecks() is called directly from api/finance-sync.ts's
 * existing daily cron, one household at a time, right after that household's
 * finance sync. No new cron slot, no new schedule to manage.
 *
 * Three checks per household, each idempotent (safe to run daily without
 * creating duplicates):
 *   1. Pantry vs. today/tomorrow's planned meals -> missing ingredients
 *      auto-added to the shopping list.
 *   2. Bills due within 3 days with no matching open task -> task created.
 *   3. 3+ negative emotions logged for the same person in the last 7 days
 *      -> a household_memory note, so Hermes already knows next time
 *      without anyone telling it.
 */
import { dbGet, dbSet, dbAddHouseholdMemory } from './_db.js';

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type Day = typeof DAYS[number];
type MealType = 'Breakfast' | 'Lunch' | 'Dinner';
const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner'];

function dayName(offset: number): Day {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return DAYS[(d.getDay() + 6) % 7]; // getDay() is Sun=0; DAYS starts Monday
}

async function checkPantryVsMeals(householdId: string): Promise<string[]> {
  const weekPlan: any = await dbGet('familyos_meals', householdId);
  if (!weekPlan) return [];
  const pantry: any[] = (await dbGet('familyos_pantry', householdId)) ?? [];
  const shopping: any[] = (await dbGet('familyos_shopping', householdId)) ?? [];
  const shoppingNames = new Set(shopping.filter((i: any) => !i.completed).map((i: any) => (i.name || '').toLowerCase()));

  const added: string[] = [];
  const newItems: any[] = [];

  for (const offset of [0, 1]) { // today + tomorrow only — don't flood the list for the whole week
    const day = weekPlan[dayName(offset)];
    if (!day) continue;
    for (const meal of MEALS) {
      const ingredients: { name: string; quantity: number; unit: string }[] = day.cookedIngredients?.[meal] || [];
      for (const ing of ingredients) {
        const nameLower = ing.name.toLowerCase();
        if (shoppingNames.has(nameLower)) continue;
        const pantryItem = pantry.find((p: any) => p.name.toLowerCase() === nameLower);
        const have = pantryItem?.quantity ?? 0;
        if (have >= (ing.quantity || 1)) continue; // already have enough
        shoppingNames.add(nameLower); // dedupe within this run too
        newItems.push({
          id: uid(), createdAt: Date.now(), completed: false, source: 'daily-brain',
          name: ing.name, category: 'Groceries', assignedTo: 'General', quantity: String(ing.quantity || 1),
        });
        added.push(ing.name);
      }
    }
  }

  if (newItems.length) await dbSet('familyos_shopping', householdId, [...newItems, ...shopping]);
  return added;
}

async function checkBillsDueSoon(householdId: string): Promise<string[]> {
  const bills: any[] = (await dbGet('familyos_bills', householdId)) ?? [];
  const tasks: any[] = (await dbGet('household_tasks', householdId)) ?? [];
  const now = Date.now();
  const soon = now + 3 * 86400000;

  const added: string[] = [];
  const newTasks: any[] = [];

  for (const bill of bills) {
    if (bill.paid || !bill.dueDate || bill.dueDate > soon || bill.dueDate < now) continue;
    const taskText = `Pay ${bill.name}`;
    const alreadyExists = tasks.some((t: any) => !t.completed && t.text?.toLowerCase() === taskText.toLowerCase());
    if (alreadyExists) continue;
    newTasks.push({
      id: uid(), createdAt: Date.now(), completed: false, source: 'daily-brain',
      text: taskText, person: 'General', priority: 'High', category: 'General',
      dueEstimate: 'This Week', dueDate: bill.dueDate,
    });
    added.push(bill.name);
  }

  if (newTasks.length) await dbSet('household_tasks', householdId, [...newTasks, ...tasks]);
  return added;
}

async function checkEmotionPatterns(householdId: string): Promise<string[]> {
  const emotions: any[] = (await dbGet('emotion_logs', householdId)) ?? [];
  const NEGATIVE = ['Frustration', 'Concern', 'Anxiety', 'Confusion'];
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = emotions.filter((e: any) => e.createdAt >= weekAgo && NEGATIVE.includes(e.category));

  const byPerson = new Map<string, number>();
  for (const e of recent) byPerson.set(e.person, (byPerson.get(e.person) || 0) + 1);

  const flagged: string[] = [];
  for (const [person, count] of byPerson) {
    if (count < 3) continue;
    const note = `[${new Date().toLocaleDateString()}] ${person} logged ${count} negative emotions this week — worth checking in gently, don't just push tasks at them.`;
    await dbAddHouseholdMemory(householdId, note, 'auto');
    flagged.push(person);
  }
  return flagged;
}

export async function runDailyBrainChecks(householdId: string): Promise<{
  shoppingAdded: string[]; tasksAdded: string[]; emotionsFlagged: string[];
} | { error: string }> {
  try {
    const [shoppingAdded, tasksAdded, emotionsFlagged] = await Promise.all([
      checkPantryVsMeals(householdId),
      checkBillsDueSoon(householdId),
      checkEmotionPatterns(householdId),
    ]);
    return { shoppingAdded, tasksAdded, emotionsFlagged };
  } catch (e: any) {
    return { error: e?.message || 'unknown error' };
  }
}
