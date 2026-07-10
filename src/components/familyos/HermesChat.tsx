import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, ChevronDown, CheckCircle2, AlertCircle, Zap, Brain } from 'lucide-react';
import { KEYS, loadJSON, saveJSON, uid } from '@/lib/familyos';

// ─── Action types ─────────────────────────────────────────────────────────────
type ActionType =
  | 'addTask' | 'completeTask' | 'uncompleteTask' | 'deleteTask'
  | 'addShopping' | 'completeShoppingItem'
  | 'addBill' | 'markBillPaid'
  | 'addAppointment'
  | 'addPromise' | 'completePromise'
  | 'logEmotion'
  | 'updateMemory';

interface Action { type: ActionType; params: Record<string, any>; }
interface ExecutedAction extends Action { result: string; ok: boolean; }
interface Message { role: 'user' | 'assistant'; text: string; ts: number; actions?: ExecutedAction[]; model?: 'gemini' | 'claude'; }
interface HermesResponse { text: string; actions?: Action[]; }

// ─── Seed memory — baked-in context about this family ────────────────────────
const SEED_MEMORY = `[Family context — always remember this]
Daddy (Michael): Diagnosed ADHD at age 36 after 36 years undiagnosed and untreated. Currently on Atomoxetine (Strattera) 50mg daily — about 3 months in. Strattera doesn't eliminate symptoms but gives him enough awareness to catch himself side-tracking and course-correct before full hyperfocus sets in. He's in a good place with it.
His past included substance abuse — stimulants specifically — which he now understands was inadvertent self-medication for undiagnosed ADHD. The diagnosis has made his entire past make sense. This is sensitive context — never bring it up unsolicited, but if he references it, engage with understanding and zero judgment.
ADHD for Michael is a REASON, not an excuse. He hates when people treat it like an excuse. He spent 36 years not knowing why things were harder for him. Now he does. Respect that.
Abriana: Also has ADHD. Teenager. Her overdue tasks and dropped chores are likely dysregulation, not defiance. Frame it with empathy, never judgment.
Mommy (Gwen) and Julia: Claim ADHD but their executive function works fine — they just need structure sometimes. They don't fully understand what Michael and Abriana experience and sometimes minimize it. Do not volunteer opinions on this family dynamic.
Bear House was built during Michael's first months on Strattera — his first real window of executive headroom. It's an external brain for an ADHD mind. That's its whole point.
Briefings and nudges should support task INITIATION (the hardest part for ADHD), not just remind. "Here's one thing to start with" beats "you have 12 things to do."
Hyperfocus is real — if Michael has been on a task for hours, a gentle redirect can help.`;

function initSeedMemory() {
  if (!localStorage.getItem('hermes_memory')) {
    localStorage.setItem('hermes_memory', SEED_MEMORY);
  }
}

