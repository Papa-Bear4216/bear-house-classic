import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import {
  Settings as SettingsIcon, Search, History, LogOut, Home, Zap
} from 'lucide-react';

import { KEYS, loadJSON, isOverdue, formatTime } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { recordVisit, recordLocation, checkAutobrief } from '@/lib/presenceTracker';
import BrainBatteryModal from '@/components/familyos/BrainBatteryModal';
import { getBrainBattery, BATTERY_LEVELS, type BatteryLevel } from '@/lib/brainBattery';
import MagicTrail from '@/components/familyos/MagicTrail';
import logo from '@/assets/familyos-logo.svg';
import '@/styles/app-shell.css';

import { BentoGridProvider } from '@/components/bento/BentoGridContext';
import { BentoGridShell } from '@/components/bento/BentoGridShell';

const SettingsModal = lazy(() => import('@/components/familyos/SettingsModal'));
const HistoryModal = lazy(() => import('@/components/familyos/HistoryModal'));
const WelcomeBackModal = lazy(() => import('@/components/familyos/WelcomeBackModal'));

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);
  const [tick, setTick] = useState(0);
  const [autobrief, setAutobrief] = useState<{ days: number; reason: 'offline' | 'location'; miles?: number } | null>(null);
  const [batteryModalOpen, setBatteryModalOpen] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<BatteryLevel>(() => getBrainBattery());
  const presenceChecked = useRef(false);

  useEffect(() => {
    const onBatteryChange = (e: any) => {
      if (e.detail) setBatteryLevel(e.detail);
    };
    window.addEventListener('familyos:battery-changed', onBatteryChange);
    return () => window.removeEventListener('familyos:battery-changed', onBatteryChange);
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
      <div className="fo-shell min-h-screen text-slate-100 relative selection:bg-amber-500 selection:text-slate-950 overflow-x-hidden font-sans">
        <div className="fo-workspace w-full">

          {/* Persistent ADHD-Friendly Bento Header */}
          <header className="fo-header sticky top-0 z-30">
            <div className="fo-header-inner max-w-7xl mx-auto px-4 flex items-center gap-3">
              <div className="fo-header-identity">
                <div className="flex items-center gap-2">
                  <img src={logo} alt="FamilyOS" className="h-6 w-auto hidden sm:block" />
                  <span className="flex items-center gap-1.5 font-black text-amber-300 font-display text-base">
                    <Home className="w-4 h-4 text-amber-400" />
                    <span>HotMessExpress</span>
                  </span>
                </div>
                <span className="fo-header-user text-[11px] text-slate-400">
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  {currentUser?.name || 'Guest'} &bull; Bento Dashboard
                </span>
              </div>

              {/* ADHD Brain Battery Pill */}
              <button
                onClick={() => setBatteryModalOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all hover:scale-105 shadow-sm active:scale-95 ${BATTERY_LEVELS[batteryLevel].badgeClass}`}
                title="ADHD Brain Battery — Click to adjust"
              >
                <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{BATTERY_LEVELS[batteryLevel].label}</span>
              </button>

              {/* Glanceable Search */}
              <div className="flex-1 max-w-md mx-auto hidden md:block relative">
                <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search chores, promises, notes..."
                  className="fo-search w-full border rounded-full pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition"
                />
                {searchResults && (searchResults.tasks.length > 0 || searchResults.promises.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl max-h-80 overflow-y-auto z-40 p-2">
                    {searchResults.tasks.length > 0 && (
                      <div className="p-1">
                        <div className="text-[10px] uppercase font-bold text-amber-400 px-2 py-1">Chores</div>
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

              {/* Utility Tools Strip */}
              <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
                <div className="hidden sm:flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-slate-300">
                  <div className={`w-2 h-2 rounded-full ${inZone ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                  <span className="text-[11px]">{inZone ? 'Home Zone' : 'Away'}</span>
                </div>
                <div className="text-xs font-mono font-semibold text-slate-300 tabular-nums px-1">
                  {formatTime(now)}
                </div>
                <button
                  onClick={() => setHistoryOpen(true)}
                  title="History"
                  className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition"
                >
                  <History className="w-4 h-4" />
                </button>
                {isAdm && (
                  <button
                    onClick={() => setSettingsOpen(true)}
                    aria-label="Settings"
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
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="text-slate-400 hover:text-rose-400 p-2 rounded-xl hover:bg-white/5 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </header>

          {/* Missing API Key notice if admin */}
          {!hasApiKey && isAdm && (
            <div className="bg-amber-950/40 border-b border-amber-500/30 text-amber-200 text-sm px-4 py-2 text-center">
              AI features need an Anthropic API key.{' '}
              <button onClick={() => setSettingsOpen(true)} className="underline font-semibold">
                Add one in Settings
              </button>
              .
            </div>
          )}

          {/* Persistent Bento Grid System Presentation */}
          <main className="fo-main w-full py-6 pb-20">
            <BentoGridShell />
          </main>

          {/* Modal Overlays */}
          <Suspense fallback={null}>
            {settingsOpen && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
            {historyOpen && <HistoryModal open={historyOpen} onClose={() => { setHistoryOpen(false); setTick((t) => t + 1); }} />}
            <BrainBatteryModal open={batteryModalOpen} onClose={() => setBatteryModalOpen(false)} />
            {autobrief && (
              <WelcomeBackModal
                days={autobrief.days}
                reason={autobrief.reason}
                miles={autobrief.miles}
                onClose={() => setAutobrief(null)}
              />
            )}
          </Suspense>

          <MagicTrail />
        </div>
      </div>
    </BentoGridProvider>
  );
};

export default AppLayout;
