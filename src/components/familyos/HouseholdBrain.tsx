import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Mic, MicOff, Trash2, CheckCircle2, Sparkles, Activity, AlertTriangle, Repeat, ChevronDown, Calendar as CalendarIcon, X, ScanLine } from 'lucide-react';
import ChoreScanner from '@/components/familyos/ChoreScanner';
import {
  KEYS,
  PERSONS,
  PRIORITIES,
  TASK_CATEGORIES,
  RECURRENCE_OPTIONS,
  loadJSON,
  saveJSON,
  uid,
  callClaude,
  tryParseJSON,
  isOverdue,
  formatDate,
  nextRecurrence,
  describeRecurrence,
  daysUntilDue,
  formatDueBadge,
  dateInputValue,
  parseDateInput,
  Recurrence,
} from '@/lib/familyos';
import AlertModal from './AlertModal';

interface Task {
  id: string;
  text: string;
  person: string;
  priority: string;
  category: string;
  dueEstimate?: string; // legacy
  dueDate?: number | null;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  recurrence?: Recurrence | null;
  parentId?: string;
}

const TABS = ['Today', 'Mommy', 'Abriana', 'Julia', 'Lucy', 'Recurring', 'All'];
const PRIORITY_COLORS: Record<string, string> = {
  High: 'border-rose-500',
  Medium: 'border-amber-500',
  Low: 'border-slate-500',
};

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const DUE_TONE: Record<string, string> = {
  overdue: 'bg-rose-600 text-white',
  today: 'bg-amber-500 text-slate-900',
  soon: 'bg-amber-900/40 text-amber-300 border border-amber-500/30',
  future: 'bg-slate-700 text-slate-300',
};

