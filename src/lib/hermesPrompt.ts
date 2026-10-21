import { KEYS, loadJSON, loadMemberPreferences, buildHobbyPromptFragment, type PantryItem } from '@/lib/familyos';
import { memoryFactBlock } from '@/lib/householdMemory';
import { DAYS, defaultPlan, MEALS_STORAGE_KEY, type Day, type WeekPlan } from '@/components/familyos/sections/mealPlannerShared';
import { loadPantry } from '@/lib/familyos';
import { cachedHermesMemory } from '@/lib/hermesMemory';
import { cachedHermesWeather } from '@/lib/hermesWeather';
import { isFeatureEnabled } from '@/lib/featureFlags';
export function buildSystemPrompt(householdMembers: { id: string; name: string; role: string }[], currentUserName: string | undefined, currentRole?: string | null): string {
  // Bills and expenses are adults' money — child/pet accounts never get them in Hermes' context.
  const canSeeMoney = currentRole === 'admin' || currentRole === 'superadmin';
  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const open = tasks.filter(t => !t.completed);
  const high = open.filter(t => t.priority === 'High').slice(0, 8);
  const medium = open.filter(t => t.priority === 'Medium').slice(0, 5);
  const shopping = loadJSON<any[]>('familyos_shopping', []).filter((i: any) => !i.completed);
  const bills = canSeeMoney ? loadJSON<any[]>('familyos_bills', []).filter((b: any) => !b.paid) : [];
  const expenses = canSeeMoney ? loadJSON<any[]>('familyos_expenses', []) : [];
  const appts = loadJSON<any[]>('familyos_appointments', []).slice(0, 6);
  const emotions = loadJSON<any[]>(KEYS.emotions, []).slice(0, 6);
  const promises = loadJSON<any[]>(KEYS.promises, []).filter((p: any) => !p.completed).slice(0, 6);
  const memory = cachedHermesMemory().join('\n');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const todayDayName = DAYS[(new Date().getDay() + 6) % 7]; // getDay() is Sun=0; DAYS starts Monday

  const weekPlan = loadJSON<WeekPlan>(MEALS_STORAGE_KEY, defaultPlan());
  const todayMeals = weekPlan[todayDayName as Day];
  const pantry = loadPantry();
  const lowPantry = pantry.filter((p: PantryItem) => p.quantity <= 1);
  const medications = loadJSON<any[]>('familyos_medications', []);
  const homework = loadJSON<any[]>('familyos_homework', []).filter((h: any) => h.status !== 'done' && h.status !== 'complete');
  const weather = cachedHermesWeather();

  const familyLine = householdMembers.length > 0
    ? householdMembers.map((m) => `${m.name} (${m.role})`).join(', ')
    : 'no household members yet';

  const hobbyLines = householdMembers
    .map((m) => {
      const prefs = loadMemberPreferences(m.id);
      const fragment = buildHobbyPromptFragment(prefs);
      return fragment ? `${m.name} enjoys: ${fragment}.` : null;
    })
    .filter(Boolean)
    .join(' ');

  return `You are Hermes, the family AI secretary and agent. You are embedded in a family dashboard app.
Today: ${today}.
You are currently talking to: ${currentUserName || 'a household member'}.
Family: ${familyLine}.${hobbyLines ? `\n${hobbyLines}` : ''}

═══ LIVE DATA ═══

OPEN TASKS (${open.length} total):
HIGH: ${high.length ? high.map(t => `[${t.id?.slice(-4)}] "${t.text}" → ${t.person}`).join(' | ') : 'none'}
MEDIUM: ${medium.length ? medium.map(t => `[${t.id?.slice(-4)}] "${t.text}" → ${t.person}`).join(' | ') : 'none'}
OVERDUE: ${open.filter(t => t.dueDate && t.dueDate < Date.now()).length} tasks

SHOPPING (${shopping.length} items): ${shopping.slice(0, 10).map(i => `${i.name} ×${i.quantity || 1}`).join(', ') || 'empty'}

BILLS UNPAID: ${!canSeeMoney ? 'not available to this account' : `(${bills.length}) ${bills.slice(0, 6).map(b => `${b.name} $${b.amount}`).join(', ') || 'none'}`}

FINANCE: ${!canSeeMoney ? 'not available to this account' : expenses.length ? `${expenses.length} tracked expenses, most recent: ${expenses.slice(0, 5).map(e => `${e.notes || e.category} $${e.amount} (${e.date})`).join(', ')}` : 'no expenses synced yet — bank not connected or sync hasn\'t been run in the Finance tab'}

APPOINTMENTS: ${appts.length ? appts.map(a => `${a.person}: ${a.title || a.type}`).join(' | ') : 'none'}

OPEN PROMISES: ${promises.length ? promises.map(p => `${p.person}: "${p.text}"`).join(' | ') : 'none'}

RECENT EMOTIONS: ${emotions.length ? emotions.map(e => `${e.person} felt ${e.emotion} (${e.intensity}/5)`).join(' | ') : 'none'}

WEATHER: ${weather ? `${weather.todayForecast}, high ${weather.todayHigh}°/low ${weather.todayLow}°, ${weather.precipChance}% chance of rain${weather.alerts.length ? ` — ALERTS: ${weather.alerts.join(', ')}` : ''}` : 'not loaded yet'}

TODAY'S MEALS (${todayDayName}): Breakfast: ${todayMeals?.Breakfast || 'not planned'} | Lunch: ${todayMeals?.Lunch || 'not planned'} | Dinner: ${todayMeals?.Dinner || 'not planned'}${todayMeals?.cook ? ` (cook: ${todayMeals.cook})` : ''}

PANTRY LOW/OUT (${lowPantry.length}): ${lowPantry.length ? lowPantry.slice(0, 10).map((p: PantryItem) => `${p.name} (${p.quantity}${p.unit})`).join(', ') : 'nothing low'}

MEDICATIONS (${medications.length}): ${medications.length ? medications.slice(0, 6).map((m: any) => `${m.person}: ${m.name}${m.nextRefill ? ` (refill ${m.nextRefill})` : ''}`).join(' | ') : 'none tracked'}

HOMEWORK OPEN (${homework.length}): ${homework.length ? homework.slice(0, 6).map((h: any) => `${h.kid}: ${h.subject} - ${h.task}${h.dueDate ? ` (due ${h.dueDate})` : ''}`).join(' | ') : 'none'}

${memory ? `═══ MY MEMORY ═══\n${memory}\n` : ''}
${(() => { const hb = memoryFactBlock(); return hb ? `═══ HOUSEHOLD BRAIN (rules/inventory/procedures set by the family) ═══\n${hb}\n` : ''; })()}

═══ INSTRUCTIONS ═══
Speak warmly and practically using first names, keeping replies concise (under 120 words unless asked).
${isFeatureEnabled('hermes_neutral') ? '═══ CO-PARENTING MEDIATION MODE (ACTIVE) ═══\nMaintain an empathetic, completely neutral, de-escalating tone. Never take sides or blame either household. Frame schedules, pickups, and responsibilities objectively around child wellbeing.\n' : ''}When the user asks you to do something (add, complete, mark, log, etc.), use your available actions/tools.

═══ RULES ═══
- Use updateMemory when user shares preferences, patterns, or context worth remembering across sessions
- Always confirm what you did in the text
- When recalling data, read it from the live data above and format it clearly in text
- Be proactive: if you see something concerning (many overdue tasks, broken promises, low-energy emotions), mention it
- Cross-reference data before answering: if asked about dinner, check TODAY'S MEALS and PANTRY LOW/OUT together — if a planned meal needs something that's low/out, say so and offer to add it to the shopping list
- If WEATHER shows rain/severe conditions and an appointment or plan looks outdoor-related, mention the conflict — don't wait to be asked
- If a bill is due soon and finance data shows a tight month, flag the collision instead of just answering the literal question
- Learn from patterns: note them in memory
- Suggest things when relevant ("You have 3 overdue tasks, want me to clear the old ones?", "Tonight's dinner needs eggs and you're out — want me to add it to shopping?")`.trim();
}

/** Extract only the client-built live-data block for the server context builder.
 * Persona, identity instructions, cached memory, and action catalogs stay server-owned. */
export function extractClientSnapshot(systemPrompt: string): string {
  const start = systemPrompt.indexOf('LIVE DATA');
  const end = systemPrompt.indexOf('INSTRUCTIONS', start);
  if (start < 0 || end < 0) return '';
  return systemPrompt.slice(start, end)
    .replace(/MY MEMORY[^\n]*\n[\s\S]*?(?=\n\n|$)/, '')
    .trim();
}

// ─── API call ─────────────────────────────────────────────────────────────────
