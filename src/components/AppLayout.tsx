import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import {
  Settings as SettingsIcon, Search, History, LogOut
} from 'lucide-react';

import { KEYS, loadJSON, isOverdue } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { recordVisit, recordLocation, checkAutobrief } from '@/lib/presenceTracker';
import BrainBatteryModal from '@/components/familyos/BrainBatteryModal';
import { getBrainBattery, BATTERY_LEVELS, type BatteryLevel } from '@/lib/brainBattery';
import { getOfflineSyncStatus, onSyncUpdate } from '@/lib/sync';
import { OPEN_SETTINGS_EVENT, resolveSettingsOpenRequest, type SettingsIntent } from '@/lib/connectionHealth';


import { BentoGridProvider } from '@/components/bento/BentoGridContext';
import { BentoGridShell } from '@/components/bento/BentoGridShell';

const SettingsModal = lazy(() => import('@/components/familyos/SettingsModal'));
const HistoryModal = lazy(() => import('@/components/familyos/HistoryModal'));
const WelcomeBackModal = lazy(() => import('@/components/familyos/WelcomeBackModal'));
const BulletinBoardModal = lazy(() => import('@/components/familyos/BulletinBoardModal'));
import { loadBulletinNotes, type BulletinNote } from '@/lib/bulletinBoard';

const COLOR_DOT: Record<string, string> = {
  indigo: 'bg-indigo-400',
  pink: 'bg-pink-400',
  purple: 'bg-purple-400',
  blue: 'bg-blue-400',
};

