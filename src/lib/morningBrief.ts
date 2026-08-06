// Deterministic "here's what needs attention" summary — shared by HermesChat's
// proactive greeting and the Dashboard's Morning Brief tile so both read the
// same live local data without duplicating the aggregation logic. No API call,
// no keys, updates itself as the household's data changes between visits.
import { KEYS, loadJSON, loadPantry } from './familyos';
import { cachedHermesWeather } from './hermesWeather';
import { defaultPlan, MEALS_STORAGE_KEY, DAYS, type Day, type WeekPlan } from '@/components/familyos/sections/mealPlannerShared';

export interface MorningBriefLine {
  emoji: string;
  text: string;
}

export function buildMorningBrief(): MorningBriefLine[] {
  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const open = tasks.filter((t: any) => !t.completed);
  const overdue = open.filter((t: any) => t.dueDate && t.dueDate < Date.now());
  const high = open.filter((t: any) => t.priority === 'High');
  const shopping = loadJSON<any[]>('familyos_shopping', []).filter((i: any) => !i.completed);
  const bills = loadJSON<any[]>('familyos_bills', []).filter((b: any) => !b.paid);
  const pantry = loadPantry();
  const lowPantry = pantry.filter((p: any) => p.quantity <= 1);
  const weather = cachedHermesWeather();
  const todayDayName = DAYS[(new Date().getDay() + 6) % 7]; // getDay() is Sun=0; DAYS starts Monday
  const weekPlan = loadJSON<WeekPlan>(MEALS_STORAGE_KEY, defaultPlan());
  const todayMeals = weekPlan[todayDayName as Day];

  const lines: MorningBriefLine[] = [];
  if (overdue.length > 0) lines.push({ emoji: '🔴', text: `${overdue.length} task${overdue.length > 1 ? 's' : ''} overdue${overdue.length === 1 && overdue[0].text ? ` — "${overdue[0].text}"` : ''}` });
  if (high.length > 0) lines.push({ emoji: '⚡', text: `${high.length} high-priority task${high.length > 1 ? 's' : ''} open` });
  if (shopping.length > 0) lines.push({ emoji: '🛒', text: `${shopping.length} item${shopping.length > 1 ? 's' : ''} on the shopping list` });
  if (bills.length > 0) lines.push({ emoji: '💸', text: `${bills.length} bill${bills.length > 1 ? 's' : ''} unpaid` });
  if (lowPantry.length > 0) lines.push({ emoji: '🥫', text: `Pantry running low (${lowPantry.slice(0, 5).map((p: any) => p.name).join(', ')})` });
  if (weather?.alerts?.length) lines.push({ emoji: '⚠️', text: `Weather alert: ${weather.alerts.join(', ')}` });
  if (todayMeals?.Dinner && !todayMeals.Dinner.toLowerCase().includes('leftover')) {
    lines.push({ emoji: '🍽️', text: `Dinner tonight: ${todayMeals.Dinner}${todayMeals.cook ? ` (cook: ${todayMeals.cook})` : ''}` });
  }
  return lines;
}
