import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bot, ChevronDown, CheckCircle2, AlertCircle, Zap, Brain } from 'lucide-react';
import { KEYS, loadJSON, saveJSON, uid, loadMemberPreferences, buildHobbyPromptFragment } from '@/lib/familyos';
import { memoryFactBlock } from '@/lib/householdMemory';
import { useAppContext } from '@/contexts/AppContext';
import { getAccessToken } from '@/lib/householdAuth';
import { defaultPlan, MEALS_STORAGE_KEY, applyMealCooked, type Day, type MealType, type WeekPlan } from '@/components/familyos/sections/MealPlanner';
import { CARS_STORAGE_KEY } from '@/components/familyos/sections/CarMaintenance';
import { runGenericAction, setMealPlanAction } from '@/lib/hermesActions';
import { loadPantry, decrementPantry, savePantry } from '@/lib/familyos';

// ─── Action types ────────────────────────────────────────────────────────────
type ActionType =
  | 'addTask' | 'completeTask' | 'uncompleteTask' | 'deleteTask'
  | 'addShopping' | 'completeShoppingItem'
  | 'addBill' | 'markBillPaid'
  | 'addAppointment'
  | 'addPromise' | 'completePromise'
  | 'logEmotion'
  | 'updateMemory'
  | 'clearWeekMeals' | 'setMealPlan'
  | 'genericAction' | 'markMealCooked' | 'addCarMaintenanceEntry';

interface ActionParams extends Record<string, any> {}

interface Action {
  type: ActionType;
  params: ActionParams;
}

interface ExecutedAction extends Action {
  result: string;
  ok: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
  actions?: ExecutedAction[];
}

interface HermesResponse {
  text: string;
  actions?: Action[];
}

