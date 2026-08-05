/**
 * api/daily-brain.ts — background household checks that need no user input.
 *
 * Not its own Vercel cron (the account may be on Hobby, capped at 2 crons)
 * — instead runDailyBrainChecks() is called directly from api/finance-sync.ts's
 * existing daily cron, one household at a time, right after that household's
 * finance sync. No new cron slot, no new schedule to manage.
 *
 * Four checks per household, each idempotent (safe to run daily without
 * creating duplicates):
 *   1. Pantry vs. today/tomorrow's planned meals -> missing ingredients
 *      auto-added to the shopping list.
 *   2. Bills due within 3 days with no matching open task -> task created.
 *   3. 3+ negative emotions logged for the same person in the last 7 days
 *      -> a household_memory note, so Hermes already knows next time
 *      without anyone telling it.
 *   4. Car maintenance due within 7 days (per car's most recent logged
 *      entry's nextDueDate) with no matching open task -> task created.
 *   5. For each member who's connected Gmail (api/gmail-server-scan.ts),
 *      bill/appointment-shaped emails become tasks ASSIGNED TO THAT MEMBER
 *      specifically — never anonymized to "General" and never written to
 *      household_memory. See gmail-server-scan.ts's PRIVACY BOUNDARY
 *      comment: a task text derived from one member's inbox is that
 *      member's own actionable item (same as if they'd typed it
 *      themselves), not a household-wide broadcast of their email content.
 */
import { dbGet, dbSet, dbAddHouseholdMemory, dbGetHouseholdMembersByHouseholdId, dbGetHouseholdGmailStatus } from './_db.js';
import { scanMemberGmail } from './gmail-server-scan.js';

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

async function checkCarMaintenanceDue(householdId: string): Promise<string[]> {
  const cars: any[] = (await dbGet('familyos_cars', householdId)) ?? [];
  const tasks: any[] = (await dbGet('household_tasks', householdId)) ?? [];
  const now = Date.now();
  const soon = now + 7 * 86400000;

  const added: string[] = [];
  const newTasks: any[] = [];

  for (const car of cars) {
    if (car.deletedAt) continue;
    // Most recent entry with a nextDueDate set — entries are already
    // stored newest-first (see CarMaintenance.tsx addEntry).
    const entryWithDue = (car.entries || []).find((e: any) => e.nextDueDate);
    if (!entryWithDue?.nextDueDate) continue;
    const dueTs = new Date(entryWithDue.nextDueDate).getTime();
    if (isNaN(dueTs) || dueTs > soon || dueTs < now) continue;

    const taskText = `${entryWithDue.type} due for ${car.name}`;
    const alreadyExists = tasks.some((t: any) => !t.completed && t.text?.toLowerCase() === taskText.toLowerCase());
    if (alreadyExists) continue;
    newTasks.push({
      id: uid(), createdAt: Date.now(), completed: false, source: 'daily-brain',
      text: taskText, person: 'General', priority: 'Medium', category: 'Maintenance',
      dueEstimate: 'This Week', dueDate: dueTs,
    });
    added.push(car.name);
  }

  if (newTasks.length) await dbSet('household_tasks', householdId, [...newTasks, ...tasks]);
  return added;
}

async function checkConnectedGmail(householdId: string): Promise<string[]> {
  const gmailStatus = await dbGetHouseholdGmailStatus(householdId);
  const connectedIds = gmailStatus.filter(m => m.gmail_connected_email).map(m => m.id);
  if (!connectedIds.length) return [];

  const members = await dbGetHouseholdMembersByHouseholdId(householdId);
  const memberById = new Map(members.map(m => [m.id, m]));
  const tasks: any[] = (await dbGet('household_tasks', householdId)) ?? [];
  const newTasks: any[] = [];
  const added: string[] = [];

  for (const memberId of connectedIds) {
    const member = memberById.get(memberId);
    if (!member) continue;
    const hits = await scanMemberGmail(memberId);
    if (!hits) continue; // token revoked or not actually connected

    for (const hit of hits.slice(0, 5)) { // cap per member per run
      // Task text derived from THIS member's own email, assigned to THEM —
      // not anonymized to General, not written anywhere household-shared
      // beyond the task itself (which is already visible household-wide,
      // same as any task any member creates by hand).
      const taskText = hit.subject.slice(0, 120) || 'Check email';
      const alreadyExists = tasks.some((t: any) => !t.completed && t.text?.toLowerCase() === taskText.toLowerCase());
      if (alreadyExists) continue;
      newTasks.push({
        id: uid(), createdAt: Date.now(), completed: false, source: 'daily-brain-gmail',
        text: taskText, person: member.name, priority: 'Medium', category: 'General',
        dueEstimate: 'This Week',
      });
      added.push(`${member.name}: ${taskText}`);
    }
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
  shoppingAdded: string[]; tasksAdded: string[]; carMaintenanceAdded: string[]; gmailTasksAdded: string[]; emotionsFlagged: string[];
} | { error: string }> {
  try {
    const [shoppingAdded, tasksAdded, carMaintenanceAdded, gmailTasksAdded, emotionsFlagged] = await Promise.all([
      checkPantryVsMeals(householdId),
      checkBillsDueSoon(householdId),
      checkCarMaintenanceDue(householdId),
      checkConnectedGmail(householdId),
      checkEmotionPatterns(householdId),
    ]);
    return { shoppingAdded, tasksAdded, carMaintenanceAdded, gmailTasksAdded, emotionsFlagged };
  } catch (e: any) {
    return { error: e?.message || 'unknown error' };
  }
}
