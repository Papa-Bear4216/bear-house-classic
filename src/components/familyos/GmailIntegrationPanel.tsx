import React, { useState, useEffect } from 'react';
import { Mail, Link2Off } from 'lucide-react';
import { authedFetch, getAccessToken } from '@/lib/householdAuth';
import { apiUrl } from '@/lib/api';
import { useAppContext } from '@/contexts/AppContext';

interface MemberStatus { memberId: string; name: string; connected: boolean; email: string | null; }

export function GmailIntegrationPanel() {
  const { householdMembers } = useAppContext();
  const [statuses, setStatuses] = useState<MemberStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/gmail-status', { method: 'GET' });
      if (res.ok) setStatuses((await res.json()).members || []);
    } catch {
      // leave statuses as-is
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // After the OAuth redirect lands back on / with ?gmail_oauth=connected|error,
  // refresh status and clean the URL so a page reload doesn't re-trigger anything.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('gmail_oauth');
    if (result) {
      if (result === 'error') setError(`Connection failed: ${params.get('detail') || 'unknown error'}`);
      refresh();
      params.delete('gmail_oauth');
      params.delete('detail');
      const next = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (next ? `?${next}` : ''));
    }
  }, []);

  const connect = async (memberId: string) => {
    const token = await getAccessToken();
    if (!token) return;
    window.location.href = apiUrl(`/api/gmail-oauth-start?token=${encodeURIComponent(token)}&memberId=${encodeURIComponent(memberId)}`);
  };

  const disconnect = async (memberId: string) => {
    if (!confirm('Disconnect Gmail? Hermes will no longer be able to read this member\'s email.')) return;
    setError('');
    setBusy(memberId);
    try {
      const res = await authedFetch('/api/gmail-disconnect', {
        method: 'POST',
        body: JSON.stringify({ memberId }),
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
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900">
        <Mail className="w-4 h-4 text-rose-400" />
        <span className="font-semibold text-white text-sm">Gmail Integration</span>
        <span className="ml-auto text-xs text-slate-500">per member, read-only</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-slate-400">
          Each household member can optionally connect their own Gmail, read-only, so Hermes can
          track bills, appointments, and order confirmations from their inbox — even when they're
          not actively using the app. <span className="text-slate-300">Inbox contents stay private to that
          member</span> — they're never shared into household-wide memory or visible to anyone else's
          Hermes session. Any member can disconnect their own access anytime.
        </p>
        {error && <p className="text-rose-400 text-xs">{error}</p>}
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-2">
            {householdMembers.map(m => {
              const status = statuses.find(s => s.memberId === m.id);
              return (
                <div key={m.id} className="flex items-center justify-between bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5">
                  <div>
                    <div className="text-sm text-white">{m.name}</div>
                    {status?.connected && <div className="text-xs text-emerald-400">{status.email}</div>}
                  </div>
                  {status?.connected ? (
                    <button
                      onClick={() => disconnect(m.id)}
                      disabled={busy === m.id}
                      className="flex items-center gap-1.5 text-xs bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/40 text-rose-300 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
                    >
                      <Link2Off className="w-3.5 h-3.5" /> Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => connect(m.id)}
                      className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition"
                    >
                      Connect
                    </button>
                  )}
                </div>
              );
            })}
            {householdMembers.length === 0 && (
              <p className="text-xs text-slate-500">No household members yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