const HouseholdBrain: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(() => loadJSON(KEYS.tasks, []));
  const [text, setText] = useState('');
  const [tab, setTab] = useState('Today');
  const [listening, setListening] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', body: '', loading: false });

  // Due date picker state
  const [dueDateInput, setDueDateInput] = useState<string>('');

  // Recurrence picker state
  const [recurType, setRecurType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'custom'>('none');
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [showRecur, setShowRecur] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const autoAssign = (chore: string): string => {
    const c = chore.toLowerCase();
    if (/lawn|yard|mow|trim|outdoor|gutter|fence|driveway|garage/.test(c)) return 'Daddy';
    if (/dish|laundry|vacuum|sweep|mop|clean|dust|wipe|bathroom|kitchen/.test(c)) return 'Mommy';
    if (/litter|feed.*pet|walk.*dog|lucy/.test(c)) return 'Julia';
    if (/trash|garbage|recycl/.test(c)) return 'Abriana';
    return 'Daddy';
  };

  const handleScanSave = (detected: Array<{ id: string; chore: string; detail: string; priority: string; addedAt: number }>) => {
    const newTasks: Task[] = detected.map(d => ({
      id: uid(),
      text: d.chore,
      person: autoAssign(d.chore),
      priority: d.priority === 'high' ? 'High' : d.priority === 'low' ? 'Low' : 'Medium',
      category: 'Maintenance',
      dueEstimate: 'Today',
      dueDate: null,
      completed: false,
      createdAt: d.addedAt,
      source: 'chore_scanner',
    } as Task));
    setTasks(prev => [...newTasks, ...prev]);
  };

  const [presentToday, setPresentToday] = useState<{ yes: number; no: number }>(() => {
    const log = loadJSON<any[]>(KEYS.presenceLog, []);
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = log.filter((l) => l.ts > weekAgo);
    const yes = recent.filter((l) => l.present).length;
    const no = recent.length - yes;
    return { yes, no };
  });

  useEffect(() => saveJSON(KEYS.tasks, tasks), [tasks]);

  const filteredTasks = useMemo(() => {
    const open = tasks.filter((t) => !t.completed);
    if (tab === 'All') return open;
    if (tab === 'Today') {
      return open.filter((t) => {
        if (t.priority === 'High') return true;
        if (t.dueDate) {
          const d = daysUntilDue(t.dueDate);
          return d <= 0; // due today or overdue
        }
        return t.dueEstimate === 'Today';
      });
    }
    if (tab === 'Recurring') return open.filter((t) => t.recurrence);
    return open.filter((t) => t.person === tab);
  }, [tasks, tab]);

  const buildRecurrence = (): Recurrence | null => {
    if (recurType === 'none') return null;
    if (recurType === 'custom') {
      if (customDays.length === 0) return null;
      return { type: 'custom', customDays: [...customDays].sort() };
    }
    return { type: recurType };
  };

  const addTask = async (rawText: string) => {
    if (!rawText.trim()) return;
    const recurrence = buildRecurrence();
    const dueDate = parseDateInput(dueDateInput);
    const baseTask: Task = {
      id: uid(),
      text: rawText.trim(),
      person: 'General',
      priority: 'Medium',
      category: 'General',
      dueDate,
      completed: false,
      createdAt: Date.now(),
      recurrence,
    };
    setTasks((prev) => [baseTask, ...prev]);
    setText('');
    setDueDateInput('');
    setShowRecur(false);
    setRecurType('none');
    setCustomDays([]);

    setAiBusy(true);
    const prompt = `Categorize this household task. Return ONLY JSON: {"category":"one of: ${TASK_CATEGORIES.join(', ')}","priority":"High|Medium|Low","person":"one of: ${PERSONS.join(', ')}"}\n\nTask: "${rawText}"`;
    const { ok, text: aiText } = await callClaude(prompt);
    if (ok) {
      const parsed = tryParseJSON<Partial<Task>>(aiText, {});
      setTasks((prev) =>
        prev.map((t) =>
          t.id === baseTask.id
            ? {
                ...t,
                category: parsed.category && TASK_CATEGORIES.includes(parsed.category) ? parsed.category : t.category,
                priority: parsed.priority && PRIORITIES.includes(parsed.priority) ? parsed.priority : t.priority,
                person: parsed.person && PERSONS.includes(parsed.person) ? parsed.person : t.person,
              }
            : t
        )
      );
    }
    setAiBusy(false);
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Voice input not supported in this browser');
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setText(transcript);
    };
    rec.start();
  };

  const completeTask = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    const now = Date.now();
    const updated = tasks.map((t) => (t.id === id ? { ...t, completed: true, completedAt: now } : t));
    // If recurring, generate next instance
    if (target.recurrence) {
      const nextAt = nextRecurrence(now, target.recurrence);
      // Roll the dueDate forward too if there was one
      const nextDueDate = target.dueDate ? nextRecurrence(target.dueDate, target.recurrence) : null;
      const nextInstance: Task = {
        id: uid(),
        text: target.text,
        person: target.person,
        priority: target.priority,
        category: target.category,
        dueDate: nextDueDate,
        completed: false,
        createdAt: nextAt,
        recurrence: target.recurrence,
        parentId: target.parentId || target.id,
      };
      setTasks([nextInstance, ...updated]);
    } else {
      setTasks(updated);
    }
  };

  const deleteTask = (id: string) => setTasks(tasks.filter((t) => t.id !== id));

  const presenceTotal = presentToday.yes + presentToday.no;
  const presencePct = presenceTotal ? Math.round((presentToday.yes / presenceTotal) * 100) : 0;

  const checkPresence = () => {
    const present = window.confirm('Are you present?');
    const log = loadJSON<any[]>(KEYS.presenceLog, []);
    log.push({ ts: Date.now(), present });
    saveJSON(KEYS.presenceLog, log);
    if ((navigator as any).vibrate) (navigator as any).vibrate(200);
    setPresentToday((p) => (present ? { ...p, yes: p.yes + 1 } : { ...p, no: p.no + 1 }));
  };

  const morningBrief = async () => {
    setModal({ open: true, title: 'Morning Brief', body: '', loading: true });
    const open = tasks.filter((t) => !t.completed);
    const prompt = `You are a calm morning assistant. Daddy has these open household tasks:\n${open.map((t) => `- [${t.priority}] ${t.text} (${t.person}${t.dueDate ? `, due ${formatDate(t.dueDate)}` : ''})`).join('\n')}\n\nGive a 3-sentence morning brief: top 3 priorities, one piece of encouragement.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Morning Brief', body: text, loading: false });
  };

  const overdueAlert = async () => {
    const overdue = tasks.filter((t) => !t.completed && isOverdue(t));
    if (overdue.length === 0) {
      setModal({ open: true, title: 'Overdue Check', body: 'Nothing overdue. Nicely done.', loading: false });
      return;
    }
    setModal({ open: true, title: 'Overdue Tasks', body: '', loading: true });
    const prompt = `These household tasks are overdue:\n${overdue.map((t) => `- ${t.text} (${t.person})`).join('\n')}\n\nWrite a short, kind nudge in 2-3 sentences.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Overdue Tasks', body: text, loading: false });
  };

  const toggleCustomDay = (d: number) => {
    setCustomDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  };

  const recurringCount = tasks.filter((t) => !t.completed && t.recurrence).length;
  const recurLabel = (() => {
    if (recurType === 'none') return 'No Repeat';
    if (recurType === 'custom') return customDays.length ? `Custom (${customDays.length})` : 'Custom Days';
    return RECURRENCE_OPTIONS.find((o) => o.id === recurType)?.label || 'No Repeat';
  })();

  const todayStr = dateInputValue(Date.now());

  return (
    <div className="space-y-5">
      <AlertModal {...modal} accent="orange" onClose={() => setModal({ ...modal, open: false })} />

      {showScanner && (
        <ChoreScanner
          onClose={() => setShowScanner(false)}
          onSave={(chores) => { handleScanSave(chores); setShowScanner(false); }}
        />
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white">Household Brain</h2>
          <p className="text-sm text-slate-400">Capture, categorize, and clear what's on your plate.</p>
        </div>
        <button onClick={() => setShowScanner(true)} className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <ScanLine className="w-4 h-4" /> Scan Room
        </button>
        <button onClick={morningBrief} className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Brief
        </button>
      </div>

      {/* Presence */}
      <div className="bg-gradient-to-br from-orange-900/40 to-slate-800 border border-orange-500/30 rounded-2xl p-4 flex items-center gap-4">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90">
            <circle cx="32" cy="32" r="26" stroke="rgb(51,65,85)" strokeWidth="6" fill="none" />
            <circle cx="32" cy="32" r="26" stroke="rgb(251,146,60)" strokeWidth="6" fill="none" strokeDasharray={`${(presencePct / 100) * 163} 163`} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">{presencePct}%</div>
        </div>
        <div className="flex-1">
          <div className="text-white font-semibold">Weekly Presence</div>
          <div className="text-xs text-slate-400">{presentToday.yes} present, {presentToday.no} not present this week</div>
        </div>
        <button onClick={checkPresence} className="bg-orange-600/30 hover:bg-orange-600/50 border border-orange-500/40 text-orange-200 rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1">
          <Activity className="w-3.5 h-3.5" /> Check-in
        </button>
      </div>

      {/* Add task */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask(text)}
            placeholder="Add a task... (Press N to focus)"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:border-orange-500 outline-none"
          />
          <button onClick={startVoice} className={`p-2.5 rounded-lg ${listening ? 'bg-rose-600' : 'bg-slate-700 hover:bg-slate-600'} text-white`}>
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button onClick={() => addTask(text)} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {/* Due date + Recurrence pickers */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <label
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition cursor-pointer ${
              dueDateInput
                ? 'bg-orange-900/40 border-orange-500/40 text-orange-200'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-orange-500/40'
            }`}
            title="Set a due date"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Due:</span>
            <input
              type="date"
              value={dueDateInput}
              min={todayStr}
              onChange={(e) => setDueDateInput(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-current [color-scheme:dark]"
            />
            {dueDateInput && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setDueDateInput('');
                }}
                className="ml-1 text-slate-400 hover:text-rose-400"
                aria-label="Clear due date"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </label>

          <button
            onClick={() => setShowRecur((s) => !s)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition ${
              recurType !== 'none'
                ? 'bg-orange-900/40 border-orange-500/40 text-orange-200'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-orange-500/40'
            }`}
            title="Repeat options"
          >
            <Repeat className="w-3.5 h-3.5" />
            Repeats: {recurLabel}
            <ChevronDown className={`w-3 h-3 transition ${showRecur ? 'rotate-180' : ''}`} />
          </button>
          {showRecur && (
            <div className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
              <div className="flex gap-1.5 flex-wrap">
                {RECURRENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setRecurType(opt.id as any)}
                    className={`px-2.5 py-1 rounded-md text-xs transition ${
                      recurType === opt.id ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {recurType === 'custom' && (
                <div className="flex gap-1 flex-wrap">
                  {DAY_LABELS.map((lbl, i) => (
                    <button
                      key={i}
                      onClick={() => toggleCustomDay(i)}
                      className={`w-8 h-8 rounded-md text-xs font-bold transition ${
                        customDays.includes(i) ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {aiBusy && <div className="text-xs text-orange-400 mt-2 flex items-center gap-2"><Sparkles className="w-3 h-3 animate-pulse" /> Categorizing...</div>}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const count =
            t === 'All'
              ? tasks.filter((x) => !x.completed).length
              : t === 'Today'
              ? tasks.filter((x) => {
                  if (x.completed) return false;
                  if (x.priority === 'High') return true;
                  if (x.dueDate) return daysUntilDue(x.dueDate) <= 0;
                  return x.dueEstimate === 'Today';
                }).length
              : t === 'Recurring'
              ? recurringCount
              : tasks.filter((x) => !x.completed && x.person === t).length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition flex items-center gap-1 ${
                tab === t ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t === 'Recurring' && <Repeat className="w-3 h-3" />}
              {t} <span className="opacity-70 ml-1">{count}</span>
            </button>
          );
        })}
        <button onClick={overdueAlert} className="ml-auto bg-rose-900/40 border border-rose-500/30 text-rose-300 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> Overdue
        </button>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="bg-slate-800/50 border border-dashed border-slate-700 rounded-2xl p-8 text-center text-slate-400">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-orange-400/60" />
            <p className="font-medium text-white">All clear here</p>
            <p className="text-sm">Add a task above to get started.</p>
          </div>
        ) : (
          filteredTasks.map((t) => {
            const dueBadge = t.dueDate ? formatDueBadge(t.dueDate) : null;
            return (
              <div
                key={t.id}
                className={`bg-slate-800 border-l-4 ${PRIORITY_COLORS[t.priority]} border-r border-y border-slate-700 rounded-lg p-3 flex items-start gap-3 hover:bg-slate-800/70 transition`}
              >
                <button onClick={() => completeTask(t.id)} className="text-slate-400 hover:text-emerald-400 mt-0.5">
                  <CheckCircle2 className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium flex items-center gap-1.5">
                    {t.recurrence && <Repeat className="w-3.5 h-3.5 text-orange-400 shrink-0" aria-label="Recurring" />}
                    <span>{t.text}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{t.person}</span>
                    <span className="text-[10px] uppercase tracking-wide bg-orange-900/40 text-orange-300 px-1.5 py-0.5 rounded">{t.category}</span>
                    {dueBadge ? (
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-1 ${DUE_TONE[dueBadge.tone]}`}>
                        <CalendarIcon className="w-2.5 h-2.5" />
                        {formatDate(t.dueDate!)} · {dueBadge.label}
                      </span>
                    ) : (
                      t.dueEstimate && t.dueEstimate !== 'No Deadline' && (
                        <span className="text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{t.dueEstimate}</span>
                      )
                    )}
                    {t.recurrence && (
                      <span className="text-[10px] uppercase tracking-wide bg-orange-600/30 border border-orange-500/40 text-orange-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Repeat className="w-2.5 h-2.5" /> {describeRecurrence(t.recurrence)}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 ml-auto">{formatDate(t.createdAt)}</span>
                  </div>
                </div>
                <button onClick={() => deleteTask(t.id)} className="text-slate-500 hover:text-rose-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default HouseholdBrain;
