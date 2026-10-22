import React, { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/householdAuth';

/** Admin-only: rotate the household webhook token. The raw token is shown once and never stored client-side. */
export function WebhookTokenControl() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    authedFetch('/api/webhook-token', { method: 'POST', body: JSON.stringify({ action: 'status' }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setHasToken(!!d.hasToken); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const rotate = async () => {
    if (hasToken !== false && !window.confirm('Generate a new webhook token? Existing automations stop working until you update them.')) return;
    setBusy(true);
    setError('');
    try {
      const res = await authedFetch('/api/webhook-token', { method: 'POST', body: JSON.stringify({ action: 'rotate' }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) throw new Error(data?.error || 'Could not generate a token');
      setToken(data.token);
      setHasToken(true);
    } catch (e: any) {
      setError(e?.message || 'Could not generate a token');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={rotate}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:opacity-50"
        >
          {hasToken ? 'Rotate webhook token' : 'Generate webhook token'}
        </button>
        {hasToken === false && !token && <span className="text-xs text-slate-500">No token set yet.</span>}
      </div>
      {token && (
        <div className="text-xs">
          <p className="text-amber-300 mb-1">Copy this now. It will not be shown again.</p>
          <code className="block break-all bg-slate-950 px-2 py-1.5 rounded select-all">{token}</code>
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
