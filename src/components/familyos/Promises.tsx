import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { logActivity } from '@/lib/householdActivity';
import { onSyncUpdate } from '@/lib/sync';
import { triggerConfetti } from '@/lib/confetti';
import { toast } from 'sonner';
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
  today: 'bg-amber-500 text-black', // literal black, not slate-900 — that shade inverts with the theme and this badge always needs dark text on its bright chip
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

  const lastAppliedJSON = useRef<string>(JSON.stringify(promises));

  useEffect(() => {
    const json = JSON.stringify(promises);
    if (json === lastAppliedJSON.current) return;
    lastAppliedJSON.current = json;
    saveJSON(KEYS.promises, promises);
  }, [promises]);

  useEffect(() => onSyncUpdate((key) => {
    if (key !== KEYS.promises && key !== '*') return;
    const next = loadJSON<Promise[]>(KEYS.promises, []);
    lastAppliedJSON.current = JSON.stringify(next);
    setPromises(next);
  }), []);

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
    if (currentUser) logActivity(currentUser.name, `kept their promise: "${target.text}"`);

    triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.35, 65);
    toast.success('Promise Kept! 💖', {
      description: `You kept your word to ${target.person}: "${target.text}"`,
      duration: 3500,
    });

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
    <div className="space-y-6">
      <AlertModal {...modal} accent="blue" onClose={() => setModal({ ...modal, open: false })} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-blue-500/15 text-blue-300 border border-blue-500/30">
              <Heart className="w-3 h-3 text-pink-400 fill-pink-400" /> Relational Trust
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Promise <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">Keeper</span>
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">Words you gave. Words you keep. Build unbreakable trust.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={overdueReview}
            className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Overdue
          </button>
          <button
            onClick={weeklyReview}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-500/25 transition-all active:scale-95"
          >
            <Heart className="w-3.5 h-3.5" /> Weekly Reflection
          </button>
        </div>
      </div>

      {/* Per-person stats Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {people.map((person) => {
          const personStat = stats[person] || { completion: 0, open: 0, overdue: 0 };
          return (
            <div
              key={person}
              className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 hover:border-blue-500/30 transition-all relative overflow-hidden group shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30 flex items-center justify-center text-xs font-bold text-blue-300">
                    {person.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-white tracking-tight">{person}</span>
                </div>
                <span className="text-xl font-black bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
                  {personStat.completion}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, personStat.completion))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{personStat.open} active</span>
                {personStat.overdue > 0 ? (
                  <span className="text-rose-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    {personStat.overdue} overdue
                  </span>
                ) : (
                  <span className="text-emerald-400 font-medium">On track ✨</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Promise Box */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPromise(text)}
            placeholder='e.g. "I told Mommy I would book the cabin by Friday"'
            className="flex-1 bg-white/[0.04] border border-white/10 focus:border-blue-500 focus:bg-white/[0.07] rounded-xl px-4 py-3 text-white text-sm outline-none transition-all placeholder:text-slate-500 shadow-inner"
          />
          <button
            onClick={() => addPromise(text)}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-5 py-3 rounded-xl flex items-center justify-center gap-2 text-sm shadow-md shadow-blue-500/25 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Promise
          </button>
        </div>

        {/* Due date + Recurrence pickers */}
        <div className="mt-3.5 flex items-center gap-2 flex-wrap">
          <label
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
              dueDateInput
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                : 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-white/20'
            }`}
            title="Set a due date"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-medium">Due:</span>
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
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all ${
              recurType !== 'none'
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-200 font-medium'
                : 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-white/20'
            }`}
          >
            <Repeat className="w-3.5 h-3.5 text-indigo-400" />
            Repeats: {recurLabel}
            <ChevronDown className={`w-3 h-3 transition-transform ${showRecur ? 'rotate-180' : ''}`} />
          </button>

          {showRecur && (
            <div className="w-full bg-slate-900/90 border border-white/10 rounded-xl p-3 space-y-2 mt-1">
              <div className="flex gap-1.5 flex-wrap">
                {RECURRENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setRecurType(opt.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      recurType === opt.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {recurType === 'custom' && (
                <div className="flex gap-1 flex-wrap pt-1">
                  {DAY_LABELS.map((lbl, i) => (
                    <button
                      key={i}
                      onClick={() => toggleCustomDay(i)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        customDays.includes(i) ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
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

        {aiBusy && (
          <div className="text-xs text-blue-300 mt-2.5 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-amber-400" /> Auto-detecting person, category & urgency...
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap bg-white/[0.02] p-1.5 rounded-2xl border border-white/5">
        {TABS.map((t) => {
          const overdueCount =
            t === 'Recurring'
              ? 0
              : promises.filter((p) => !p.completed && (t === 'All' || p.person === t) && isOverdue(p)).length;
          const showCount = t === 'Recurring' ? recurringCount : null;
          const isSelected = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all ${
                isSelected
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {t === 'Recurring' && <Repeat className="w-3 h-3" />}
              {t}
              {showCount !== null && (
                <span className="opacity-75 text-xs bg-black/20 px-1.5 py-0.5 rounded-full">{showCount}</span>
              )}
              {overdueCount > 0 && (
                <span className="bg-rose-500 text-white text-[10px] rounded-full px-1.5 py-0.2">{overdueCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Promise Items List */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-10 text-center text-slate-400">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Heart className="w-7 h-7 text-blue-400 fill-blue-400/20" />
            </div>
            <p className="font-bold text-white text-base">All promises kept</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              You are honoring every word you gave. Need to make a new commitment? Add one above!
            </p>
          </div>
        ) : (
          filtered.map((p) => {
            const overdue = isOverdue(p);
            const dueBadge = p.dueDate ? formatDueBadge(p.dueDate) : null;
            return (
              <div
                key={p.id}
                className={`group bg-slate-900/50 backdrop-blur-sm border rounded-2xl p-3.5 sm:p-4 flex items-start gap-3.5 transition-all hover:bg-slate-900/80 hover:border-white/20 ${
                  overdue ? 'border-rose-500/40 bg-rose-950/15' : 'border-white/10'
                }`}
              >
                <button
                  onClick={() => completePromise(p.id)}
                  title="Mark promise kept!"
                  className="mt-0.5 w-7 h-7 rounded-full border border-white/20 hover:border-emerald-400 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-300 flex items-center justify-center transition-all shrink-0 active:scale-90"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-semibold tracking-tight flex items-center gap-1.5 leading-snug">
                    {p.recurrence && (
                      <Repeat className="w-3.5 h-3.5 text-blue-400 shrink-0" aria-label="Recurring" />
                    )}
                    <span>{p.text}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full">
                      {p.person}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        p.priority === 'High'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : p.priority === 'Medium'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-white/5 text-slate-300 border border-white/10'
                      }`}
                    >
                      {p.priority}
                    </span>
                    {dueBadge ? (
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          DUE_TONE[dueBadge.tone]
                        }`}
                      >
                        <CalendarIcon className="w-2.5 h-2.5" />
                        {formatDate(p.dueDate!)} · {dueBadge.label}
                      </span>
                    ) : (
                      p.dueEstimate &&
                      p.dueEstimate !== 'No Deadline' && (
                        <span className="text-[10px] uppercase tracking-wide bg-white/5 text-slate-300 px-2 py-0.5 rounded-full border border-white/10">
                          {p.dueEstimate}
                        </span>
                      )
                    )}
                    <span className="text-[10px] uppercase tracking-wide bg-white/5 text-slate-400 px-2 py-0.5 rounded-full border border-white/5">
                      {p.category}
                    </span>
                    {p.recurrence && (
                      <span className="text-[10px] font-medium bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Repeat className="w-2.5 h-2.5" /> {describeRecurrence(p.recurrence)}
                      </span>
                    )}
                    {!dueBadge && overdue && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-500 text-white px-2 py-0.5 rounded-full">
                        Overdue
                      </span>
                    )}
                    <span className="text-[10px] text-slate-500 ml-auto hidden sm:inline">
                      {formatDate(p.createdAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => deletePromise(p.id)}
                  title="Remove promise"
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all p-1"
                >
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