// ─── Action executor ──────────────────────────────────────────────────────────
function executeAction(action: Action): { result: string; ok: boolean } {
  try {
    const p = action.params;

    if (action.type === 'addTask') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      const task = { id: uid(), createdAt: Date.now(), completed: false, source: 'hermes',
        text: p.text || 'Untitled task', person: p.person || 'Daddy',
        priority: p.priority || 'Medium', category: p.category || 'General',
        dueEstimate: p.dueEstimate || 'No Deadline', dueDate: p.dueDate || null };
      saveJSON(KEYS.tasks, [task, ...tasks]);
      return { result: `Added: "${task.text}" → ${task.person}`, ok: true };
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
      const after = tasks.filter(t => t.id !== p.id && !t.text?.toLowerCase().includes(match));
      saveJSON(KEYS.tasks, after);
      return { result: `Removed ${tasks.length - after.length} task(s)`, ok: true };
    }
    if (action.type === 'addShopping') {
      const items = loadJSON<any[]>('familyos_shopping', []);
      const item = { id: uid(), createdAt: Date.now(), completed: false, source: 'hermes',
        name: p.name || 'Unknown item', category: p.category || 'General',
        quantity: p.quantity || '1', assignedTo: p.assignedTo || 'General' };
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
    if (action.type === 'addBill') {
      const bills = loadJSON<any[]>('familyos_bills', []);
      const bill = { id: uid(), createdAt: Date.now(), paid: false, source: 'hermes',
        name: p.name || 'Unnamed bill', amount: parseFloat(p.amount) || 0,
        dueDate: p.dueDate || null, recurring: p.recurring || false, category: p.category || 'General' };
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
    if (action.type === 'addAppointment') {
      const appts = loadJSON<any[]>('familyos_appointments', []);
      const appt = { id: uid(), createdAt: Date.now(), source: 'hermes',
        person: p.person || 'Daddy', title: p.title || p.type || 'Appointment',
        type: p.type || 'General', doctor: p.doctor || '',
        date: p.date ? new Date(p.date).getTime() : null, notes: p.notes || '' };
      saveJSON('familyos_appointments', [appt, ...appts]);
      return { result: `Added: "${appt.title}" for ${appt.person}`, ok: true };
    }
    if (action.type === 'addPromise') {
      const promises = loadJSON<any[]>(KEYS.promises, []);
      const promise = { id: uid(), createdAt: Date.now(), completed: false, source: 'hermes',
        person: p.person || 'Daddy', text: p.text || 'Unnamed promise',
        dueDate: p.dueDate ? new Date(p.dueDate).getTime() : null, priority: p.priority || 'Medium' };
      saveJSON(KEYS.promises, [promise, ...promises]);
      return { result: `Promise to ${promise.person}: "${promise.text}"`, ok: true };
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
    if (action.type === 'logEmotion') {
      const emotions = loadJSON<any[]>(KEYS.emotions, []);
      const entry = { id: uid(), createdAt: Date.now(), source: 'hermes',
        person: p.person || 'Daddy', emotion: p.emotion || 'neutral',
        intensity: Math.min(5, Math.max(1, parseInt(p.intensity) || 3)), note: p.note || '' };
      saveJSON(KEYS.emotions, [entry, ...emotions]);
      return { result: `Logged ${entry.emotion} (${entry.intensity}/5) for ${entry.person}`, ok: true };
    }
    if (action.type === 'updateMemory') {
      const existing = localStorage.getItem('hermes_memory') || '';
      const note = `[${new Date().toLocaleDateString()}] ${p.memory}`;
      const updated = existing ? `${existing}\n${note}` : note;
      localStorage.setItem('hermes_memory', updated.slice(-4000));
      return { result: `Memory updated`, ok: true };
    }
    return { result: `Unknown action: ${action.type}`, ok: false };
  } catch (e: any) {
    return { result: `Error: ${e?.message}`, ok: false };
  }
}

// ─── Context builder ──────────────────────────────────────────────────────────
function buildSystemPrompt(): string {
  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const open = tasks.filter(t => !t.completed);
  const high = open.filter(t => t.priority === 'High').slice(0, 8);
  const medium = open.filter(t => t.priority === 'Medium').slice(0, 5);
  const overdue = open.filter(t => t.dueDate && t.dueDate < Date.now());
  const shopping = loadJSON<any[]>('familyos_shopping', []).filter((i: any) => !i.completed);
  const bills = loadJSON<any[]>('familyos_bills', []).filter((b: any) => !b.paid);
  const appts = loadJSON<any[]>('familyos_appointments', []).slice(0, 6);
  const emotions = loadJSON<any[]>(KEYS.emotions, []).slice(0, 6);
  const promises = loadJSON<any[]>(KEYS.promises, []).filter((p: any) => !p.completed).slice(0, 6);
  const memory = localStorage.getItem('hermes_memory') || SEED_MEMORY;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return `You are Hermes, the Bear House family AI secretary and agent. You are embedded in a family dashboard app built by and for this specific family.
Today: ${today}.

═══ WHO YOU'RE TALKING TO ═══
${memory}

═══ LIVE HOUSEHOLD DATA ═══
OPEN TASKS (${open.length} total, ${overdue.length} overdue):
HIGH PRIORITY: ${high.length ? high.map(t => `"${t.text}" → ${t.person}`).join(' | ') : 'none'}
MEDIUM: ${medium.length ? medium.map(t => `"${t.text}" → ${t.person}`).join(' | ') : 'none'}
OVERDUE: ${overdue.length ? overdue.map(t => `"${t.text}" → ${t.person}`).join(' | ') : 'none'}

SHOPPING (${shopping.length} items): ${shopping.slice(0, 10).map((i: any) => `${i.name} ×${i.quantity || 1}`).join(', ') || 'empty'}
UNPAID BILLS (${bills.length}): ${bills.slice(0, 6).map((b: any) => `${b.name} $${b.amount}`).join(', ') || 'none'}
APPOINTMENTS: ${appts.length ? appts.map((a: any) => `${a.person}: ${a.title || a.type}`).join(' | ') : 'none'}
OPEN PROMISES: ${promises.length ? promises.map((p: any) => `${p.person}: "${p.text}"`).join(' | ') : 'none'}
RECENT EMOTIONS: ${emotions.length ? emotions.map((e: any) => `${e.person} felt ${e.emotion} (${e.intensity}/5)`).join(' | ') : 'none'}

═══ RESPONSE FORMAT ═══
ALWAYS return valid JSON. Never plain text outside the text field:
{"text": "Your response (plain text, warm, first names, under 130 words unless asked for more)", "actions": []}

═══ AVAILABLE ACTIONS ═══
addTask: {type, params: {text, person, priority: High|Medium|Low, category: Shopping|Maintenance|Scheduling|Pet|Important Dates|General, dueEstimate: Today|This Week|This Month|No Deadline}}
completeTask: {type, params: {match: "partial text"}}
uncompleteTask: {type, params: {match}}
deleteTask: {type, params: {match}}
addShopping: {type, params: {name, quantity, category: Groceries|Household|Personal|Other}}
completeShoppingItem: {type, params: {match}}
addBill: {type, params: {name, amount, dueDate: "YYYY-MM-DD"|null, recurring: bool}}
markBillPaid: {type, params: {match}}
addAppointment: {type, params: {person, title, type, doctor, date: "YYYY-MM-DD"|null, notes}}
addPromise: {type, params: {person, text, dueDate: "YYYY-MM-DD"|null, priority}}
completePromise: {type, params: {match}}
logEmotion: {type, params: {person, emotion, intensity: 1-5, note}}
updateMemory: {type, params: {memory: "thing to remember"}}

═══ HOW TO SHOW UP FOR THIS FAMILY ═══
- ADHD context: task initiation is the hard part — lead with "one thing to start with" not a dump of everything
- When Abriana's tasks pile up, frame it with empathy ("looks like she's been stretched thin") not judgment
- "ADHD brain" is a reason, not an excuse — never imply otherwise
- Use updateMemory proactively when Michael shares patterns, preferences, or context worth keeping
- Surface insights when relevant — if you notice patterns (lots of overdue tasks, promises falling behind, Abriana's tasks piling up), mention them gently
- Multiple actions in one response is fine and encouraged
- Be concise. Michael doesn't need walls of text.`.trim();
}

// ─── Gemini API ───────────────────────────────────────────────────────────────
async function callGemini(
  history: { role: string; content: string }[],
  system: string,
  apiKey: string
): Promise<HermesResponse> {
  const contents = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 800 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini ${res.status}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  try {
    const parsed = JSON.parse(raw);
    return { text: parsed.text || raw, actions: parsed.actions || [] };
  } catch {
    return { text: raw, actions: [] };
  }
}

// ─── Claude API ───────────────────────────────────────────────────────────────
async function callClaude(
  history: { role: string; content: string }[],
  system: string
): Promise<HermesResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: history, system, maxTokens: 600, model: 'claude-3-5-haiku-latest' }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  const raw = (data.text || '').trim().replace(/^```json?\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(raw);
    return { text: parsed.text || raw, actions: parsed.actions || [] };
  } catch {
    return { text: raw, actions: [] };
  }
}

// ─── Unified caller ───────────────────────────────────────────────────────────
async function callHermes(
  history: { role: string; content: string }[],
  preferGemini: boolean
): Promise<{ response: HermesResponse; usedModel: 'gemini' | 'claude' }> {
  const system = buildSystemPrompt();
  const geminiKey = localStorage.getItem('gemini_api_key') || '';

  if (preferGemini && geminiKey) {
    try {
      const response = await callGemini(history, system, geminiKey);
      return { response, usedModel: 'gemini' };
    } catch (e: any) {
      console.warn('Gemini failed, falling back to Claude:', e.message);
    }
  }

  try {
    const response = await callClaude(history, system);
    return { response, usedModel: 'claude' };
  } catch {
    return { response: { text: 'Both models failed. Check your connection.', actions: [] }, usedModel: 'claude' };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
const STARTERS = [
  "What's my one thing to start with?",
  "ADHD brain moment — what did I forget?",
  "How's Abriana doing on her tasks?",
  "What bills are coming up?",
  "Add: take out trash tonight",
  "What do we need from the store?",
];

const ACTION_ICONS: Partial<Record<ActionType, string>> = {
  addTask: '📋', completeTask: '✅', uncompleteTask: '🔄', deleteTask: '🗑️',
  addShopping: '🛒', completeShoppingItem: '✅',
  addBill: '💸', markBillPaid: '💚',
  addAppointment: '📅', addPromise: '🤝', completePromise: '✅',
  logEmotion: '💭', updateMemory: '🧠',
};

const HermesChat: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [memoryCount, setMemoryCount] = useState(0);
  const [useGemini, setUseGemini] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initSeedMemory();
    const key = localStorage.getItem('gemini_api_key') || '';
    setHasGeminiKey(!!key);
    setUseGemini(!!key); // default to Gemini if key exists
    const mem = localStorage.getItem('hermes_memory') || '';
    setMemoryCount(mem.split('\n').filter(Boolean).length);
  }, []);

  useEffect(() => {
    if (open) {
      setUnread(0);
      const key = localStorage.getItem('gemini_api_key') || '';
      setHasGeminiKey(!!key);
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
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);

    const history = next.slice(-12).map(m => ({ role: m.role as 'user' | 'assistant', content: m.text }));
    const { response, usedModel } = await callHermes(history, useGemini);

    const executed: ExecutedAction[] = [];
    for (const action of response.actions || []) {
      const { result, ok } = executeAction(action);
      executed.push({ ...action, result, ok });
      if (action.type === 'updateMemory') {
        const mem = localStorage.getItem('hermes_memory') || '';
        setMemoryCount(mem.split('\n').filter(Boolean).length);
      }
    }

    setMessages(prev => [...prev, {
      role: 'assistant', text: response.text, ts: Date.now(),
      actions: executed.length ? executed : undefined,
      model: usedModel,
    }]);
    setLoading(false);
    if (!open) setUnread(n => n + 1);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearMemory = () => {
    if (confirm('Reset Hermes memory to defaults? His learned context about your family will reset.')) {
      localStorage.setItem('hermes_memory', SEED_MEMORY);
      setMemoryCount(SEED_MEMORY.split('\n').filter(Boolean).length);
    }
  };

  const activeModel = useGemini && hasGeminiKey ? 'gemini' : 'claude';

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

      {open && (
        <div
          className="fixed bottom-20 md:bottom-6 right-4 z-50 w-full max-w-sm sm:max-w-md flex flex-col bg-slate-900 border border-violet-500/30 rounded-2xl shadow-2xl shadow-violet-900/40 overflow-hidden"
          style={{ height: '540px' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-950 to-slate-900 border-b border-violet-500/20 flex-shrink-0">
            <div className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 ring-2 ring-violet-400/30">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                Hermes <Zap className="w-3 h-3 text-violet-400" />
              </div>
              <div className="text-[10px] text-violet-300 flex items-center gap-1">
                <Brain className="w-2.5 h-2.5" />
                {memoryCount} memories
              </div>
            </div>

            {/* Model toggle */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5 border border-slate-700">
              <button
                onClick={() => setUseGemini(false)}
                className={`text-[10px] px-2 py-1 rounded-md font-medium transition ${
                  activeModel === 'claude'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Claude
              </button>
              <button
                onClick={() => hasGeminiKey ? setUseGemini(true) : null}
                title={!hasGeminiKey ? 'Add Gemini key in Settings → API Keys' : ''}
                className={`text-[10px] px-2 py-1 rounded-md font-medium transition ${
                  activeModel === 'gemini'
                    ? 'bg-blue-600 text-white'
                    : hasGeminiKey
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-600 cursor-not-allowed'
                }`}
              >
                Gemini
              </button>
            </div>

            <div className="flex items-center gap-1 ml-1">
              {memoryCount > 0 && (
                <button onClick={clearMemory} className="text-[10px] text-slate-500 hover:text-rose-400 px-1.5 py-1 rounded transition">
                  reset
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
                <p className="text-xs text-slate-500 text-center">
                  {hasGeminiKey
                    ? `Running on ${activeModel === 'gemini' ? 'Gemini (primary)' : 'Claude (primary)'}. Knows your family and can act on your data.`
                    : 'Knows your family and can act on your data. Add a Gemini key in Settings to unlock dual-model mode.'}
                </p>
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
                {m.role === 'assistant' && m.model && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                    m.model === 'gemini' ? 'text-blue-400' : 'text-indigo-400'
                  }`}>
                    {m.model}
                  </span>
                )}
                {m.actions && m.actions.length > 0 && (
                  <div className="max-w-[88%] flex flex-col gap-1">
                    {m.actions.map((a, ai) => (
                      <div key={ai} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border ${
                        a.ok
                          ? 'bg-emerald-950/50 border-emerald-700/40 text-emerald-300'
                          : 'bg-rose-950/50 border-rose-700/40 text-rose-300'
                      }`}>
                        {a.ok ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                        <span>{ACTION_ICONS[a.type] || '⚡'} {a.result}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-start">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400" />
                  <span className="text-xs text-slate-400">
                    {activeModel === 'gemini' ? 'Gemini' : 'Hermes'} is thinking…
                  </span>
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