// ─── Action executor ─────────────────────────────────────────────────────────
function executeAction(action: Action, defaultPerson: string): { result: string; ok: boolean } {
  try {
    const p = action.params;

    // ── Tasks ──────────────────────────────────────────────────────────────
    if (action.type === 'addTask') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      const task = {
        id: uid(), createdAt: Date.now(), completed: false, source: 'hermes',
        text: p.text || 'Untitled task',
        person: p.person || defaultPerson,
        priority: p.priority || 'Medium',
        category: p.category || 'General',
        dueEstimate: p.dueEstimate || 'No Deadline',
        dueDate: p.dueDate || null,
      };
      saveJSON(KEYS.tasks, [task, ...tasks]);
      return { result: `Added task: "${task.text}" for ${task.person}`, ok: true };
    }

    if (action.type === 'completeTask') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      const match = (p.match || '').toLowerCase();
      const idx = tasks.findIndex(t => !t.completed && (t.id === p.id || t.text?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `No open task matching "${p.match}"`, ok: false };
      tasks[idx] = { ...tasks[idx], completed: true, completedAt: Date.now(), completedBy: p.person || 'Hermes' };
      saveJSON(KEYS.tasks, tasks);
      return { result: `Completed: "${tasks[idx].text}"`, ok: true };
    }

    if (action.type === 'uncompleteTask') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      const match = (p.match || '').toLowerCase();
      const idx = tasks.findIndex(t => t.completed && (t.id === p.id || t.text?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `No completed task matching "${p.match}"`, ok: false };
      tasks[idx] = { ...tasks[idx], completed: false, completedAt: null };
      saveJSON(KEYS.tasks, tasks);
      return { result: `Reopened: "${tasks[idx].text}"`, ok: true };
    }

    if (action.type === 'deleteTask') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      const match = (p.match || '').toLowerCase();
      const before = tasks.length;
      const after = tasks.filter(t => t.id !== p.id && !t.text?.toLowerCase().includes(match));
      saveJSON(KEYS.tasks, after);
      return { result: `Removed ${before - after.length} task(s)`, ok: true };
    }

    // ── Shopping ───────────────────────────────────────────────────────────
    if (action.type === 'addShopping') {
      const items = loadJSON<any[]>('familyos_shopping', []);
      const item = {
        id: uid(), createdAt: Date.now(), completed: false, source: 'hermes',
        name: p.name || 'Unknown item',
        category: p.category || 'General',
        quantity: p.quantity || '1',
        assignedTo: p.assignedTo || 'General',
      };
      saveJSON('familyos_shopping', [item, ...items]);
      return { result: `Added to shopping: "${item.name}" ×${item.quantity}`, ok: true };
    }

    if (action.type === 'completeShoppingItem') {
      const items = loadJSON<any[]>('familyos_shopping', []);
      const match = (p.match || '').toLowerCase();
      const idx = items.findIndex(i => !i.completed && (i.id === p.id || i.name?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `Item not found: "${p.match}"`, ok: false };
      items[idx] = { ...items[idx], completed: true, completedAt: Date.now() };
      saveJSON('familyos_shopping', items);
      return { result: `Got "${items[idx].name}" ✓`, ok: true };
    }

    // ── Bills ──────────────────────────────────────────────────────────────
    if (action.type === 'addBill') {
      const bills = loadJSON<any[]>('familyos_bills', []);
      const bill = {
        id: uid(), createdAt: Date.now(), paid: false, source: 'hermes',
        name: p.name || 'Unnamed bill',
        amount: typeof p.amount === 'number' ? p.amount : parseFloat(p.amount) || 0,
        dueDate: p.dueDate || null,
        recurring: p.recurring || false,
        category: p.category || 'General',
      };
      saveJSON('familyos_bills', [bill, ...bills]);
      return { result: `Added bill: "${bill.name}" $${bill.amount}`, ok: true };
    }

    if (action.type === 'markBillPaid') {
      const bills = loadJSON<any[]>('familyos_bills', []);
      const match = (p.match || '').toLowerCase();
      const idx = bills.findIndex(b => !b.paid && (b.id === p.id || b.name?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `Unpaid bill not found: "${p.match}"`, ok: false };
      bills[idx] = { ...bills[idx], paid: true, paidAt: Date.now() };
      saveJSON('familyos_bills', bills);
      return { result: `Marked paid: "${bills[idx].name}"`, ok: true };
    }

    // ── Appointments ───────────────────────────────────────────────────────
    if (action.type === 'addAppointment') {
      const appts = loadJSON<any[]>('familyos_appointments', []);
      const appt = {
        id: uid(), createdAt: Date.now(), source: 'hermes',
        person: p.person || defaultPerson,
        title: p.title || p.type || 'Appointment',
        type: p.type || 'General',
        doctor: p.doctor || '',
        date: p.date ? new Date(p.date).getTime() : null,
        notes: p.notes || '',
      };
      saveJSON('familyos_appointments', [appt, ...appts]);
      return { result: `Added appointment: "${appt.title}" for ${appt.person}`, ok: true };
    }

    // ── Promises ───────────────────────────────────────────────────────────
    if (action.type === 'addPromise') {
      const promises = loadJSON<any[]>(KEYS.promises, []);
      const promise = {
        id: uid(), createdAt: Date.now(), completed: false, source: 'hermes',
        person: p.person || defaultPerson,
        text: p.text || 'Unnamed promise',
        dueDate: p.dueDate ? new Date(p.dueDate).getTime() : null,
        priority: p.priority || 'Medium',
      };
      saveJSON(KEYS.promises, [promise, ...promises]);
      return { result: `Logged promise to ${promise.person}: "${promise.text}"`, ok: true };
    }

    if (action.type === 'completePromise') {
      const promises = loadJSON<any[]>(KEYS.promises, []);
      const match = (p.match || '').toLowerCase();
      const idx = promises.findIndex(pr => !pr.completed && (pr.id === p.id || pr.text?.toLowerCase().includes(match)));
      if (idx === -1) return { result: `Promise not found: "${p.match}"`, ok: false };
      promises[idx] = { ...promises[idx], completed: true, completedAt: Date.now() };
      saveJSON(KEYS.promises, promises);
      return { result: `Promise kept: "${promises[idx].text}"`, ok: true };
    }

    // ── Emotions ───────────────────────────────────────────────────────────
    if (action.type === 'logEmotion') {
      const emotions = loadJSON<any[]>(KEYS.emotions, []);
      const entry = {
        id: uid(), createdAt: Date.now(), source: 'hermes',
        person: p.person || defaultPerson,
        emotion: p.emotion || 'neutral',
        intensity: Math.min(5, Math.max(1, parseInt(p.intensity) || 3)),
        note: p.note || '',
      };
      saveJSON(KEYS.emotions, [entry, ...emotions]);
      return { result: `Logged ${entry.emotion} (${entry.intensity}/5) for ${entry.person}`, ok: true };
    }

    // ── Meals ──────────────────────────────────────────────────────────────
    if (action.type === 'clearWeekMeals') {
      saveJSON(MEALS_STORAGE_KEY, defaultPlan());
      return { result: `Cleared the week's meal plan`, ok: true };
    }

    if (action.type === 'setMealPlan') {
      return setMealPlanAction(p.day, p.meal, p.name, p.cook, {
        description: p.description, time: p.time, difficulty: p.difficulty,
        servings: p.servings, ingredients: p.ingredients, steps: p.steps,
      });
    }

    if (action.type === 'markMealCooked') {
      const day = p.day as Day;
      const meal = p.meal as MealType;
      const weekPlan = loadJSON<WeekPlan>(MEALS_STORAGE_KEY, defaultPlan());
      const ingredients = weekPlan[day]?.cookedIngredients?.[meal];
      if (!ingredients) return { result: `No recipe recorded for ${day} ${meal} — plan it from the Meals tab first`, ok: false };

      const pantryItems = loadPantry();
      savePantry(decrementPantry(pantryItems, ingredients));

      const updated = applyMealCooked(weekPlan, day, meal, ingredients, ingredients.length, ingredients.length);
      saveJSON(MEALS_STORAGE_KEY, updated);
      return { result: `Marked ${meal} cooked for ${day} and updated the pantry`, ok: true };
    }

    // ── Cars ───────────────────────────────────────────────────────────────
    if (action.type === 'addCarMaintenanceEntry') {
      const cars = loadJSON<any[]>(CARS_STORAGE_KEY, []);
      const match = (p.carMatch || '').toLowerCase();
      const idx = cars.findIndex((c) => String(c.name ?? '').toLowerCase().includes(match));
      if (idx === -1) return { result: `No car matching "${p.carMatch}"`, ok: false };

      const entry = {
        id: uid(), createdAt: Date.now(),
        type: p.type || 'Other', date: p.date || '', mileage: p.mileage || '', notes: p.notes || '',
      };
      cars[idx] = { ...cars[idx], entries: [entry, ...(cars[idx].entries || [])] };
      saveJSON(CARS_STORAGE_KEY, cars);
      return { result: `Logged ${entry.type} for ${cars[idx].name}`, ok: true };
    }

    // ── Generic domain actions ────────────────────────────────────────────
    if (action.type === 'genericAction') {
      return runGenericAction(p.domain, p.op, p.params ?? p);
    }

    // ── Memory ─────────────────────────────────────────────────────────────
    if (action.type === 'updateMemory') {
      const existing = localStorage.getItem('hermes_memory') || '';
      const note = `[${new Date().toLocaleDateString()}] ${p.memory}`;
      const updated = existing ? `${existing}\n${note}` : note;
      // Keep last 3000 chars to avoid bloat
      localStorage.setItem('hermes_memory', updated.slice(-3000));
      return { result: `Memory updated`, ok: true };
    }

    return { result: `Unknown action: ${action.type}`, ok: false };
  } catch (e: any) {
    return { result: `Error: ${e?.message}`, ok: false };
  }
}

