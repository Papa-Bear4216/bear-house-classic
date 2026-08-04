import React, { useState } from 'react';
import { Brain } from 'lucide-react';
import { authedFetch } from '@/lib/householdAuth';
import { useAppContext } from '@/contexts/AppContext';

export function HermesModelPanel() {
  const { hermesModelTier } = useAppContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setTier = async (tier: 'haiku' | 'sonnet') => {
    if (tier === hermesModelTier || busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await authedFetch('/api/hermes-model', {
        method: 'POST',
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to update.');
        return;
      }
      // Takes effect on next session load (AppContext reads it from Supabase).
      window.location.reload();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900">
        <Brain className="w-4 h-4 text-indigo-400" />
        <span className="font-semibold text-white text-sm">Hermes Reasoning</span>
        <span className="ml-auto text-xs text-slate-500">whole household</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-slate-400">
          Haiku is fast and cheap — good for everyday questions and quick actions. Sonnet reasons better
          on multi-step requests ("add these 3 tasks and log how I'm feeling") at meaningfully higher cost
          per message.
        </p>
        {error && <p className="text-rose-400 text-xs">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTier('haiku')}
            disabled={busy}
            className={`text-sm rounded-lg py-2.5 transition disabled:opacity-40 ${
              hermesModelTier === 'haiku'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-950 border border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            Haiku (default)
          </button>
          <button
            onClick={() => setTier('sonnet')}
            disabled={busy}
            className={`text-sm rounded-lg py-2.5 transition disabled:opacity-40 ${
              hermesModelTier === 'sonnet'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-950 border border-slate-700 text-slate-300 hover:border-slate-600'
            }`}
          >
            Sonnet (smarter)
          </button>
        </div>
      </div>
    </div>
  );
}
