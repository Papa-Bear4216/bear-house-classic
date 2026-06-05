import React, { useState, useEffect } from 'react';
import { Plus, Calendar, CheckCircle2, Sparkles, Trash2, Timer, X, Pencil, Check } from 'lucide-react';
import { KEYS, DEFAULT_PILLARS, ACTIVITY_TEMPLATES, loadJSON, saveJSON, uid, callClaude, relativeDate, formatDate } from '@/lib/familyos';
import AlertModal from './AlertModal';

interface Activity {
  id: string;
  name: string;
  person: string;
  duration: number;
  scheduledAt: number;
  completed: boolean;
}

interface Pillar {
  id: string;
  name: string;
  color: string;
  interests: string;
  lastQualityTime: number | null;
  favoriteColors?: string[];
}

// Tailwind fallback gradients (used when no favoriteColors chosen)
const PILLAR_COLORS: Record<string, string> = {
  indigo: 'from-indigo-900/40 to-slate-800 border-indigo-500/30',
  pink:   'from-pink-900/40 to-slate-800 border-pink-500/30',
  purple: 'from-purple-900/40 to-slate-800 border-purple-500/30',
  blue:   'from-blue-900/40 to-slate-800 border-blue-500/30',
  green:  'from-emerald-900/40 to-slate-800 border-emerald-500/30',
};

const COLOR_PALETTE = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635',
  '#34d399', '#22d3ee', '#60a5fa', '#818cf8',
  '#a78bfa', '#e879f9', '#f472b6', '#f9a8d4',
  '#c4b5fd', '#fde68a', '#6ee7b7', '#94a3b8',
];

function cardStyle(p: Pillar): React.CSSProperties | undefined {
  const fc = p.favoriteColors;
  if (!fc || fc.length === 0) return undefined;
  const stops = fc.length === 1
    ? `${fc[0]}28 0%, ${fc[0]}14 100%`
    : fc.length === 2
    ? `${fc[0]}28 0%, ${fc[1]}28 100%`
    : `${fc[0]}28 0%, ${fc[1]}18 50%, ${fc[2]}28 100%`;
  return {
    background: `linear-gradient(135deg, ${stops})`,
    borderColor: `${fc[0]}55`,
  };
}

