import React, { useState } from 'react';
import { Brain, Plus, Trash2, Save, X } from 'lucide-react';
import { uid } from '@/lib/familyos';
import {
  loadMemory,
  saveMemory,
  MemoryEntry,
  MemoryCategory,
  CATEGORY_LABELS,
  CATEGORY_HINTS,
} from '@/lib/householdMemory';

const CATEGORIES: MemoryCategory[] = ['rule', 'inventory', 'procedure'];

const HouseholdMemory: React.FC = () => {
  const [entries, setEntries] = useState<MemoryEntry[]>(() => loadMemory());
  const [draftCat, setDraftCat] = useState<MemoryCategory>('rule');
  const [draftText, setDraftText] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const persist = (next: MemoryEntry[]) => {
    setEntries(next);
    saveMemory(next);
  };

  const addEntry = () => {
    const text = draftText.trim();
    if (!text) return;
    const now = Date.now();
    persist([
      { id: uid(), category: draftCat, text, source: 'manual', createdAt: now, updatedAt: now },
      ...entries,
    ]);
    setDraftText('');
  };

  const removeEntry = (id: string) => persist(entries.filter(e => e.id !== id));

  const startEdit = (e: MemoryEntry) => { setEditId(e.id); setEditText(e.text); };
  const saveEdit = () => {
    if (!editId) return;
    const text = editText.trim();
    if (!text) { setEditId(null); return; }
    persist(entries.map(e => (e.id === editId ? { ...e, text, updatedAt: Date.now() } : e)));
    setEditId(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Household Brain</h2>
          <p className="text-sm text-slate-400">
            Facts the AI should know about your home. Everything here is given to the assistant
            on every request, so it answers with your actual rules, inventory, and procedures.
          </p>
        </div>
      </div>

      {/* Add new entry */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setDraftCat(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                draftCat === cat ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <textarea
          value={draftText}
          onChange={e => setDraftText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addEntry(); }}
          placeholder={CATEGORY_HINTS[draftCat]}
          rows={2}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500 resize-y"
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">⌘/Ctrl + Enter to add</span>
          <button
            onClick={addEntry}
            disabled={!draftText.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" /> Add fact
          </button>
        </div>
      </div>

      {/* Entries grouped by category */}
      {entries.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          No household facts yet. Add your first one above — the AI will start using it right away.
        </div>
      ) : (
        CATEGORIES.map(cat => {
          const catEntries = entries.filter(e => e.category === cat);
          if (!catEntries.length) return null;
          return (
            <div key={cat} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {CATEGORY_LABELS[cat]} <span className="text-slate-600">({catEntries.length})</span>
              </h3>
              {catEntries.map(e => (
                <div
                  key={e.id}
                  className="group bg-slate-800/40 border border-slate-700/60 rounded-xl px-3 py-2.5 flex items-start gap-2"
                >
                  {editId === e.id ? (
                    <>
                      <textarea
                        value={editText}
                        onChange={ev => setEditText(ev.target.value)}
                        rows={2}
                        autoFocus
                        className="flex-1 bg-slate-900 border border-orange-500 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none resize-y"
                      />
                      <button onClick={saveEdit} className="p-1.5 text-emerald-400 hover:text-emerald-300" title="Save">
                        <Save className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditId(null)} className="p-1.5 text-slate-400 hover:text-white" title="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(e)}
                        className="flex-1 text-left text-sm text-slate-200 hover:text-white"
                        title="Click to edit"
                      >
                        {e.text}
                      </button>
                      <button
                        onClick={() => removeEntry(e.id)}
                        className="p-1 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
};

export default HouseholdMemory;
