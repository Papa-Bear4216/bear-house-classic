import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Sparkles, Trash2, AlertTriangle, Heart } from 'lucide-react';
import { KEYS, EMOTION_CATEGORIES, NEGATIVE_EMOTIONS, loadJSON, saveJSON, uid, callClaude, tryParseJSON, formatDate, householdPersons } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
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

  useEffect(() => saveJSON(KEYS.emotions, entries), [entries]);

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
        // alert flagged but not auto-shown - they can click pattern button
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

  return (
    <div className="space-y-5">
      <AlertModal {...modal} accent="rose" onClose={() => setModal({ ...modal, open: false })} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Emotions</h2>
          <p className="text-sm text-slate-400">Notice. Name. Hold space.</p>
        </div>
        <button onClick={patternCheck} className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Patterns
        </button>
      </div>

      {flagged.length > 0 && (
        <div className="bg-rose-900/30 border border-rose-500/40 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          <div className="text-sm text-rose-200">
            Pattern alert: 3+ tough check-ins this week for <span className="font-semibold">{flagged.join(', ')}</span>. Worth a gentle conversation.
          </div>
        </div>
      )}

      {/* Log form */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 space-y-3">
        <div className="flex gap-2">
          {people.map((p) => (
            <button
              key={p}
              onClick={() => setPerson(p)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition ${
                person === p ? 'bg-rose-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          value={feeling}
          onChange={(e) => setFeeling(e.target.value)}
          placeholder="What are they feeling? (e.g. anxious about school)"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:border-rose-500 outline-none"
        />
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Context (optional)"
          rows={2}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:border-rose-500 outline-none resize-none"
        />
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Intensity</span>
            <span className="text-rose-400 font-bold">{intensity}/10</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={intensity}
            onChange={(e) => setIntensity(parseInt(e.target.value))}
            className="w-full accent-rose-500"
          />
        </div>
        <button onClick={log} className="w-full bg-rose-600 hover:bg-rose-500 text-white rounded-lg py-2.5 font-medium flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Log Check-in
        </button>
        {aiBusy && <div className="text-xs text-rose-400 flex items-center gap-2"><Sparkles className="w-3 h-3 animate-pulse" /> Reflecting...</div>}
      </div>

      {/* Recent */}
      <div>
        <div className="text-sm text-slate-400 mb-2">Recent Check-ins</div>
        {entries.length === 0 ? (
          <div className="bg-slate-800/50 border border-dashed border-slate-700 rounded-2xl p-8 text-center text-slate-400">
            <Heart className="w-10 h-10 mx-auto mb-3 text-rose-400/60" />
            <p className="font-medium text-white">Nothing logged yet</p>
            <p className="text-sm">Start with one feeling you noticed today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.slice(0, 30).map((e) => (
              <div key={e.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] uppercase tracking-wide bg-rose-900/40 text-rose-300 px-1.5 py-0.5 rounded">{e.person}</span>
                  {e.category && <span className="text-[10px] uppercase tracking-wide bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">{e.category}</span>}
                  <span className="text-[10px] text-slate-500">Intensity {e.intensity}/10</span>
                  <span className="text-[10px] text-slate-500 ml-auto">{formatDate(e.createdAt)}</span>
                  <button onClick={() => remove(e.id)} className="text-slate-500 hover:text-rose-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-white text-sm font-medium">{e.feeling}</div>
                {e.context && <div className="text-xs text-slate-400 mt-1">{e.context}</div>}
                {e.insight && (
                  <div className="mt-2 text-xs text-rose-200 bg-rose-900/20 border border-rose-500/20 rounded px-3 py-2 flex gap-2">
                    <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span className="italic">{e.insight}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Emotions;
