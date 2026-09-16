import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Sparkles, Trash2, AlertTriangle, Heart, Activity } from 'lucide-react';
import { KEYS, EMOTION_CATEGORIES, NEGATIVE_EMOTIONS, loadJSON, saveJSON, uid, callClaude, tryParseJSON, formatDate } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { onSyncUpdate } from '@/lib/sync';
import { triggerConfetti } from '@/lib/confetti';
import AlertModal from './AlertModal';

interface Entry {
  id: string;
  person: string;
  feeling: string;
  context: string;
  intensity: number;
  category?: string;
  insight?: string;
  createdAt: number;
}

const INTENSITY_MOODS: Record<number, { label: string; emoji: string; color: string }> = {
  1: { label: 'Deep Calm', emoji: '🧘', color: 'text-emerald-400' },
  2: { label: 'Peaceful', emoji: '🌿', color: 'text-emerald-400' },
  3: { label: 'Content', emoji: '🌤️', color: 'text-teal-400' },
  4: { label: 'Tired / Meh', emoji: '🥱', color: 'text-sky-400' },
  5: { label: 'Restless', emoji: '⚡', color: 'text-amber-400' },
  6: { label: 'Stressed', emoji: '😬', color: 'text-amber-400' },
  7: { label: 'Overwhelmed', emoji: '🌪️', color: 'text-orange-400' },
  8: { label: 'Angry / Anxious', emoji: '💥', color: 'text-rose-400' },
  9: { label: 'Near Meltdown', emoji: '💔', color: 'text-rose-500' },
  10: { label: 'Crisis / Burnout', emoji: '🌋', color: 'text-rose-600' },
};

