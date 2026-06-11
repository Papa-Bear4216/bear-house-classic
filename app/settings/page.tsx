'use client';

import { useState } from 'react';
import { Settings, Star, Users, Sliders, Loader2, CheckCircle, AlertTriangle, Merge } from 'lucide-react';
import { useSettings } from '@/hooks/use-settings';
import { useFamilyMembers } from '@/hooks/use-family';
import { useTasks } from '@/hooks/use-tasks';
import { useCurrentUser } from '@/hooks/use-current-user';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';

type Tab = 'points' | 'members' | 'features';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-200'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </label>
  );
}

function NumberInput({ value, onChange, label, min = 0, max = 500 }: {
  value: number; onChange: (v: number) => void; label: string; min?: number; max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 5))}
          className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-700 transition-colors"
        >−</button>
        <span className="w-10 text-center font-bold text-slate-900 text-sm">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 5))}
          className="w-7 h-7 rounded-lg bg-blue-100 hover:bg-blue-200 flex items-center justify-center font-bold text-blue-700 transition-colors"
        >+</button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('points');
  const { settings, loading, updatePointSettings, updateFeatureSettings } = useSettings();
  const { users } = useFamilyMembers();
  const { tasks } = useTasks();
  const { currentUser } = useCurrentUser();

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  // Family code sync state
  const [familyCode, setFamilyCode] = useState('BEAR12');
  const [syncingCode, setSyncingCode] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success?: string; error?: string } | null>(null);

  async function handleSyncFamilyCode() {
    if (!familyCode.trim() || !db) return;
    setSyncingCode(true);
    setSyncResult(null);
    try {
      const batch = writeBatch(db);
      users.forEach(u => batch.update(doc(db, 'users', u.id), { familyCode: familyCode.trim().toUpperCase() }));
      await batch.commit();
      setSyncResult({ success: `Family code "${familyCode.trim().toUpperCase()}" synced to all ${users.length} members.` });
    } catch (e: unknown) {
      setSyncResult({ error: e instanceof Error ? e.message : 'Sync failed.' });
    } finally {
      setSyncingCode(false);
    }
  }

  // Profile merge state
  const [mergeSource, setMergeSource] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ success?: string; error?: string } | null>(null);

  async function handleMerge() {
    if (!mergeSource || !mergeTarget || mergeSource === mergeTarget || !db) return;
    setMerging(true);
    setMergeResult(null);
    try {
      const source = users.find(u => u.id === mergeSource);
      const target = users.find(u => u.id === mergeTarget);
      if (!source || !target) throw new Error('Profile not found');

      // Reassign tasks
      const q = query(collection(db, 'tasks'), where('assigneeId', '==', mergeSource));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => updateDoc(d.ref, { assigneeId: mergeTarget })));

      // Transfer points
      const newPoints = (target.points ?? 0) + (source.points ?? 0);
      await updateDoc(doc(db, 'users', mergeTarget), { points: newPoints });

      // Delete source
      await deleteDoc(doc(db, 'users', mergeSource));

      setMergeResult({ success: `Merged "${source.name}" into "${target.name}" — ${snap.size} tasks reassigned, ${source.points} points transferred.` });
      setMergeSource('');
      setMergeTarget('');
    } catch (e: unknown) {
      setMergeResult({ error: e instanceof Error ? e.message : 'Merge failed. Check Firestore rules.' });
    } finally {
      setMerging(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'points', label: 'Points', icon: <Star className="w-4 h-4" /> },
    { id: 'members', label: 'Members', icon: <Users className="w-4 h-4" /> },
    { id: 'features', label: 'Features', icon: <Sliders className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-8 pb-24">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Settings className="w-7 h-7 text-slate-600" />
            Settings
          </h1>
          {!isAdmin && (
            <p className="text-amber-600 text-sm mt-1 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Some settings require admin access.
            </p>
          )}
        </header>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg capitalize transition-all ${
                tab === t.id ? 'bg-white border border-slate-200 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Points Tab */}
        {tab === 'points' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Auto Point Distribution</h2>
              <Toggle
                checked={settings.points.autoAward}
                onChange={v => isAdmin && updatePointSettings({ autoAward: v })}
                label="Auto-award points when task marked done"
              />
              {!isAdmin && <p className="text-xs text-slate-400">Admin access required to change.</p>}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Point Values</h2>
              <NumberInput
                label="Default task points"
                value={settings.points.defaultTaskPoints}
                onChange={v => isAdmin && updatePointSettings({ defaultTaskPoints: v })}
              />
              <NumberInput
                label="Easy task points"
                value={settings.points.easyPoints}
                onChange={v => isAdmin && updatePointSettings({ easyPoints: v })}
              />
              <NumberInput
                label="Medium task points"
                value={settings.points.mediumPoints}
                onChange={v => isAdmin && updatePointSettings({ mediumPoints: v })}
              />
              <NumberInput
                label="Hard task points"
                value={settings.points.hardPoints}
                onChange={v => isAdmin && updatePointSettings({ hardPoints: v })}
              />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Streak Bonus</h2>
              <Toggle
                checked={settings.points.streakBonus}
                onChange={v => isAdmin && updatePointSettings({ streakBonus: v })}
                label="Award bonus for completing tasks multiple days in a row"
              />
              {settings.points.streakBonus && (
                <>
                  <NumberInput
                    label="Days needed for streak"
                    value={settings.points.streakDays}
                    onChange={v => isAdmin && updatePointSettings({ streakDays: v })}
                    min={2}
                    max={30}
                  />
                  <NumberInput
                    label="Streak bonus points"
                    value={settings.points.streakBonusPoints}
                    onChange={v => isAdmin && updatePointSettings({ streakBonusPoints: v })}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* Members Tab */}
        {tab === 'members' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Family Members</h2>
              {users.map(u => {
                const taskCount = tasks.filter(t => t.assigneeId === u.id).length;
                return (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className={`w-9 h-9 rounded-full ${u.color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                      {u.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-900 truncate">{u.name}</p>
                      <p className="text-xs text-slate-500 capitalize">{u.role} · {u.points} pts · {taskCount} tasks</p>
                    </div>
                    <span className="text-xs font-mono text-slate-300 hidden sm:block">{u.id.slice(0, 8)}…</span>
                  </div>
                );
              })}
            </div>

            {isAdmin && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Family Code (Messaging)</h2>
                <p className="text-xs text-slate-500">
                  All family members must share the same code to see each other&apos;s messages. Sync it here if messages aren&apos;t showing up.
                </p>
                {syncResult?.success && (
                  <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> {syncResult.success}
                  </div>
                )}
                {syncResult?.error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {syncResult.error}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={familyCode}
                    onChange={e => setFamilyCode(e.target.value.toUpperCase())}
                    placeholder="BEAR12"
                    maxLength={12}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                  <button
                    onClick={handleSyncFamilyCode}
                    disabled={syncingCode || !familyCode.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl disabled:opacity-40 transition-colors flex items-center gap-2"
                  >
                    {syncingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Sync All
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {users.map(u => (
                    <span key={u.id} className={`text-xs px-2 py-1 rounded-lg font-mono font-bold ${(u as { familyCode?: string }).familyCode ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                      {u.name.split(' ')[0]}: {(u as { familyCode?: string }).familyCode ?? 'none'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Merge className="w-4 h-4" /> Merge Profiles
                </h2>
                <p className="text-xs text-slate-500">
                  Merge a duplicate profile into another. Tasks are reassigned, points are combined, and the source profile is deleted.
                </p>

                {mergeResult?.success && (
                  <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {mergeResult.success}
                  </div>
                )}
                {mergeResult?.error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    {mergeResult.error}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Source (delete this)</label>
                    <select
                      value={mergeSource}
                      onChange={e => setMergeSource(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select profile to delete…</option>
                      {users.filter(u => u.id !== mergeTarget).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Target (keep this)</label>
                    <select
                      value={mergeTarget}
                      onChange={e => setMergeTarget(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select profile to keep…</option>
                      {users.filter(u => u.id !== mergeSource).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleMerge}
                    disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget || merging}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                  >
                    {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                    Merge Profiles
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Features Tab */}
        {tab === 'features' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Navigation Visibility</h2>
              <p className="text-xs text-slate-500">Control which sections appear in the app navigation.</p>
              {!isAdmin && <p className="text-xs text-amber-500">Requires admin access.</p>}
              <Toggle
                checked={settings.features.showBudget}
                onChange={v => isAdmin && updateFeatureSettings({ showBudget: v })}
                label="Budget / Plaid"
              />
              <Toggle
                checked={settings.features.showScanner}
                onChange={v => isAdmin && updateFeatureSettings({ showScanner: v })}
                label="Scanner & Walkthrough"
              />
              <Toggle
                checked={settings.features.showGallery}
                onChange={v => isAdmin && updateFeatureSettings({ showGallery: v })}
                label="Gallery"
              />
              <Toggle
                checked={settings.features.showCalls}
                onChange={v => isAdmin && updateFeatureSettings({ showCalls: v })}
                label="Video Calls"
              />
              <Toggle
                checked={settings.features.showMap}
                onChange={v => isAdmin && updateFeatureSettings({ showMap: v })}
                label="Home Map"
              />
              <Toggle
                checked={settings.features.showRewards}
                onChange={v => isAdmin && updateFeatureSettings({ showRewards: v })}
                label="Rewards"
              />
              <Toggle
                checked={settings.features.showGames}
                onChange={v => isAdmin && updateFeatureSettings({ showGames: v })}
                label="Games / Missions"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