// ─── Context builder ─────────────────────────────────────────────────────────
function buildSystemPrompt(householdMembers: { id: string; name: string; role: string }[], currentUserName: string | undefined): string {
  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const open = tasks.filter(t => !t.completed);
  const high = open.filter(t => t.priority === 'High').slice(0, 8);
  const medium = open.filter(t => t.priority === 'Medium').slice(0, 5);
  const shopping = loadJSON<any[]>('familyos_shopping', []).filter((i: any) => !i.completed);
  const bills = loadJSON<any[]>('familyos_bills', []).filter((b: any) => !b.paid);
  const expenses = loadJSON<any[]>('familyos_expenses', []);
  const appts = loadJSON<any[]>('familyos_appointments', []).slice(0, 6);
  const emotions = loadJSON<any[]>(KEYS.emotions, []).slice(0, 6);
  const promises = loadJSON<any[]>(KEYS.promises, []).filter((p: any) => !p.completed).slice(0, 6);
  const memory = localStorage.getItem('hermes_memory') || '';
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

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

BILLS UNPAID (${bills.length}): ${bills.slice(0, 6).map(b => `${b.name} $${b.amount}`).join(', ') || 'none'}

FINANCE: ${expenses.length ? `${expenses.length} tracked expenses, most recent: ${expenses.slice(0, 5).map(e => `${e.notes || e.category} $${e.amount} (${e.date})`).join(', ')}` : 'no expenses synced yet — bank not connected or sync hasn\'t been run in the Finance tab'}

APPOINTMENTS: ${appts.length ? appts.map(a => `${a.person}: ${a.title || a.type}`).join(' | ') : 'none'}

OPEN PROMISES: ${promises.length ? promises.map(p => `${p.person}: "${p.text}"`).join(' | ') : 'none'}

RECENT EMOTIONS: ${emotions.length ? emotions.map(e => `${e.person} felt ${e.emotion} (${e.intensity}/5)`).join(' | ') : 'none'}

${memory ? `═══ MY MEMORY ═══\n${memory}\n` : ''}
${(() => { const hb = memoryFactBlock(); return hb ? `═══ HOUSEHOLD BRAIN (rules/inventory/procedures set by the family) ═══\n${hb}\n` : ''; })()}

═══ RESPONSE FORMAT ═══
ALWAYS return valid JSON. Never plain text. Never markdown outside the text field:
{
  "text": "Your conversational response (plain text, warm, first names, under 120 words unless asked)",
  "actions": []
}

═══ AVAILABLE ACTIONS ═══
addTask: {type, params: {text, person, priority: High|Medium|Low, category: Shopping|Maintenance|Scheduling|Pet|Important Dates|General, dueEstimate: Today|This Week|This Month|No Deadline}}
completeTask: {type, params: {match: "partial text"}}
uncompleteTask: {type, params: {match: "partial text"}}
deleteTask: {type, params: {match: "partial text"}}
addShopping: {type, params: {name, quantity, category: Groceries|Household|Personal|Other}}
completeShoppingItem: {type, params: {match: "partial text"}}
addBill: {type, params: {name, amount, dueDate: "YYYY-MM-DD"|null, recurring: bool}}
markBillPaid: {type, params: {match: "partial text"}}
addAppointment: {type, params: {person, title, type, doctor, date: "YYYY-MM-DD"|null, notes}}
addPromise: {type, params: {person, text, dueDate: "YYYY-MM-DD"|null, priority}}
completePromise: {type, params: {match: "partial text"}}
logEmotion: {type, params: {person, emotion, intensity: 1-5, note}}
updateMemory: {type, params: {memory: "thing to remember about this family"}}
clearWeekMeals: {type, params: {}} — resets the entire week's meal plan (all days/meals/cook assignments) back to empty
setMealPlan: {type, params: {day: "Monday".."Sunday", meal: "Breakfast"|"Lunch"|"Dinner", name: "meal name", cook?: "who's cooking", description?, time?: "XX min", difficulty?: "Easy"|"Medium"|"Hard", servings?: number, ingredients?: [{name,quantity,unit}], steps?: ["Step 1", "Step 2"]}}
  Use this to plan/suggest/fill in a specific meal. This is the ONLY way to write meal plan data — "meals"/"mealPlan" is NOT a valid genericAction domain, always use setMealPlan for meals instead.
  IMPORTANT: whenever you suggest a specific dish (not just a vague meal name), ALWAYS include ingredients (with realistic quantities/units) and steps too — without them, no recipe card, "Mark cooked" button, or "Add to shopping" button will appear for that meal, so the household member can't act on your suggestion. A bare name with no ingredients should only be used for vague placeholders like "Leftovers" or "Takeout".
markMealCooked: {type, params: {day: "Monday".."Sunday", meal: "Breakfast"|"Lunch"|"Dinner"}} — decrements pantry by that meal's recorded ingredients and marks it cooked
addCarMaintenanceEntry: {type, params: {carMatch: "partial car name", type, date: "YYYY-MM-DD", mileage, notes}}
genericAction: {type, params: {domain, op: "add"|"update"|"delete"|"clear", ...fields}}
  Use this for anything not covered by a specific action above. Valid domains and their fields:
  shopping(name,category,assignedTo,quantity) · bills(name,amount,dueDate,recurring) ·
  appointments(person,type,doctor,date,notes) · pantry(name,quantity,unit,category) ·
  messages(author,text) · askParents(kid,request,status) · moments(caption,emoji,date,author) ·
  bucketList(text) · watchlist(title,type,wantsToWatch) · games(name) ·
  medications(person,name,dosage,frequency,nextRefill,notes) · petLog(type,date,notes,nextDue) ·
  homework(kid,subject,task,dueDate,status) · grades(kid,subject,grade,date,notes) ·
  kidsActivities(kid,name,day,time,location) · allowance(kid,amount,type,reason,date) ·
  expenses(amount,category,paidBy,date,notes) · budget(name,budgeted,month) ·
  homeMaintenance(item,category,lastDone,nextDue,notes) · qualityActivities(name,person,duration,scheduledAt) ·
  promises(text,person,priority,dueDate) · emotions(person,feeling,context,intensity,category)
  For update/delete, pass {match: "partial text to find the item"} instead of full fields.

═══ RULES ═══
- Use actions whenever the user asks you to DO something (add, complete, mark, log, remove, etc.)
- Use updateMemory when user shares preferences, patterns, or context worth remembering across sessions
- You can execute multiple actions in one response
- Always confirm what you did in the text
- When recalling data, read it from the live data above and format it clearly in text
- Be proactive: if you see something concerning (many overdue tasks, broken promises, low-energy emotions), mention it
- Learn from patterns: note them in memory
- Suggest things when relevant ("You have 3 overdue tasks, want me to clear the old ones?")`.trim();
}

// ─── API call ─────────────────────────────────────────────────────────────────
async function callHermes(history: { role: string; content: string }[], householdMembers: { id: string; name: string; role: string }[], currentUserName: string | undefined): Promise<HermesResponse> {
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        messages: history,
        system: buildSystemPrompt(householdMembers, currentUserName),
        maxTokens: 600,
        model: 'claude-haiku-4-5-20251001',
      }),
    });
    if (!res.ok) return { text: 'Something went wrong. Try again.' };
    const data = await res.json();
    const raw = (data.text || '').trim();

    // Try to parse as JSON — extract from code fences if needed
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return { text: parsed.text || raw, actions: parsed.actions || [] };
    } catch {
      // If AI didn't return JSON, treat as plain text
      return { text: raw, actions: [] };
    }
  } catch {
    return { text: 'Network error. Check your connection.' };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
const STARTERS = [
  "What's on my plate today?",
  "Any overdue tasks?",
  "What do we need from the store?",
  "How are the kids doing?",
  "Summarize our bills",
  "Add: take out trash",
];

const ACTION_ICONS: Partial<Record<ActionType, string>> = {
  addTask: '📋', completeTask: '✅', uncompleteTask: '🔄', deleteTask: '🗑️',
  addShopping: '🛒', completeShoppingItem: '✅',
  addBill: '💸', markBillPaid: '💚',
  addAppointment: '📅',
  addPromise: '🤝', completePromise: '✅',
  logEmotion: '💭',
  updateMemory: '🧠',
  clearWeekMeals: '🍽️',
  setMealPlan: '🍽️',
  markMealCooked: '✅',
  addCarMaintenanceEntry: '🚗',
  genericAction: '⚡',
};

const HermesChat: React.FC = () => {
  const { currentUser, householdMembers } = useAppContext();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [memoryCount, setMemoryCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mem = localStorage.getItem('hermes_memory') || '';
    setMemoryCount(mem ? mem.split('\n').filter(Boolean).length : 0);
  }, [open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (override?: string) => {
    const msg = (override || input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg: Message = { role: 'user', text: msg, ts: Date.now() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    // Build history for API (last 12 turns, user/assistant only)
    const history = nextMessages.slice(-12).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    }));

    const response = await callHermes(history, householdMembers, currentUser?.name);

    // Execute any actions
    const executed: ExecutedAction[] = [];
    const defaultPerson = currentUser?.name || householdMembers[0]?.name || 'General';
    for (const action of response.actions || []) {
      const { result, ok } = executeAction(action, defaultPerson);
      executed.push({ ...action, result, ok });
      // Update memory counter if memory was updated
      if (action.type === 'updateMemory') {
        const mem = localStorage.getItem('hermes_memory') || '';
        setMemoryCount(mem.split('\n').filter(Boolean).length);
      }
    }

    const assistantMsg: Message = {
      role: 'assistant',
      text: response.text,
      ts: Date.now(),
      actions: executed.length ? executed : undefined,
    };

    setMessages(prev => [...prev, assistantMsg]);
    setLoading(false);
    if (!open) setUnread(n => n + 1);
  };

  const clearMemory = () => {
    if (confirm('Clear Hermes memory? He will forget all learned preferences.')) {
      localStorage.removeItem('hermes_memory');
      setMemoryCount(0);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-20 right-20 md:bottom-6 md:right-20 z-40 w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 shadow-xl shadow-violet-500/30 flex items-center justify-center transition-all active:scale-95"
        title="Ask Hermes"
      >
        <Bot className="w-6 h-6 text-white" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            {unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-20 md:bottom-6 right-4 z-50 w-full max-w-sm sm:max-w-md flex flex-col bg-slate-900 border border-violet-500/30 rounded-2xl shadow-2xl shadow-violet-900/40 overflow-hidden"
          style={{ height: '520px' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-950 to-slate-900 border-b border-violet-500/20 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 ring-2 ring-violet-400/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                Hermes
                <Zap className="w-3 h-3 text-violet-400" />
              </div>
              <div className="text-[10px] text-violet-300 flex items-center gap-1">
                <Brain className="w-2.5 h-2.5" />
                {memoryCount > 0 ? `${memoryCount} memories` : 'learning…'}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {memoryCount > 0 && (
                <button onClick={clearMemory} className="text-xs text-slate-500 hover:text-rose-400 px-1.5 py-1 rounded transition">
                  clear memory
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white p-1">
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-4 pt-2">
                <p className="text-xs text-slate-500 text-center">I know your household data and can take actions — add tasks, mark things done, log emotions, and more.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {STARTERS.map(s => (
                    <button key={s} onClick={() => send(s)}
                      className="text-left text-xs bg-slate-800 hover:bg-violet-900/30 border border-slate-700 hover:border-violet-500/40 rounded-xl px-3 py-2 text-slate-300 transition leading-snug">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} gap-1`}>
                <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-slate-800 border border-slate-700/80 text-slate-200 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>

                {/* Action results */}
                {m.actions && m.actions.length > 0 && (
                  <div className="max-w-[88%] flex flex-col gap-1">
                    {m.actions.map((a, ai) => (
                      <div key={ai} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border ${
                        a.ok
                          ? 'bg-emerald-950/50 border-emerald-700/40 text-emerald-300'
                          : 'bg-rose-950/50 border-rose-700/40 text-rose-300'
                      }`}>
                        {a.ok
                          ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                          : <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        }
                        <span>{ACTION_ICONS[a.type] || '⚡'} {a.result}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-start gap-2">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                  <span className="text-xs text-slate-400">Hermes is thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-slate-700/50 flex gap-2 flex-shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask or tell Hermes anything…"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 outline-none"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 flex items-center justify-center flex-shrink-0 transition"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default HermesChat;
