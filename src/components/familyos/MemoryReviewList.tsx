import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { authedFetch } from '@/lib/householdAuth';

interface PendingMemory {
  id: string;
  text: string;
  kind: string;
  subject_member_id?: string | null;
}

export function MemoryReviewList() {
  const [notes, setNotes] = useState<PendingMemory[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await authedFetch('/api/memory', {
        method: 'POST', body: JSON.stringify({ action: 'listPending' }),
      });
      if (!res.ok) throw new Error('Unable to load memory review items.');
      const data = await res.json();
      setNotes(Array.isArray(data.notes) ? data.notes : []);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load memory review items.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const setStatus = async (note: PendingMemory, status: 'active' | 'archived') => {
    setBusyId(note.id);
    setError('');
    try {
      const res = await authedFetch('/api/memory', {
        method: 'POST', body: JSON.stringify({ action: 'setStatus', id: note.id, status }),
      });
      if (!res.ok) throw new Error('Unable to update this memory.');
      setNotes((current) => current.filter((item) => item.id !== note.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update this memory.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-700 overflow-hidden" aria-label="Hermes memory review">
      <header className="px-4 py-3 bg-slate-900">
        <h3 className="font-semibold text-white text-sm">Hermes is unsure about these — keep or drop</h3>
        <p className="mt-1 text-xs text-slate-400">Inferred patterns wait here until an admin reviews them.</p>
      </header>
      <div className="p-4 space-y-3">
        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
        {!notes.length && !error && <p className="text-xs text-slate-400">Nothing needs review.</p>}
        {notes.map((note) => (
          <article key={note.id} className="rounded-lg border border-slate-700 bg-slate-950 p-3">
            <p className="text-sm text-slate-200">{note.text}</p>
            <p className="mt-1 text-xs text-slate-500">{note.kind}{note.subject_member_id ? ' · member-specific' : ''}</p>
            <div className="mt-3 flex gap-2">
              <button disabled={busyId === note.id} onClick={() => void setStatus(note, 'active')} className="inline-flex items-center gap-1 rounded bg-emerald-900/60 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-50">
                {busyId === note.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Keep
              </button>
              <button disabled={busyId === note.id} onClick={() => void setStatus(note, 'archived')} className="inline-flex items-center gap-1 rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50">
                <X className="h-3 w-3" /> Drop
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