const Emotions: React.FC = () => {
  const { householdMembers } = useAppContext();
  const people = householdMembers.map((m) => m.name);
  const [entries, setEntries] = useState<Entry[]>(() => loadJSON(KEYS.emotions, []));
  const [person, setPerson] = useState(people[0] || '');
  const [feeling, setFeeling] = useState('');
  const [context, setContext] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [aiBusy, setAiBusy] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', body: '', loading: false });

  const lastAppliedJSON = useRef<string>(JSON.stringify(entries));

  useEffect(() => {
    const json = JSON.stringify(entries);
    if (json === lastAppliedJSON.current) return;
    lastAppliedJSON.current = json;
    saveJSON(KEYS.emotions, entries);
  }, [entries]);

  useEffect(() => onSyncUpdate((key) => {
    if (key !== KEYS.emotions && key !== '*') return;
    const next = loadJSON<Entry[]>(KEYS.emotions, []);
    lastAppliedJSON.current = JSON.stringify(next);
    setEntries(next);
  }), []);

  // Seed the selected person once the household roster loads.
  useEffect(() => {
    if (!person && people.length > 0) setPerson(people[0]);
  }, [people, person]);

  // Pattern check on mount
  useEffect(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = entries.filter((e) => e.createdAt > weekAgo);
    people.forEach((p) => {
      const negative = recent.filter((e) => e.person === p && e.category && NEGATIVE_EMOTIONS.includes(e.category));
      if (negative.length >= 3) {
        // alert flagged but not auto-shown
      }
    });
  }, [entries, people]);

  const log = async () => {
    if (!feeling.trim()) return;
    const base: Entry = {
      id: uid(),
      person,
      feeling: feeling.trim(),
      context: context.trim(),
      intensity,
      createdAt: Date.now(),
    };
    setEntries([base, ...entries]);
    setFeeling('');
    setContext('');
    setIntensity(5);

    triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.45, 35);

    setAiBusy(true);
    const prompt = `Categorize this emotional check-in. Return ONLY JSON: {"category":"one of: ${EMOTION_CATEGORIES.join(', ')}","insight":"one warm, honest sentence reflection"}\n\nPerson: ${person}\nFeeling: ${feeling}\nContext: ${context}\nIntensity: ${intensity}/10`;
    const { ok, text } = await callClaude(prompt);
    if (ok) {
      const parsed = tryParseJSON<{ category?: string; insight?: string }>(text, {});
      setEntries((prev) => prev.map((e) => (e.id === base.id ? { ...e, category: parsed.category, insight: parsed.insight } : e)));
    }
    setAiBusy(false);
  };

  const remove = (id: string) => setEntries(entries.filter((e) => e.id !== id));

  const patternCheck = async () => {
    setModal({ open: true, title: 'Pattern Check', body: '', loading: true });
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = entries.filter((e) => e.createdAt > weekAgo);
    if (recent.length === 0) {
      setModal({ open: true, title: 'Pattern Check', body: 'No entries this week. Log a check-in to start tracking patterns.', loading: false });
      return;
    }
    const summary = recent.map((e) => `${e.person}: ${e.feeling} (${e.category || 'uncat'}, ${e.intensity}/10)`).join('\n');
    const prompt = `Analyze emotional patterns from this week's check-ins:\n${summary}\n\nFlag concerning patterns gently. 4 sentences max.`;
    const { text } = await callClaude(prompt);
    setModal({ open: true, title: 'Pattern Check', body: text, loading: false });
  };

  const flagged = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const list: string[] = [];
    people.forEach((p) => {
      const negative = entries.filter((e) => e.createdAt > weekAgo && e.person === p && e.category && NEGATIVE_EMOTIONS.includes(e.category));
      if (negative.length >= 3) list.push(p);
    });
    return list;
  }, [entries, people]);

  const currentMood = INTENSITY_MOODS[intensity] || INTENSITY_MOODS[5];

  return (
    <div className="space-y-6">
      <AlertModal {...modal} accent="rose" onClose={() => setModal({ ...modal, open: false })} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-rose-500/15 text-rose-300 border border-rose-500/30">
              <Heart className="w-3 h-3 text-rose-400 fill-rose-400/30" /> Emotional Safety
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Emotional <span className="bg-gradient-to-r from-rose-400 via-pink-300 to-amber-300 bg-clip-text text-transparent">Weather</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Notice. Name. Hold space without judgment or fix-it mode.</p>
        </div>
        <button
          onClick={patternCheck}
          className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all shadow-md shadow-rose-500/20 active:scale-95 flex items-center gap-2 shrink-0"
        >
          <Sparkles className="w-4 h-4" /> Weekly Patterns
        </button>
      </div>

      {flagged.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-4 flex items-center gap-3.5 shadow-lg">
          <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          </div>
          <div className="text-xs sm:text-sm text-rose-200">
            Pattern alert: 3+ difficult check-ins this week for <span className="font-bold text-white underline">{flagged.join(', ')}</span>. Worth a quiet cuddle or gentle check-in.
          </div>
        </div>
      )}

      {/* Log form */}
      <div className="bg-slate-900/70 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        {/* Person Selector */}
        <div>
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2 block">Checking In For</label>
          <div className="flex gap-2 flex-wrap">
            {people.map((p) => {
              const isSelected = person === p;
              return (
                <button
                  key={p}
                  onClick={() => setPerson(p)}
                  className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-500/20'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  <span className="w-5 h-5 rounded-md bg-black/20 flex items-center justify-center text-[10px] font-bold">
                    {p.charAt(0).toUpperCase()}
                  </span>
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">What's the feeling?</label>
          <input
            value={feeling}
            onChange={(e) => setFeeling(e.target.value)}
            placeholder="e.g. Anxious about tomorrow's math test, frustrated by clutter..."
            className="w-full bg-white/[0.04] border border-white/10 focus:border-rose-500 focus:bg-white/[0.07] rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-all placeholder:text-slate-500 shadow-inner"
          />
        </div>

        <div>
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">Context or triggers (optional)</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Did something specific happen? Low sleep, skipped lunch, overstimulation?"
            rows={2}
            className="w-full bg-white/[0.04] border border-white/10 focus:border-rose-500 focus:bg-white/[0.07] rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-all placeholder:text-slate-500 resize-none shadow-inner"
          />
        </div>

        {/* Intensity slider with live emotional feedback */}
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-semibold uppercase tracking-wider">Internal Intensity</span>
            <span className="text-white font-bold flex items-center gap-1.5">
              <span className="text-base">{currentMood.emoji}</span>
              <span className={currentMood.color}>{currentMood.label}</span>
              <span className="text-slate-500">({intensity}/10)</span>
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={intensity}
            onChange={(e) => setIntensity(parseInt(e.target.value))}
            className="w-full accent-rose-500 cursor-pointer h-2 bg-white/10 rounded-lg appearance-none"
          />
        </div>

        <button
          onClick={log}
          disabled={!feeling.trim()}
          className="w-full bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-40 text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2 shadow-md shadow-rose-500/20 transition-all active:scale-98"
        >
          <Plus className="w-4 h-4" /> Log Emotional Check-in
        </button>

        {aiBusy && (
          <div className="text-xs text-rose-300 flex items-center gap-2 animate-pulse">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Hermes is generating a compassionate reflection...
          </div>
        )}
      </div>

      {/* Recent Entries */}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recent Reflections</div>
        {entries.length === 0 ? (
          <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-10 text-center text-slate-400">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <Heart className="w-7 h-7 text-rose-400" />
            </div>
            <p className="font-bold text-white text-base">Nothing logged yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Start with one feeling you or a family member noticed today.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.slice(0, 30).map((e) => {
              const mood = INTENSITY_MOODS[e.intensity] || INTENSITY_MOODS[5];
              return (
                <div
                  key={e.id}
                  className="group bg-slate-900/50 backdrop-blur-sm border border-white/10 hover:border-white/20 rounded-2xl p-4 transition-all shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 border border-rose-500/30 text-rose-300 px-2 py-0.5 rounded-full">
                      {e.person}
                    </span>
                    {e.category && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-white/5 border border-white/10 text-slate-300 px-2 py-0.5 rounded-full">
                        {e.category}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <span>{mood.emoji}</span>
                      <span>{e.intensity}/10</span>
                    </span>
                    <span className="text-[10px] text-slate-500 ml-auto">{formatDate(e.createdAt)}</span>
                    <button
                      onClick={() => remove(e.id)}
                      title="Remove entry"
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-white text-sm font-semibold tracking-tight">{e.feeling}</div>
                  {e.context && <div className="text-xs text-slate-400 mt-1 leading-relaxed">{e.context}</div>}

                  {e.insight && (
                    <div className="mt-3 text-xs text-rose-200 bg-rose-950/30 border border-rose-500/20 rounded-xl p-3 flex gap-2.5 leading-relaxed shadow-sm">
                      <Sparkles className="w-3.5 h-3.5 mt-0.5 text-amber-400 shrink-0" />
                      <span className="italic">{e.insight}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Emotions;
