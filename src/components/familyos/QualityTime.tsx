import React, { useState, useEffect, useRef } from 'react';
import { Plus, Calendar, CheckCircle2, Sparkles, Trash2, Timer, X, Pencil, Check, Heart } from 'lucide-react';
import { KEYS, householdPillars, householdActivityTemplates, loadJSON, saveJSON, uid, callClaude, relativeDate, formatDate, loadMemberPreferences, buildHobbyPromptFragment } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { onSyncUpdate } from '@/lib/sync';
import { triggerConfetti } from '@/lib/confetti';
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
  indigo: 'from-indigo-950/50 to-slate-900/70 border-indigo-500/30',
  pink:   'from-pink-950/50 to-slate-900/70 border-pink-500/30',
  purple: 'from-purple-950/50 to-slate-900/70 border-purple-500/30',
  blue:   'from-blue-950/50 to-slate-900/70 border-blue-500/30',
  green:  'from-emerald-950/50 to-slate-900/70 border-emerald-500/30',
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
  const { householdMembers, currentUser } = useAppContext();
  const activityTemplates = householdActivityTemplates(householdMembers);
  const [pillars, setPillars] = useState<Pillar[]>(() => loadJSON(KEYS.pillars, householdPillars(householdMembers)));
  const [activities, setActivities] = useState<Activity[]>(() => loadJSON(KEYS.activities, []));
  const [modal, setModal] = useState({ open: false, title: '', body: '', loading: false });
  const [transition, setTransition] = useState<{ open: boolean; secondsLeft: number; activityName: string }>({ open: false, secondsLeft: 0, activityName: '' });
  // per-pillar edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ interests: string; favoriteColors: string[] }>({ interests: '', favoriteColors: [] });

  const lastAppliedPillarsJSON = useRef<string>(JSON.stringify(pillars));
  const lastAppliedActivitiesJSON = useRef<string>(JSON.stringify(activities));

  useEffect(() => {
    const json = JSON.stringify(pillars);
    if (json === lastAppliedPillarsJSON.current) return;
    lastAppliedPillarsJSON.current = json;
    saveJSON(KEYS.pillars, pillars);
  }, [pillars]);
  useEffect(() => {
    const json = JSON.stringify(activities);
    if (json === lastAppliedActivitiesJSON.current) return;
    lastAppliedActivitiesJSON.current = json;
    saveJSON(KEYS.activities, activities);
  }, [activities]);

  useEffect(() => onSyncUpdate((key) => {
    if (key === KEYS.pillars || key === '*') {
      const next = loadJSON<Pillar[]>(KEYS.pillars, householdPillars(householdMembers));
      lastAppliedPillarsJSON.current = JSON.stringify(next);
      setPillars(next);
    }
    if (key === KEYS.activities || key === '*') {
      const next = loadJSON<Activity[]>(KEYS.activities, []);
      lastAppliedActivitiesJSON.current = JSON.stringify(next);
      setActivities(next);
    }
  }), [householdMembers]);

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
    triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.4, 55);
  };

  const deleteActivity = (id: string) => setActivities(activities.filter((a) => a.id !== id));

  const startTransition = (activity: Activity) => {
    const minutesUntil = Math.max(1, Math.floor((activity.scheduledAt - Date.now()) / 60000));
    setTransition({ open: true, secondsLeft: Math.min(minutesUntil, 10) * 60, activityName: activity.name });
  };

  const aiSuggest = async () => {
    setModal({ open: true, title: 'Scheduling Suggestions', body: '', loading: true });
    const summary = pillars.map((p) => {
      const hobbyFragment = buildHobbyPromptFragment(loadMemberPreferences(p.id));
      return `${p.name}: last ${relativeDate(p.lastQualityTime)}, interests: ${p.interests}${hobbyFragment ? `, structured hobbies: ${hobbyFragment}` : ''}`;
    }).join('\n');
    const prompt = `Suggest 3 quality-time activities for this week based on:\n${summary}\n\nKeep it warm, specific, and actionable. 1-2 sentences each.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Scheduling Suggestions', body: text, loading: false });
  };

  const weeklyPlan = async () => {
    setModal({ open: true, title: 'Weekly Quality Time Plan', body: '', loading: true });
    const familyLine = householdMembers.length > 0
      ? householdMembers.map((m) => `${m.name} (${m.role})`).join(', ')
      : 'the household';
    const prompt = `It's Sunday. Help ${currentUser?.name || 'the user'} plan quality time this week.\nFamily: ${familyLine}.\nLast contact:\n${pillars.map((p) => `${p.name}: ${relativeDate(p.lastQualityTime)}`).join('\n')}\n\nSuggest a 7-day plan with one focus per day.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Weekly Quality Time Plan', body: text, loading: false });
  };

  const upcoming = activities.filter((a) => !a.completed).sort((a, b) => a.scheduledAt - b.scheduledAt);
  const weekStart = Date.now() - 7 * 86400000;
  const weeklyCount = activities.filter((a) => a.completed && a.scheduledAt > weekStart).length;
  const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <AlertModal {...modal} accent="indigo" onClose={() => setModal({ ...modal, open: false })} />

      {/* Transition mode */}
      {transition.open && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-indigo-950/95 via-slate-950/95 to-purple-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <button
            onClick={() => setTransition({ ...transition, open: false })}
            className="absolute top-6 right-6 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-4 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
            ADHD Transition Grounding
          </div>
          <div className="text-7xl md:text-9xl font-black text-white tabular-nums mb-6 tracking-tight drop-shadow-2xl">
            {fmtTime(transition.secondsLeft)}
          </div>
          <div className="text-2xl md:text-3xl text-white font-bold mb-8 tracking-tight">
            Transitioning to: <span className="text-indigo-300">{transition.activityName}</span>
          </div>
          <div className="text-slate-300 space-y-2.5 text-base max-w-sm mx-auto bg-white/5 border border-white/10 p-5 rounded-2xl">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-indigo-400" /> Close open browser and work tabs
            </div>
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-purple-400" /> Take a deep grounding breath
            </div>
            <div className="flex items-center gap-2 text-indigo-300 font-bold">
              <span className="w-2 h-2 rounded-full bg-pink-400" /> Give yourself full permission to be present
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              <Heart className="w-3 h-3 text-pink-400 fill-pink-400/30" /> Connection & Bonding
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Quality Time <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">Architect</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            {weeklyCount} moments of shared joy this week. Protect relational energy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={aiSuggest}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-500/20 active:scale-95 flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4" /> Suggest
          </button>
          <button
            onClick={weeklyPlan}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all shadow-md shadow-purple-500/20 active:scale-95 flex items-center gap-1.5"
          >
            <Calendar className="w-4 h-4" /> 7-Day Plan
          </button>
        </div>
      </div>

      {/* Four pillars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {pillars.map((p) => {
          const isEditing = editId === p.id;
          const cs = cardStyle(p);
          return (
            <div
              key={p.id}
              className={`rounded-2xl p-4 sm:p-5 border transition-all duration-300 backdrop-blur-md shadow-sm ${
                cs ? '' : `bg-gradient-to-br ${PILLAR_COLORS[p.color] || 'from-slate-900/60 to-slate-900/80 border-white/10'}`
              }`}
              style={cs}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-base sm:text-lg tracking-tight">{p.name}</span>
                  {/* Favourite color dots */}
                  {p.favoriteColors && p.favoriteColors.length > 0 && (
                    <div className="flex gap-1">
                      {p.favoriteColors.map(c => (
                        <span key={c} className="w-2.5 h-2.5 rounded-full border border-white/20 inline-block shadow-sm" style={{ background: c }} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300 font-medium bg-black/20 px-2 py-0.5 rounded-full">
                    Last: {relativeDate(p.lastQualityTime)}
                  </span>
                  <button
                    onClick={() => isEditing ? cancelEdit() : startEdit(p)}
                    className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-white/10"
                    title={isEditing ? 'Cancel' : 'Edit'}
                  >
                    {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-3 pt-1">
                  {/* Interests editor */}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 mb-1 block">Interests & Hobbies</label>
                    <textarea
                      className="w-full bg-slate-950/80 border border-white/10 focus:border-indigo-500 rounded-xl px-3 py-2 text-sm text-white resize-none outline-none"
                      rows={3}
                      value={editDraft.interests}
                      onChange={e => setEditDraft(d => ({ ...d, interests: e.target.value }))}
                      placeholder="Add interests, hobbies, favorites…"
                    />
                  </div>

                  {/* Color picker */}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 mb-1.5 block">
                      Favourite colors <span className="text-slate-500 font-normal">({editDraft.favoriteColors.length}/3 selected)</span>
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
                      <div className="mt-2 h-3.5 rounded-full overflow-hidden" style={{
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
                      className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl py-2 text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/20 active:scale-95"
                    >
                      <Check className="w-3.5 h-3.5" /> Save Changes
                    </button>
                    <button
                      onClick={() => { setEditDraft(d => ({ ...d, favoriteColors: [] })); }}
                      className="px-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl py-2 text-xs font-medium"
                    >
                      Clear colors
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">{p.interests}</p>
                  {p.id !== 'home' && (
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-slate-400">Open promises</span>
                      <span className="bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full font-semibold">
                        {promiseCount(p.name)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Templates */}
      <div className="space-y-2.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Quick Activity Templates</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {activityTemplates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => scheduleFromTemplate(tpl)}
              className="bg-slate-900/60 hover:bg-slate-900/90 border border-white/10 hover:border-indigo-500/40 rounded-2xl p-3.5 text-left transition-all group shadow-sm active:scale-95"
            >
              <div className="text-white text-sm font-bold tracking-tight">{tpl.name}</div>
              <div className="text-xs text-slate-400 mt-1">{tpl.person} · {tpl.duration}m</div>
              <div className="text-xs font-semibold text-indigo-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                + Schedule
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      <div className="space-y-2.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Upcoming Activities</div>
        {upcoming.length === 0 ? (
          <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-8 text-center text-slate-400 text-sm">
            Nothing scheduled yet. Pick an activity template above to reserve intentional time!
          </div>
        ) : (
          <div className="space-y-2.5">
            {upcoming.map((a) => (
              <div
                key={a.id}
                className="group bg-slate-900/50 backdrop-blur-sm border border-white/10 hover:border-white/20 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3.5 transition-all shadow-sm"
              >
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-bold tracking-tight">{a.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {a.person} · {a.duration}m · {formatDate(a.scheduledAt)} at {new Date(a.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                <button
                  onClick={() => startTransition(a)}
                  className="text-indigo-400 hover:text-white p-2 rounded-xl hover:bg-indigo-500/20 transition-all shrink-0"
                  title="ADHD Transition Timer"
                >
                  <Timer className="w-4 h-4" />
                </button>
                <button
                  onClick={() => completeActivity(a.id)}
                  title="Mark Completed"
                  className="text-slate-400 hover:text-emerald-400 p-2 rounded-xl hover:bg-emerald-500/20 transition-all shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteActivity(a.id)}
                  title="Delete"
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-2 rounded-xl hover:bg-rose-500/20 transition-all shrink-0"
                >
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

