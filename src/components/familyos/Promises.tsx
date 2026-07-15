import React, { useState, useEffect, useMemo } from 'react';
import { Plus, CheckCircle2, Trash2, Sparkles, AlertTriangle, Heart, Repeat, ChevronDown, Calendar as CalendarIcon, X } from 'lucide-react';
import {
  KEYS,
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
  formatDueBadge,
  dateInputValue,
  parseDateInput,
  Recurrence,
  householdPersons,
} from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import AlertModal from './AlertModal';

interface Promise {
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

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const DUE_TONE: Record<string, string> = {
  overdue: 'bg-rose-600 text-white',
  today: 'bg-amber-500 text-slate-900',
  soon: 'bg-amber-900/40 text-amber-300 border border-amber-500/30',
  future: 'bg-slate-700 text-slate-300',
};

const Promises: React.FC = () => {
  const { currentUser, householdMembers } = useAppContext();
  // "Others" — everyone except the logged-in user, since promises are made BY the current
  // user TO other household members. Falls back to the full roster if that'd be empty.
  const others = householdMembers.filter((m) => m.id !== currentUser?.id).map((m) => m.name);
  const people = others.length > 0 ? others : householdPersons(householdMembers);
  const TABS = ['All', ...people, 'Recurring'];
  const [promises, setPromises] = useState<Promise[]>(() => loadJSON(KEYS.promises, []));
  const [text, setText] = useState('');
  const [tab, setTab] = useState('All');
  const [aiBusy, setAiBusy] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', body: '', loading: false });

  const [dueDateInput, setDueDateInput] = useState<string>('');
  const [recurType, setRecurType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'custom'>('none');
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [showRecur, setShowRecur] = useState(false);

  useEffect(() => saveJSON(KEYS.promises, promises), [promises]);

  const buildRecurrence = (): Recurrence | null => {
    if (recurType === 'none') return null;
    if (recurType === 'custom') {
      if (customDays.length === 0) return null;
      return { type: 'custom', customDays: [...customDays].sort() };
    }
    return { type: recurType };
  };

  const addPromise = async (raw: string) => {
    if (!raw.trim()) return;
    const recurrence = buildRecurrence();
    const dueDate = parseDateInput(dueDateInput);
    const base: Promise = {
      id: uid(),
      text: raw.trim(),
      person: people[0] || '',
      priority: 'Medium',
      category: 'General',
      dueDate,
      completed: false,
      createdAt: Date.now(),
      recurrence,
    };
    setPromises((prev) => [base, ...prev]);
    setText('');
    setDueDateInput('');
    setShowRecur(false);
    setRecurType('none');
    setCustomDays([]);

    setAiBusy(true);
    const prompt = `Parse this promise. Return ONLY JSON: {"person":"${people.join('|')}","priority":"High|Medium|Low","category":"${TASK_CATEGORIES.join('|')}"}\n\nPromise: "${raw}"`;
    const { ok, text: aiText } = await callClaude(prompt);
    if (ok) {
      const parsed = tryParseJSON<Partial<Promise>>(aiText, {});
      setPromises((prev) =>
        prev.map((p) =>
          p.id === base.id
            ? {
                ...p,
                person: parsed.person && people.includes(parsed.person) ? parsed.person : p.person,
                priority: parsed.priority && PRIORITIES.includes(parsed.priority) ? parsed.priority : p.priority,
                category: parsed.category && TASK_CATEGORIES.includes(parsed.category) ? parsed.category : p.category,
              }
            : p
        )
      );
    }
    setAiBusy(false);
  };

  const completePromise = (id: string) => {
    const target = promises.find((p) => p.id === id);
    if (!target) return;
    const now = Date.now();
    const updated = promises.map((p) => (p.id === id ? { ...p, completed: true, completedAt: now } : p));
    if (target.recurrence) {
      const nextAt = nextRecurrence(now, target.recurrence);
      const nextDueDate = target.dueDate ? nextRecurrence(target.dueDate, target.recurrence) : null;
      const nextInstance: Promise = {
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
      setPromises([nextInstance, ...updated]);
    } else {
      setPromises(updated);
    }
  };

  const deletePromise = (id: string) => setPromises(promises.filter((p) => p.id !== id));

  const filtered = useMemo(() => {
    const open = promises.filter((p) => !p.completed);
    if (tab === 'All') return open;
    if (tab === 'Recurring') return open.filter((p) => p.recurrence);
    return open.filter((p) => p.person === tab);
  }, [promises, tab]);

  const stats = useMemo(() => {
    const r: Record<string, { open: number; overdue: number; completion: number }> = {};
    people.forEach((person) => {
      const all = promises.filter((p) => p.person === person);
      const open = all.filter((p) => !p.completed);
      const completed = all.filter((p) => p.completed);
      const overdue = open.filter((p) => isOverdue(p));
      const completion = all.length ? Math.round((completed.length / all.length) * 100) : 0;
      r[person] = { open: open.length, overdue: overdue.length, completion };
    });
    return r;
  }, [promises, people]);

  const overdueReview = async () => {
    const overdue = promises.filter((p) => !p.completed && isOverdue(p));
    setModal({ open: true, title: 'Overdue Promises', body: '', loading: true });
    if (overdue.length === 0) {
      setModal({ open: true, title: 'Overdue Promises', body: 'No overdue promises. You are keeping your word beautifully.', loading: false });
      return;
    }
    const prompt = `These promises ${currentUser?.name || 'you'} made are overdue:\n${overdue.map((p) => `- to ${p.person}: "${p.text}"`).join('\n')}\n\nWrite a kind, honest 3-sentence nudge.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Overdue Promises', body: text, loading: false });
  };

  const weeklyReview = async () => {
    setModal({ open: true, title: 'Weekly Relationship Review', body: '', loading: true });
    const prompt = `It's Sunday evening. Review ${currentUser?.name || "the current user"}'s promise-keeping this week.\nStats: ${JSON.stringify(stats)}\nOpen promises: ${promises.filter((p) => !p.completed).length}.\n\nGive a thoughtful 4-sentence reflection on their relationships with ${people.join(', ')}.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Weekly Relationship Review', body: text, loading: false });
  };

  const toggleCustomDay = (d: number) => {
    setCustomDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  };

  const recurringCount = promises.filter((p) => !p.completed && p.recurrence).length;
  const recurLabel = (() => {
    if (recurType === 'none') return 'No Repeat';
    if (recurType === 'custom') return customDays.length ? `Custom (${customDays.length})` : 'Custom Days';
    return RECURRENCE_OPTIONS.find((o) => o.id === recurType)?.label || 'No Repeat';
  })();

  const todayStr = dateInputValue(Date.now());

  return (
    <div className="space-y-5">
      <AlertModal {...modal} accent="blue" onClose={() => setModal({ ...modal, open: false })} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Promise Keeper</h2>
          <p className="text-sm text-slate-400">Words you gave. Words you keep.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={overdueReview} className="bg-rose-900/40 border border-rose-500/30 text-rose-300 px-3 py-2 rounded-lg text-sm flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> Overdue
          </button>
          <button onClick={weeklyReview} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1">
            <Heart className="w-4 h-4" /> Review
          </button>
        </div>
      </div>

      {/* Per-person stats */}
      <div className="grid grid-cols-3 gap-2">
        {people.map((person) => (
          <div key={person} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400">{person}</div>
            <div className="text-2xl font-bold text-white">{stats[person].completion}%</div>
            <div className="text-xs text-slate-500">{stats[person].open} open · {stats[person].overdue} late</div>
          </div>
        ))}
      </div>

      {/* Add */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPromise(text)}
            placeholder='e.g. "I told Mommy I would book the cabin by Friday"'
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:border-blue-500 outline-none"
          />
          <button onClick={() => addPromise(text)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {/* Due date + Recurrence pickers */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <label
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition cursor-pointer ${
              dueDateInput
                ? 'bg-blue-900/40 border-blue-500/40 text-blue-200'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-blue-500/40'
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
                ? 'bg-blue-900/40 border-blue-500/40 text-blue-200'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-blue-500/40'
            }`}
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
                      recurType === opt.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                        customDays.includes(i) ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
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

        {aiBusy && <div className="text-xs text-blue-400 mt-2 flex items-center gap-2"><Sparkles className="w-3 h-3 animate-pulse" /> Parsing...</div>}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => {
          const overdueCount =
            t === 'Recurring'
              ? 0
              : promises.filter((p) => !p.completed && (t === 'All' || p.person === t) && isOverdue(p)).length;
          const showCount = t === 'Recurring' ? recurringCount : null;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition ${
                tab === t ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t === 'Recurring' && <Repeat className="w-3 h-3" />}
              {t}
              {showCount !== null && <span className="opacity-70">{showCount}</span>}
              {overdueCount > 0 && <span className="bg-rose-500 text-white text-[10px] rounded-full px-1.5">{overdueCount}</span>}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-slate-800/50 border border-dashed border-slate-700 rounded-2xl p-8 text-center text-slate-400">
            <Heart className="w-10 h-10 mx-auto mb-3 text-blue-400/60" />
            <p className="font-medium text-white">All promises kept</p>
            <p className="text-sm">Add one when you make it.</p>
          </div>
        ) : (
          filtered.map((p) => {
            const overdue = isOverdue(p);
            const dueBadge = p.dueDate ? formatDueBadge(p.dueDate) : null;
            return (
              <div key={p.id} className={`bg-slate-800 border rounded-lg p-3 flex items-start gap-3 ${overdue ? 'border-rose-500/40' : 'border-slate-700'}`}>
                <button onClick={() => completePromise(p.id)} className="text-slate-400 hover:text-emerald-400 mt-0.5">
                  <CheckCircle2 className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium flex items-center gap-1.5">
                    {p.recurrence && <Repeat className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-label="Recurring" />}
                    <span>{p.text}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span className="text-[10px] uppercase tracking-wide bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded">{p.person}</span>
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      p.priority === 'High' ? 'bg-rose-900/40 text-rose-300' : p.priority === 'Medium' ? 'bg-amber-900/40 text-amber-300' : 'bg-slate-700 text-slate-300'
                    }`}>{p.priority}</span>
                    {dueBadge ? (
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-1 ${DUE_TONE[dueBadge.tone]}`}>
                        <CalendarIcon className="w-2.5 h-2.5" />
                        {formatDate(p.dueDate!)} · {dueBadge.label}
                      </span>
                    ) : (
                      p.dueEstimate && p.dueEstimate !== 'No Deadline' && (
                        <span className="text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{p.dueEstimate}</span>
                      )
                    )}
                    <span className="text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{p.category}</span>
                    {p.recurrence && (
                      <span className="text-[10px] uppercase tracking-wide bg-blue-600/30 border border-blue-500/40 text-blue-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Repeat className="w-2.5 h-2.5" /> {describeRecurrence(p.recurrence)}
                      </span>
                    )}
                    {!dueBadge && overdue && <span className="text-[10px] uppercase tracking-wide bg-rose-600 text-white px-1.5 py-0.5 rounded">Overdue</span>}
                    <span className="text-[10px] text-slate-500 ml-auto">{formatDate(p.createdAt)}</span>
                  </div>
                </div>
                <button onClick={() => deletePromise(p.id)} className="text-slate-500 hover:text-rose-400">
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

export default Promises;
