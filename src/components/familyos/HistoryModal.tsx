import React, { useState, useMemo } from 'react';
import { X, History, RotateCcw, CheckCircle2, Handshake, ListChecks } from 'lucide-react';
import { KEYS, loadJSON, saveJSON, formatDate, householdPersons } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

type HistoryItem = {
  id: string;
  type: 'task' | 'promise';
  text: string;
  person: string;
  category?: string;
  completedAt: number;
  createdAt: number;
};

const RANGES = [
  { id: 'all', label: 'All Time', days: Infinity },
  { id: '7', label: 'Last 7d', days: 7 },
  { id: '30', label: 'Last 30d', days: 30 },
  { id: '90', label: 'Last 90d', days: 90 },
];

const HistoryModal: React.FC<Props> = ({ open, onClose }) => {
  const { householdMembers } = useAppContext();
  const PERSONS = ['All', ...householdPersons(householdMembers)];
  const [personFilter, setPersonFilter] = useState('All');
  const [rangeId, setRangeId] = useState('30');
  const [reload, setReload] = useState(0);

  const items = useMemo<HistoryItem[]>(() => {
    if (!open) return [];
    const tasks = loadJSON<any[]>(KEYS.tasks, []);
    const promises = loadJSON<any[]>(KEYS.promises, []);
    const taskItems: HistoryItem[] = tasks
      .filter((t) => t.completed)
      .map((t) => ({
        id: t.id,
        type: 'task' as const,
        text: t.text,
        person: t.person || 'General',
        category: t.category,
        completedAt: t.completedAt || t.createdAt,
        createdAt: t.createdAt,
      }));
    const promiseItems: HistoryItem[] = promises
      .filter((p) => p.completed)
      .map((p) => ({
        id: p.id,
        type: 'promise' as const,
        text: p.text,
        person: p.person || 'Mommy',
        category: p.category,
        completedAt: p.completedAt || p.createdAt,
        createdAt: p.createdAt,
      }));
    return [...taskItems, ...promiseItems].sort((a, b) => b.completedAt - a.completedAt);
  }, [open, reload]);

  const range = RANGES.find((r) => r.id === rangeId)!;
  const cutoff = range.days === Infinity ? 0 : Date.now() - range.days * 86400000;

  const filtered = items.filter((i) => {
    if (i.completedAt < cutoff) return false;
    if (personFilter !== 'All' && i.person !== personFilter) return false;
    return true;
  });

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, HistoryItem[]> = {};
    filtered.forEach((i) => {
      const d = new Date(i.completedAt);
      const key = d.toDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(i);
    });
    return Object.entries(groups);
  }, [filtered]);

  const restore = (item: HistoryItem) => {
    if (item.type === 'task') {
      const tasks = loadJSON<any[]>(KEYS.tasks, []);
      saveJSON(
        KEYS.tasks,
        tasks.map((t) => (t.id === item.id ? { ...t, completed: false, completedAt: undefined } : t))
      );
    } else {
      const promises = loadJSON<any[]>(KEYS.promises, []);
      saveJSON(
        KEYS.promises,
        promises.map((p) => (p.id === item.id ? { ...p, completed: false, completedAt: undefined } : p))
      );
    }
    setReload((r) => r + 1);
  };

  const stats = useMemo(() => {
    const taskCount = filtered.filter((i) => i.type === 'task').length;
    const promiseCount = filtered.filter((i) => i.type === 'promise').length;
    return { taskCount, promiseCount, total: filtered.length };
  }, [filtered]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl max-w-3xl w-full mx-auto my-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 sticky top-0 bg-slate-800 rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <History className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Completed History</h2>
              <p className="text-xs text-slate-400">
                {stats.total} items · {stats.taskCount} tasks · {stats.promiseCount} promises
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-slate-700 space-y-3">
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1.5 tracking-wide">Date Range</div>
            <div className="flex gap-2 flex-wrap">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRangeId(r.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    rangeId === r.id ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-500 mb-1.5 tracking-wide">Person</div>
            <div className="flex gap-2 flex-wrap">
              {PERSONS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPersonFilter(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    personFilter === p ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {grouped.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400/40" />
              <p className="font-medium text-white">No completed items yet</p>
              <p className="text-sm mt-1">Finish a task or keep a promise to see it here.</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-500/40 via-slate-700 to-transparent" />
              <div className="space-y-6">
                {grouped.map(([dateKey, dayItems]) => (
                  <div key={dateKey} className="relative pl-12">
                    <div className="absolute left-2 top-1 w-5 h-5 rounded-full bg-slate-800 border-2 border-emerald-500 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </div>
                    <div className="text-xs uppercase tracking-wide text-emerald-400 font-semibold mb-2">
                      {new Date(dayItems[0].completedAt).toLocaleDateString([], {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                      <span className="text-slate-500 font-normal ml-2">{dayItems.length} done</span>
                    </div>
                    <div className="space-y-2">
                      {dayItems.map((item) => {
                        const isTask = item.type === 'task';
                        return (
                          <div
                            key={`${item.type}-${item.id}`}
                            className={`bg-slate-900 border rounded-lg p-3 flex items-start gap-3 group hover:border-slate-600 transition ${
                              isTask ? 'border-orange-500/20' : 'border-blue-500/20'
                            }`}
                          >
                            <div
                              className={`mt-0.5 p-1.5 rounded-md ${
                                isTask ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                              }`}
                            >
                              {isTask ? <ListChecks className="w-3.5 h-3.5" /> : <Handshake className="w-3.5 h-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-white text-sm font-medium line-through decoration-slate-600 decoration-1">
                                {item.text}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                <span className="text-[10px] uppercase tracking-wide bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                                  {item.person}
                                </span>
                                {item.category && (
                                  <span
                                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                      isTask ? 'bg-orange-900/40 text-orange-300' : 'bg-blue-900/40 text-blue-300'
                                    }`}
                                  >
                                    {item.category}
                                  </span>
                                )}
                                <span className="text-[10px] uppercase tracking-wide bg-emerald-900/40 text-emerald-300 px-1.5 py-0.5 rounded">
                                  {isTask ? 'Task' : 'Promise'}
                                </span>
                                <span className="text-[10px] text-slate-500 ml-auto">
                                  Created {formatDate(item.createdAt)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => restore(item)}
                              title="Restore to active"
                              className="opacity-60 group-hover:opacity-100 text-slate-400 hover:text-emerald-400 p-1.5 transition"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;
