// src/components/familyos/CoParentingPanel.tsx
import { useState } from 'react';
import { Eye, EyeOff, Users, AlertTriangle, Check, Loader } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { authedFetch, getAccessToken } from '@/lib/householdAuth';
import { apiUrl } from '@/lib/api';

interface CoparentStatus {
  mode: 'single' | 'coparent';
  primaryHouseholdId: string;
  secondaryHouseholdId: string | null;
  consentedHouseholdIds: string[];
  initiatedBy: string | null;
  initiatedAt: string | null;
  ready: boolean;
}

interface HouseholdMember {
  id: string;
  name: string;
  role: string;
  household_id: string;
}

export function CoParentingPanel() {
  const { currentUser, currentRole, householdId } = useAppContext();
  const [status, setStatus] = useState<CoparentStatus | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [phrase, setPhrase] = useState('');
  const [showConsentForm, setShowConsentForm] = useState(false);

  const isAdmin = currentRole === 'admin' || currentRole === 'superadmin';

  const refreshStatus = async () => {
    if (!householdId) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await authedFetch(apiUrl('/api/coparent-merge-consent'), {
        method: 'POST',
        body: JSON.stringify({ action: 'status' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) setStatus(data);
      }
    } catch {
      // ignore
    }
  };

  const refreshMembers = async () => {
    if (!householdId) return;
    const token = await getAccessToken();
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/members'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ householdId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.members) setMembers(data.members);
      }
    } catch {
      // ignore
    }
  };

  const toggleCoparenting = async () => {
    if (!isAdmin) return;
    setActionLoading('toggle');
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await authedFetch(apiUrl('/api/coparent-toggle'), {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setStatus((prev) => (prev ? { ...prev, mode: data.mode as any } : null));
          await refreshStatus();
        } else {
          setError(data.error || 'Failed to toggle co-parenting');
        }
      } else {
        const text = await res.text();
        setError(text || 'Request failed');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const requestMerge = async () => {
    if (!isAdmin || !status?.ready) return;
    setActionLoading('request');
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await authedFetch(apiUrl('/api/coparent-merge-consent'), {
        method: 'POST',
        body: JSON.stringify({ action: 'request' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          await refreshStatus();
        } else {
          setError(data.error || 'Failed to request merge');
        }
      } else {
        const text = await res.text();
        setError(text || 'Request failed');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const submitConsent = async () => {
    if (!phrase.trim() || !status) return;
    setActionLoading('consent');
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await authedFetch(apiUrl('/api/coparent-merge-consent'), {
        method: 'POST',
        body: JSON.stringify({ action: 'consent', phrase: phrase.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setShowConsentForm(false);
          setPhrase('');
          await refreshStatus();
          if (data.status === 'merged') {
            // Merge happened — refresh everything.
            await refreshMembers();
          }
        } else {
          setError(data.error || 'Consent failed');
        }
      } else {
        const text = await res.text();
        setError(text || 'Request failed');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const cancelMerge = async () => {
    if (!isAdmin) return;
    setActionLoading('cancel');
    setError('');
    try {
      const token = await getAccessToken();
      if (!token) return;
      const res = await authedFetch(apiUrl('/api/coparent-merge-consent'), {
        method: 'POST',
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          await refreshStatus();
          await refreshMembers();
        } else {
          setError(data.error || 'Cancel failed');
        }
      } else {
        const text = await res.text();
        setError(text || 'Request failed');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // Load status + members on mount and when household changes.
  useState(() => {
    if (householdId) {
      refreshStatus();
      refreshMembers();
    }
  }, [householdId]);

  if (!isAdmin) return null;

  if (!status) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <Users className="w-4 h-4 text-blue-400" /> Co-Parenting
        </div>
        <div className="text-xs text-slate-400">Loading…</div>
      </div>
    );
  }

  const isCoparent = status.mode === 'coparent';
  const myHouseholdId = householdId;
  const isPrimary = status.primaryHouseholdId === myHouseholdId;
  const isSecondary = status.secondaryHouseholdId === myHouseholdId;
  const hasConsented = status.consentedHouseholdIds.includes(myHouseholdId);
  const otherHouseholdId = isPrimary ? status.secondaryHouseholdId : status.primaryHouseholdId;
  const otherHasConsented = otherHouseholdId ? status.consentedHouseholdIds.includes(otherHouseholdId) : false;
  const bothConsented = status.ready;
  const pendingMerge = status.initiatedBy && !bothConsented;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        <Users className="w-4 h-4 text-blue-400" /> Co-Parenting
      </div>

      {/* Status banner */}
      <div className="text-xs space-y-1">
        {isCoparent ? (
          <div className="flex items-center gap-2 text-emerald-300">
            <Check className="w-3.5 h-3.5" />
            <span>Two-home mode active — {isPrimary ? 'you are in the primary household' : 'you are in the secondary household'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-400">
            <EyeOff className="w-3.5 h-3.5" />
            <span>Single household — co-parenting not enabled</span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-950/50 rounded px-3 py-2">{error}</div>
      )}

      {/* Toggle button */}
      <button
        onClick={toggleCoparenting}
        disabled={actionLoading !== null}
        className={`w-full text-xs rounded px-3 py-2 transition flex items-center justify-center gap-2 ${
          isCoparent
            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        } disabled:opacity-50`}
      >
        {actionLoading === 'toggle' ? (
          <Loader className="w-3.5 h-3.5 animate-spin" />
        ) : isCoparent ? (
          <>
            <EyeOff className="w-3.5 h-3.5" />
            {bothConsented ? 'Merge households' : 'Disable co-parenting'}
          </>
        ) : (
          <>
            <Eye className="w-3.5 h-3.5" />
            Enable co-parenting
          </>
        )}
      </button>

      {/* Merge consent section — only visible in co-parent mode */}
      {isCoparent && (
        <div className="space-y-2 pt-1 border-t border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Merge back to one household</div>

          {/* Pending merge indicator */}
          {pendingMerge && (
            <div className="flex items-start gap-2 text-xs bg-amber-950/50 border border-amber-800/50 rounded px-3 py-2 text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>
                <div>Merge requested — waiting for the other household to consent.</div>
                <div className="text-amber-400/70 mt-0.5">
                  {isPrimary
                    ? 'The secondary household needs to type the consent phrase.'
                    : 'The primary household needs to type the consent phrase.'}
                </div>
                {actionLoading === 'cancel' ? (
                  <div className="text-amber-400/50 mt-1">Cancelling…</div>
                ) : (
                  <button
                    onClick={cancelMerge}
                    disabled={actionLoading !== null}
                    className="mt-1 text-xs text-amber-400 hover:text-amber-300 underline disabled:opacity-50"
                  >
                    Cancel request
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Consent form */}
          {showConsentForm ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-400">
                Type the consent phrase exactly to record your agreement.
              </div>
              <input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="Make my family whole again"
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConsentForm(false)}
                  className="flex-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={submitConsent}
                  disabled={actionLoading !== null || !phrase.trim()}
                  className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded px-3 py-1.5 disabled:opacity-50"
                >
                  {actionLoading === 'consent' ? 'Submitting…' : 'Submit consent'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs space-y-2">
              {bothConsented ? (
                <div className="flex items-center gap-2 text-emerald-300">
                  <Check className="w-3.5 h-3.5" />
                  <span>Both households have consented. Click "Merge households" above to complete.</span>
                </div>
              ) : hasConsented ? (
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>You have consented. Waiting for the other household…</span>
                </div>
              ) : otherHasConsented ? (
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>The other household has consented. You need to type the phrase too.</span>
                </div>
              ) : (
                <div className="text-slate-400">No merge request yet.</div>
              )}

              {!bothConsented && (
                <button
                  onClick={() => setShowConsentForm(true)}
                  disabled={actionLoading !== null}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded px-3 py-1.5 disabled:opacity-50 w-full"
                >
                  {hasConsented ? 'Update consent' : 'Type consent phrase'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
