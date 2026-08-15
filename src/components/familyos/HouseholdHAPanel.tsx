import React, { useState, useEffect } from 'react';
import { Home, Eye, EyeOff, Trash2 } from 'lucide-react';
import { authedFetch } from '@/lib/householdAuth';

interface StatusResponse { set: boolean; url: string | null; }

export function HouseholdHAPanel() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/settings-ha', { method: 'GET' });
      if (res.ok) setStatus(await res.json());
    } catch {
      // leave status null — panel shows "unable to load" state below
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    if (!url.trim() || !token.trim()) return;
    setError('');
    setBusy(true);
    try {
      const res = await authedFetch('/api/settings-ha', {
        method: 'POST',
        body: JSON.stringify({ action: 'set', url: url.trim(), token: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to connect.');
        return;
      }
      setUrl(''); setToken('');
      await refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await authedFetch('/api/settings-ha', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to disconnect.');
        return;
      }
      await refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900">
        <Home className="w-4 h-4 text-rose-400" />
        <span className="font-semibold text-white text-sm">Your Home Assistant</span>
        <span className="ml-auto text-xs text-slate-500">device control, cameras, health checks</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-slate-400">
          Connect your own Home Assistant instance (self-hosted or a Nabu Casa remote URL) so this
          household's device control, camera view, and health checks talk to your house — not a
          shared instance. Requires a long-lived access token from your HA profile (Settings → your
          profile → Security → Long-Lived Access Tokens). We test the connection before saving; the
          token is stored encrypted and never shown again.
        </p>
        {error && <p className="text-rose-400 text-xs">{error}</p>}
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : !status ? (
          <p className="text-xs text-rose-400">Unable to load connection status. Try reopening Settings.</p>
        ) : status.set ? (
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5">
            <span className="text-sm text-emerald-300 font-mono flex-1 truncate">{status.url}</span>
            <button
              onClick={clear}
              disabled={busy}
              title="Disconnect — fall back to the app's shared instance, if any"
              className="text-rose-400 hover:text-rose-300 disabled:opacity-40 flex-shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://your-instance.ui.nabu.casa"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-rose-500"
            />
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Long-lived access token"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 pr-10 text-white text-sm outline-none focus:border-rose-500"
              />
              <button
                onClick={() => setShow(s => !s)}
                className="absolute right-3 top-3 text-slate-400 hover:text-white"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={save}
              disabled={busy || !url.trim() || !token.trim()}
              className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-sm px-4 py-2.5 rounded-lg transition"
            >
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
