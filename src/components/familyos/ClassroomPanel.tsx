import React, { useState, useEffect } from 'react';
import { GraduationCap, Link2Off, RefreshCw } from 'lucide-react';
import { authedFetch, getAccessToken } from '@/lib/householdAuth';
import { apiUrl } from '@/lib/api';
import { useAppContext } from '@/contexts/AppContext';

interface MemberStatus { memberId: string; connected: boolean; email: string | null; }
interface Grade { courseName: string; title: string; state: string; grade: number | null; maxPoints: number | null; late: boolean; }

const ERROR_HINT: Record<string, string> = {
  access_denied: 'Google blocked access. School accounts often need the school IT admin to allow this app, or the sign-in was cancelled.',
  no_refresh_token: 'Google did not return a long-lived login. Remove the app under your Google account permissions and try again.',
};

export function ClassroomPanel() {
  const { householdMembers } = useAppContext();
  const [statuses, setStatuses] = useState<MemberStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [grades, setGrades] = useState<Record<string, Grade[]>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/classroom-link?action=status', { method: 'GET' });
      if (res.ok) setStatuses((await res.json()).members || []);
    } catch {
      // leave statuses as-is
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // After the OAuth redirect lands back on / with ?classroom_oauth=…, refresh and clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('classroom_oauth');
    if (!result) return;
    if (result === 'error') {
      const detail = params.get('detail') || 'unknown error';
      setError(ERROR_HINT[detail] || `Connection failed: ${detail}`);
    }
    refresh();
    params.delete('classroom_oauth');
    params.delete('detail');
    const next = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (next ? `?${next}` : ''));
  }, []);

  const connect = async (memberId: string) => {
    const token = await getAccessToken();
    if (!token) return;
    window.location.href = apiUrl(`/api/classroom-link?action=start&token=${encodeURIComponent(token)}&memberId=${encodeURIComponent(memberId)}`);
  };

  const loadGrades = async (memberId: string) => {
    const res = await authedFetch(`/api/classroom-link?action=grades&memberId=${encodeURIComponent(memberId)}`, { method: 'GET' });
    if (!res.ok) return;
    const list: Grade[] = (await res.json()).grades?.grades || [];
    setGrades(g => ({ ...g, [memberId]: list }));
  };

  const sync = async (memberId: string) => {
    setError(''); setNotice(''); setBusy(memberId);
    try {
      const res = await authedFetch('/api/classroom', { method: 'POST', body: JSON.stringify({ memberId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Sync failed.'); return; }
      setNotice(`Synced: ${data.added ?? 0} new assignment(s), ${data.gradeCount ?? 0} graded item(s) checked.`);
      await loadGrades(memberId);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (memberId: string) => {
    if (!confirm('Unlink Google Classroom? Grades and assignments will stop syncing for this member.')) return;
    setError(''); setBusy(memberId);
    try {
      const res = await authedFetch('/api/classroom-link', { method: 'POST', body: JSON.stringify({ action: 'disconnect', memberId }) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || 'Failed to disconnect.'); return; }
      setGrades(g => { const { [memberId]: _drop, ...rest } = g; return rest; });
      await refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const students = householdMembers.filter(m => m.role !== 'pet');

  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900">
        <GraduationCap className="w-4 h-4 text-amber-400" />
        <span className="font-semibold text-white text-sm">Google Classroom</span>
        <span className="ml-auto text-xs text-slate-500">per student, read-only</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-slate-400">
          Link a child&rsquo;s school Google account to track assignments and grades. Sign in with the
          <span className="text-slate-300"> school account</span> when Google asks. We only read courses, assignments and
          the student&rsquo;s own grades. Some schools block third-party apps; if so, ask the school&rsquo;s IT admin.
        </p>
        {error && <p className="text-rose-400 text-xs">{error}</p>}
        {notice && <p className="text-emerald-400 text-xs">{notice}</p>}
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-2">
            {students.map(m => {
              const status = statuses.find(s => s.memberId === m.id);
              const list = grades[m.id];
              return (
                <div key={m.id} className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm text-white">{m.name}</div>
                      {status?.connected && <div className="text-xs text-emerald-400">{status.email}</div>}
                    </div>
                    {status?.connected ? (
                      <div className="flex gap-2">
                        <button onClick={() => sync(m.id)} disabled={busy === m.id}
                          className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-40">
                          <RefreshCw className={`w-3.5 h-3.5 ${busy === m.id ? 'animate-spin' : ''}`} /> Sync
                        </button>
                        <button onClick={() => disconnect(m.id)} disabled={busy === m.id}
                          className="flex items-center gap-1.5 text-xs bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/40 text-rose-300 px-3 py-1.5 rounded-lg transition disabled:opacity-40">
                          <Link2Off className="w-3.5 h-3.5" /> Unlink
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => connect(m.id)} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition">
                        Link school account
                      </button>
                    )}
                  </div>
                  {status?.connected && !list && (
                    <button onClick={() => loadGrades(m.id)} className="mt-2 text-xs text-slate-400 hover:text-white underline">Show grades</button>
                  )}
                  {list && (
                    <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {list.length === 0 && <li className="text-xs text-slate-500">No grades yet. Press Sync.</li>}
                      {list.map((g, i) => (
                        <li key={i} className="flex justify-between gap-2 text-xs text-slate-300">
                          <span className="truncate">[{g.courseName}] {g.title}{g.late ? ' (late)' : ''}</span>
                          <span className="shrink-0 text-slate-400">
                            {g.grade !== null ? `${g.grade}${g.maxPoints ? `/${g.maxPoints}` : ''}` : g.state.replace(/_/g, ' ').toLowerCase()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {students.length === 0 && <p className="text-xs text-slate-500">No household members yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