const AppLayout: React.FC = () => {
  const { currentUser, currentRole, logout } = useAppContext();
  const isAdm = currentRole === 'superadmin' || currentRole === 'admin';

  const [now, setNow] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsIntent, setSettingsIntent] = useState<SettingsIntent | null>(null);
  const [settingsNonce, setSettingsNonce] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);
  const [tick, setTick] = useState(0);
  const [autobrief, setAutobrief] = useState<{ days: number; reason: 'offline' | 'location'; miles?: number } | null>(null);
  const [batteryModalOpen, setBatteryModalOpen] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<BatteryLevel>(() => getBrainBattery());
  const [syncStatus, setSyncStatus] = useState(() => getOfflineSyncStatus());
  const [bulletinOpen, setBulletinOpen] = useState(false);
  const [bulletinNotes, setBulletinNotes] = useState<BulletinNote[]>(() => loadBulletinNotes());
  const presenceChecked = useRef(false);

  useEffect(() => {
    const updateNotes = () => setBulletinNotes(loadBulletinNotes());
    window.addEventListener('familyos:bulletin-updated', updateNotes);
    window.addEventListener('storage', updateNotes);
    return () => {
      window.removeEventListener('familyos:bulletin-updated', updateNotes);
      window.removeEventListener('storage', updateNotes);
    };
  }, []);


  useEffect(() => {
    const onBatteryChange = (e: any) => {
      if (e.detail) setBatteryLevel(e.detail);
    };
    window.addEventListener('familyos:battery-changed', onBatteryChange);
    return () => window.removeEventListener('familyos:battery-changed', onBatteryChange);
  }, []);

  useEffect(() => {
    const updateSync = () => setSyncStatus(getOfflineSyncStatus());
    const unsub = onSyncUpdate(() => updateSync());
    window.addEventListener('online', updateSync);
    window.addEventListener('offline', updateSync);
    return () => {
      unsub();
      window.removeEventListener('online', updateSync);
      window.removeEventListener('offline', updateSync);
    };
  }, []);

  useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      const intent = resolveSettingsOpenRequest(e);
      if (intent) {
        setSettingsIntent(intent);
        setSettingsNonce((n) => n + 1);
        setSettingsOpen(true);
      }
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setHasApiKey(true);
  }, [settingsOpen]);

  // Presence tracking — runs once on mount
  useEffect(() => {
    if (presenceChecked.current) return;
    presenceChecked.current = true;

    const homeLat = parseFloat(localStorage.getItem('home_lat') || '30.45');
    const homeLon = parseFloat(localStorage.getItem('home_lon') || '-91.15');
    const result = checkAutobrief(homeLat, homeLon);
    if (result.should) {
      setAutobrief({ days: result.days, reason: result.reason as 'offline' | 'location', miles: result.miles });
    }

    recordVisit();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => recordLocation(pos.coords.latitude, pos.coords.longitude),
        () => {}
      );
    }
  }, []);

  const totals = useMemo(() => {
    const tasks = loadJSON<any[]>(KEYS.tasks, []);
    const promises = loadJSON<any[]>(KEYS.promises, []);
    const overdueTasks = tasks.filter((t) => !t.completed && isOverdue(t)).length;
    const overduePromises = promises.filter((p) => !p.completed && isOverdue(p)).length;
    return { overdue: overdueTasks + overduePromises };
  }, [tick]);

  const inZone = useMemo(() => {
    const zones = loadJSON<any[]>(KEYS.presenceZones, []);
    const day = now.getDay();
    const hour = now.getHours();
    return zones.some((z) => z.days?.includes(day) && hour >= z.startHour && hour < z.endHour);
  }, [now]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const tasks = loadJSON<any[]>(KEYS.tasks, []).filter((t) => !t.completed && t.text?.toLowerCase().includes(q));
    const promises = loadJSON<any[]>(KEYS.promises, []).filter((p) => !p.completed && p.text?.toLowerCase().includes(q));
    return { tasks, promises };
  }, [search, tick]);

  const dotColor = currentUser ? (COLOR_DOT[currentUser.color] || 'bg-slate-400') : 'bg-slate-400';

  return (
    <BentoGridProvider>
      <div className="min-h-screen bg-[#090D16] text-slate-100 relative selection:bg-cyan-500 selection:text-slate-950 overflow-x-hidden font-sans">
        {/* Atmospheric ambient lighting */}
        <div className="fixed -top-40 -right-40 w-96 h-96 rounded-full bg-cyan-500/[0.05] blur-[140px] pointer-events-none" />
        <div className="fixed top-1/3 -left-40 w-96 h-96 rounded-full bg-blue-600/[0.05] blur-[140px] pointer-events-none" />
        <div className="fixed -bottom-40 right-1/3 w-96 h-96 rounded-full bg-slate-700/[0.05] blur-[140px] pointer-events-none" />

        {/* HEADER */}
        <header className="sticky top-0 z-30 bg-[#090D16]/80 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-display font-extrabold text-base text-slate-950 shadow-md shadow-cyan-500/20 ring-2 ring-white/10">
                🚂
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-black text-sm tracking-tight text-white">HotMessExpress</span>
                  <span className="text-[11px] text-cyan-400 font-bold hidden sm:inline tracking-tight">— The Family OS</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dotColor} ring-2 ring-white/10`} />
                  <span>{currentUser?.name || 'Guest'}</span>
                </div>
              </div>
            </div>

            {/* Brain Battery pill in header */}
            <button
              onClick={() => setBatteryModalOpen(true)}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all hover:scale-105 shadow-sm active:scale-95 ${BATTERY_LEVELS[batteryLevel].badgeClass}`}
              title="ADHD Brain Battery — Click to adjust"
            >
              <span>{BATTERY_LEVELS[batteryLevel].emoji}</span>
              <span>{BATTERY_LEVELS[batteryLevel].label}</span>
            </button>

            <div className="flex-1 max-w-md mx-auto hidden md:block relative">
              <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chores, promises..."
                className="w-full bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 outline-none transition"
              />
              {searchResults && (searchResults.tasks.length > 0 || searchResults.promises.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl max-h-80 overflow-y-auto z-40 p-2">
                  {searchResults.tasks.length > 0 && (
                    <div className="p-1">
                      <div className="text-[10px] uppercase font-bold text-cyan-400 px-2 py-1">Chores</div>
                      {searchResults.tasks.map((t) => (
                        <div
                          key={t.id}
                          className="px-3 py-2 text-sm text-slate-200 hover:bg-white/10 rounded-xl cursor-pointer transition"
                          onClick={() => setSearch('')}
                        >
                          {t.text}
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.promises.length > 0 && (
                    <div className="p-1 border-t border-white/10">
                      <div className="text-[10px] uppercase font-bold text-sky-400 px-2 py-1">Promises</div>
                      {searchResults.promises.map((p) => (
                        <div
                          key={p.id}
                          className="px-3 py-2 text-sm text-slate-200 hover:bg-white/10 rounded-xl cursor-pointer transition"
                          onClick={() => setSearch('')}
                        >
                          <span className="text-sky-400 mr-2 font-semibold">{p.person}</span>{p.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
              {/* Family Popup Bulletin Board */}
              <button
                onClick={() => setBulletinOpen(true)}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition shadow-sm active:scale-95"
                title="Family Bulletin Board — Quick sticky notes & announcements"
              >
                <span>📌</span>
                <span className="hidden sm:inline">Bulletin</span>
                {bulletinNotes.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      bulletinNotes.some((n) => n.category === 'urgent' || n.pinned)
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-cyan-400 text-slate-950'
                    }`}
                  >
                    {bulletinNotes.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setBatteryModalOpen(true)}
                className="sm:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-sm"
                title="Brain Battery"
              >
                {BATTERY_LEVELS[batteryLevel].emoji}
              </button>

              <button onClick={() => setHistoryOpen(true)} title="History" className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition">
                <History className="w-4 h-4" />
              </button>

              {isAdm && (
                <button
                  onClick={() => {
                    setSettingsIntent(null);
                    setSettingsNonce((n) => n + 1);
                    setSettingsOpen(true);
                  }}
                  className="relative text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition"
                >
                  <SettingsIcon className="w-4 h-4" />
                  {totals.overdue > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center animate-pulse">
                      {totals.overdue}
                    </span>
                  )}
                </button>
              )}
              <button onClick={logout} title="Sign Out" className="text-slate-400 hover:text-rose-400 p-2 rounded-xl hover:bg-white/5 transition">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* No-API-key banner */}
        {!hasApiKey && isAdm && (
          <div className="bg-amber-950/40 border-b border-amber-500/30 text-amber-200 text-sm px-4 py-2 text-center">
            AI features need an Anthropic API key.{' '}
            <button
              onClick={() => {
                setSettingsIntent(null);
                setSettingsNonce((n) => n + 1);
                setSettingsOpen(true);
              }}
              className="underline font-semibold"
            >
              Add one in Settings
            </button>
            .
          </div>
        )}

        {(!syncStatus.online || syncStatus.syncing || syncStatus.pendingWrites > 0 || syncStatus.unassignedWrites > 0) && (
          <div role="status" aria-live="polite" className="bg-slate-900/90 border-b border-white/10 text-slate-300 text-xs px-4 py-2 text-center">
            {!syncStatus.online
              ? 'Offline. Changes are saved on this device and will sync when connected.'
              : syncStatus.syncing
                ? 'Syncing saved changes…'
                : syncStatus.unassignedWrites > 0
                  ? 'Some older offline changes need household review before they can sync.'
                  : `${syncStatus.pendingWrites} saved change${syncStatus.pendingWrites === 1 ? '' : 's'} waiting to sync.`}
          </div>
        )}

        {/* MAIN: Zero-Friction ADHD Bento Grid System */}
        <main className="w-full py-6 pb-20">
          <BentoGridShell />
        </main>

        <Suspense fallback={null}>
          {bulletinOpen && (
            <BulletinBoardModal
              open={bulletinOpen}
              onClose={() => setBulletinOpen(false)}
            />
          )}
          {settingsOpen && (

            <SettingsModal
              key={settingsNonce}
              open={settingsOpen}
              initialTab={settingsIntent?.tab}
              initialIntegration={settingsIntent?.integration}
              onClose={() => { setSettingsOpen(false); setSettingsIntent(null); }}
            />
          )}
          {historyOpen && <HistoryModal open={historyOpen} onClose={() => { setHistoryOpen(false); setTick((t) => t + 1); }} />}
          <BrainBatteryModal open={batteryModalOpen} onClose={() => setBatteryModalOpen(false)} />
        </Suspense>
        <Suspense fallback={null}>
          {autobrief && (
            <WelcomeBackModal
              days={autobrief.days}
              reason={autobrief.reason}
              miles={autobrief.miles}
              onClose={() => setAutobrief(null)}
            />
          )}
        </Suspense>
      </div>
    </BentoGridProvider>
  );
};

export default AppLayout;