const QualityTime: React.FC = () => {
  const [pillars, setPillars] = useState<Pillar[]>(() => loadJSON(KEYS.pillars, DEFAULT_PILLARS));
  const [activities, setActivities] = useState<Activity[]>(() => loadJSON(KEYS.activities, []));
  const [modal, setModal] = useState({ open: false, title: '', body: '', loading: false });
  const [transition, setTransition] = useState<{ open: boolean; secondsLeft: number; activityName: string }>({ open: false, secondsLeft: 0, activityName: '' });
  // per-pillar edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ interests: string; favoriteColors: string[] }>({ interests: '', favoriteColors: [] });

  useEffect(() => saveJSON(KEYS.pillars, pillars), [pillars]);
  useEffect(() => saveJSON(KEYS.activities, activities), [activities]);

  useEffect(() => {
    if (!transition.open || transition.secondsLeft <= 0) return;
    const t = setInterval(() => {
      setTransition((prev) => ({ ...prev, secondsLeft: Math.max(0, prev.secondsLeft - 1) }));
    }, 1000);
    return () => clearInterval(t);
  }, [transition.open, transition.secondsLeft]);

  const promises = loadJSON<any[]>(KEYS.promises, []);
  const promiseCount = (person: string) => promises.filter((p) => !p.completed && p.person === person).length;

  const startEdit = (p: Pillar) => {
    setEditId(p.id);
    setEditDraft({ interests: p.interests, favoriteColors: p.favoriteColors || [] });
  };

  const saveEdit = (id: string) => {
    setPillars(prev => prev.map(p => p.id === id ? { ...p, ...editDraft } : p));
    setEditId(null);
  };

  const cancelEdit = () => setEditId(null);

  const toggleColor = (hex: string) => {
    setEditDraft(prev => {
      const has = prev.favoriteColors.includes(hex);
      if (has) return { ...prev, favoriteColors: prev.favoriteColors.filter(c => c !== hex) };
      if (prev.favoriteColors.length >= 3) return prev; // max 3
      return { ...prev, favoriteColors: [...prev.favoriteColors, hex] };
    });
  };

  const scheduleFromTemplate = (tpl: any) => {
    const when = prompt(`Schedule "${tpl.name}" for when? (e.g. "Tonight 7pm" or leave blank = now)`);
    const scheduledAt = when ? Date.parse(when) || Date.now() + 3600000 : Date.now() + 3600000;
    const a: Activity = { id: uid(), name: tpl.name, person: tpl.person, duration: tpl.duration, scheduledAt, completed: false };
    setActivities([a, ...activities]);
  };

  const completeActivity = (id: string) => {
    const act = activities.find((a) => a.id === id);
    setActivities(activities.map((a) => (a.id === id ? { ...a, completed: true } : a)));
    if (act) {
      const personId = act.person.toLowerCase();
      setPillars(pillars.map((p) => (p.id === personId || (p.id === 'home' && act.person === 'Family') ? { ...p, lastQualityTime: Date.now() } : p)));
    }
  };

  const deleteActivity = (id: string) => setActivities(activities.filter((a) => a.id !== id));

  const startTransition = (activity: Activity) => {
    const minutesUntil = Math.max(1, Math.floor((activity.scheduledAt - Date.now()) / 60000));
    setTransition({ open: true, secondsLeft: Math.min(minutesUntil, 10) * 60, activityName: activity.name });
  };

  const aiSuggest = async () => {
    setModal({ open: true, title: 'Scheduling Suggestions', body: '', loading: true });
    const summary = pillars.map((p) => `${p.name}: last ${relativeDate(p.lastQualityTime)}, interests: ${p.interests}`).join('\n');
    const prompt = `Suggest 3 quality-time activities for this week based on:\n${summary}\n\nKeep it warm, specific, and actionable. 1-2 sentences each.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Scheduling Suggestions', body: text, loading: false });
  };

  const weeklyPlan = async () => {
    setModal({ open: true, title: 'Weekly Quality Time Plan', body: '', loading: true });
    const prompt = `It's Sunday. Help Daddy plan quality time this week.\nFamily: Mommy, Abriana, Julia, Lucy (dog).\nLast contact:\n${pillars.map((p) => `${p.name}: ${relativeDate(p.lastQualityTime)}`).join('\n')}\n\nSuggest a 7-day plan with one focus per day.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Weekly Quality Time Plan', body: text, loading: false });
  };

  const upcoming = activities.filter((a) => !a.completed).sort((a, b) => a.scheduledAt - b.scheduledAt);
  const weekStart = Date.now() - 7 * 86400000;
  const weeklyCount = activities.filter((a) => a.completed && a.scheduledAt > weekStart).length;
  const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      <AlertModal {...modal} accent="indigo" onClose={() => setModal({ ...modal, open: false })} />

      {/* Transition mode */}
      {transition.open && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 flex flex-col items-center justify-center p-6 text-center">
          <button onClick={() => setTransition({ ...transition, open: false })} className="absolute top-6 right-6 text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          <div className="text-indigo-300 text-sm uppercase tracking-widest mb-4">Transition Mode</div>
          <div className="text-7xl md:text-9xl font-bold text-white tabular-nums mb-6">{fmtTime(transition.secondsLeft)}</div>
          <div className="text-2xl md:text-3xl text-white font-light mb-8">Until {transition.activityName}</div>
          <div className="text-slate-300 space-y-2 text-lg">
            <div>Close work tabs</div>
            <div>Clear your mind</div>
            <div className="text-indigo-300 font-semibold">Be present</div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Quality Time Architect</h2>
          <p className="text-sm text-slate-400">{weeklyCount} activities completed this week</p>
        </div>
        <div className="flex gap-2">
          <button onClick={aiSuggest} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Suggest
          </button>
          <button onClick={weeklyPlan} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Plan
          </button>
        </div>
      </div>

      {/* Four pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pillars.map((p) => {
          const isEditing = editId === p.id;
          const cs = cardStyle(p);
          return (
            <div
              key={p.id}
              className={`rounded-2xl p-4 border transition-all duration-300 ${cs ? '' : `bg-gradient-to-br ${PILLAR_COLORS[p.color]}`}`}
              style={cs}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-lg">{p.name}</span>
                  {/* Favourite color dots */}
                  {p.favoriteColors && p.favoriteColors.length > 0 && (
                    <div className="flex gap-1">
                      {p.favoriteColors.map(c => (
                        <span key={c} className="w-3 h-3 rounded-full border border-white/20 inline-block" style={{ background: c }} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300">Last: {relativeDate(p.lastQualityTime)}</span>
                  <button
                    onClick={() => isEditing ? cancelEdit() : startEdit(p)}
                    className="text-slate-400 hover:text-white transition p-1 rounded"
                    title={isEditing ? 'Cancel' : 'Edit'}
                  >
                    {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  {/* Interests editor */}
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Interests</label>
                    <textarea
                      className="w-full bg-slate-900/70 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-indigo-500"
                      rows={3}
                      value={editDraft.interests}
                      onChange={e => setEditDraft(d => ({ ...d, interests: e.target.value }))}
                      placeholder="Add interests, hobbies, favorites…"
                    />
                  </div>

                  {/* Color picker */}
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">
                      Favourite colors <span className="text-slate-500">({editDraft.favoriteColors.length}/3 selected)</span>
                    </label>
                    <div className="grid grid-cols-8 gap-1.5">
                      {COLOR_PALETTE.map(hex => {
                        const selected = editDraft.favoriteColors.includes(hex);
                        const idx = editDraft.favoriteColors.indexOf(hex);
                        return (
                          <button
                            key={hex}
                            onClick={() => toggleColor(hex)}
                            className="relative w-7 h-7 rounded-full border-2 transition-all hover:scale-110 focus:outline-none"
                            style={{
                              background: hex,
                              borderColor: selected ? '#fff' : 'transparent',
                              boxShadow: selected ? `0 0 0 1px ${hex}` : 'none',
                            }}
                            title={hex}
                          >
                            {selected && (
                              <span className="absolute inset-0 flex items-center justify-center text-white font-bold" style={{ fontSize: '10px', textShadow: '0 1px 2px #000' }}>
                                {idx + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {editDraft.favoriteColors.length > 0 && (
                      <div className="mt-2 h-4 rounded-full overflow-hidden" style={{
                        background: editDraft.favoriteColors.length === 1
                          ? editDraft.favoriteColors[0]
                          : `linear-gradient(90deg, ${editDraft.favoriteColors.join(', ')})`,
                      }} />
                    )}
                  </div>

                  {/* Save / clear */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => saveEdit(p.id)}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-1.5 text-sm flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                    <button
                      onClick={() => { setEditDraft(d => ({ ...d, favoriteColors: [] })); }}
                      className="px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg py-1.5 text-xs"
                    >
                      Clear colors
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-300 mt-1 line-clamp-2">{p.interests}</p>
                  {p.id !== 'home' && (
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Open promises</span>
                      <span className="bg-blue-900/40 border border-blue-500/30 text-blue-200 px-2 py-0.5 rounded-full">{promiseCount(p.name)}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Templates */}
      <div>
        <div className="text-sm text-slate-400 mb-2">Activity Templates</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ACTIVITY_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => scheduleFromTemplate(tpl)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg p-3 text-left transition group"
            >
              <div className="text-white text-sm font-semibold">{tpl.name}</div>
              <div className="text-xs text-slate-400 mt-1">{tpl.person} · {tpl.duration}m</div>
              <div className="text-xs text-indigo-400 mt-2 opacity-0 group-hover:opacity-100 transition">+ Schedule</div>
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      <div>
        <div className="text-sm text-slate-400 mb-2">Upcoming Activities</div>
        {upcoming.length === 0 ? (
          <div className="bg-slate-800/50 border border-dashed border-slate-700 rounded-2xl p-6 text-center text-slate-400 text-sm">
            Nothing scheduled. Pick a template above.
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((a) => (
              <div key={a.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3 flex items-center gap-3">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-slate-400">{a.person} · {a.duration}m · {formatDate(a.scheduledAt)} {new Date(a.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                </div>
                <button onClick={() => startTransition(a)} className="text-indigo-400 hover:text-indigo-300 p-1.5" title="Transition mode">
                  <Timer className="w-4 h-4" />
                </button>
                <button onClick={() => completeActivity(a.id)} className="text-emerald-400 hover:text-emerald-300 p-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button onClick={() => deleteActivity(a.id)} className="text-slate-500 hover:text-rose-400 p-1.5">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QualityTime;
