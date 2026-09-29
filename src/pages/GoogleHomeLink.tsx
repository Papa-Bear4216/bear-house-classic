import React, { useState } from 'react';
import { Home } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { authedFetch } from '@/lib/householdAuth';
import { clearPendingLink, type GoogleHomeLinkParams } from '@/lib/googleHomeLink';

/** Consent screen for linking Bear House to Google Home. Shown when Google
 * sends a signed-in adult here; tapping Allow/Cancel hands the browser back to
 * Google via /api/google-home-authorize (which validates the redirect). */
const GoogleHomeLinkPage: React.FC<{ params: GoogleHomeLinkParams }> = ({ params }) => {
  const { currentUser, currentRole } = useAppContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isAdult = currentRole === 'admin' || currentRole === 'superadmin';

  const answer = async (deny: boolean) => {
    setBusy(true); setError('');
    try {
      const res = await authedFetch('/api/google-home-authorize', { method: 'POST', body: JSON.stringify({ ...params, deny }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.redirectTo) { setError(data.error || 'Couldn’t link. Try again from the Google Home app.'); setBusy(false); return; }
      clearPendingLink();
      window.location.href = data.redirectTo;
    } catch (e: any) { setError(e.message || 'Network error'); setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 text-center">
        <Home className="w-8 h-8 text-amber-400 mx-auto" />
        <h1 className="text-white text-lg font-semibold">Link Bear House to Google Home</h1>
        {isAdult ? (
          <>
            <p className="text-slate-400 text-sm">
              Signed in as <span className="text-white">{currentUser?.name}</span>. Google Assistant will be able to see and control this household&rsquo;s smart-home devices.
            </p>
            {error && <div className="text-xs text-rose-300 bg-rose-950/40 rounded px-3 py-2">{error}</div>}
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => answer(true)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 disabled:opacity-50">Cancel</button>
              <button disabled={busy} onClick={() => answer(false)} className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-lg px-3 py-2 disabled:opacity-50">{busy ? 'Linking…' : 'Allow'}</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-slate-400 text-sm">Only a parent (admin) account can link Google Home. Ask a parent to do this from their own account.</p>
            <button onClick={() => { clearPendingLink(); window.location.href = '/'; }} className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg px-4 py-2">Back to Bear House</button>
          </>
        )}
      </div>
    </div>
  );
};

export default GoogleHomeLinkPage;
