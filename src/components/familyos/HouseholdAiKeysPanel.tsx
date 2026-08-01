import React, { useState, useEffect } from 'react';
import { Sparkles, Eye, EyeOff, Trash2 } from 'lucide-react';
import { authedFetch } from '@/lib/householdAuth';

interface KeyStatus { set: boolean; masked: string | null; }
interface StatusResponse { anthropic: KeyStatus; gemini: KeyStatus; }

const PROVIDERS: { id: 'anthropic' | 'gemini'; label: string; placeholder: string; accent: string }[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', placeholder: 'sk-ant-...', accent: 'focus:border-amber-500' },
  { id: 'gemini', label: 'Google (Gemini)', placeholder: 'AIza...', accent: 'focus:border-emerald-500' },
];

export function HouseholdAiKeysPanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({ anthropic: '', gemini: '' });
  const [show, setShow] = useState<Record<string, boolean>>({ anthropic: false, gemini: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/settings-keys', { method: 'GET' });
      if (res.ok) setStatus(await res.json());
    } catch {
      // leave status null — panel shows "unable to load" state below
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const save = async (provider: 'anthropic' | 'gemini') => {
    const apiKey = drafts[provider].trim();
    if (!apiKey) return;
    setError('');
    setBusy(provider);
    try {
      const res = await authedFetch('/api/settings-keys', {
        method: 'POST',
        body: JSON.stringify({ action: 'set', provider, apiKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to save key.');
        return;
      }
      setDrafts(d => ({ ...d, [provider]: '' }));
      await refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const clear = async (provider: 'anthropic' | 'gemini') => {
    setError('');
    setBusy(provider);
    try {
      const res = await authedFetch('/api/settings-keys', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear', provider }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to clear key.');
        return;
      }
      await refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <span className="font-semibold text-white text-sm">Household AI Keys</span>
        <span className="ml-auto text-xs text-slate-500">used by every AI feature, whole family</span>
      </div>
      <div className="px-4 py-3 space-y-4">
        <p className="text-xs text-slate-400">
          Bring your own Anthropic/Gemini API key to use your own billing instead of the app's shared keys.
          Applies to Hermes chat, briefings, Gmail suggestions, Walmart scanning, and vision scanning — for
          every member of this household, not just this device. Stored encrypted; never shown again after saving.
        </p>
        {error && <p className="text-rose-400 text-xs">{error}</p>}
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : !status ? (
          <p className="text-xs text-rose-400">Unable to load key status. Try reopening Settings.</p>
        ) : (
          PROVIDERS.map(p => {
            const s = status[p.id];
            return (
              <div key={p.id} className="space-y-1.5">
                <label className="text-xs text-slate-400 block">{p.label}</label>
                {s.set ? (
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5">
                    <span className="text-sm text-emerald-300 font-mono flex-1">{s.masked || 'key set'}</span>
                    <button
                      onClick={() => clear(p.id)}
                      disabled={busy === p.id}
                      title="Remove — fall back to shared key"
                      className="text-rose-400 hover:text-rose-300 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={show[p.id] ? 'text' : 'password'}
                        value={drafts[p.id]}
                        onChange={e => setDrafts(d => ({ ...d, [p.id]: e.target.value }))}
                        placeholder={p.placeholder}
                        className={`w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 pr-10 text-white text-sm outline-none ${p.accent}`}
                      />
                      <button
                        onClick={() => setShow(s2 => ({ ...s2, [p.id]: !s2[p.id] }))}
                        className="absolute right-3 top-3 text-slate-400 hover:text-white"
                      >
                        {show[p.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      onClick={() => save(p.id)}
                      disabled={busy === p.id || !drafts[p.id].trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-4 py-2.5 rounded-lg transition flex-shrink-0"
                    >
                      {busy === p.id ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
