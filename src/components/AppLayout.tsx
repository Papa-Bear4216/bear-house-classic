import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings as SettingsIcon, Search, History, ChevronUp, LogOut,
  ShoppingCart, Utensils, Receipt, Car, Wrench, Brain, Package, Home, Grid2x2,
} from 'lucide-react';

import { KEYS, loadJSON, isOverdue, formatTime, loadMemberPreferences } from '@/lib/familyos';
import { getVisibleModulesFor, type TopModule } from '@/lib/navVisibility';
import { useAppContext } from '@/contexts/AppContext';
import HouseholdBrain from '@/components/familyos/HouseholdBrain';
import QualityTime from '@/components/familyos/QualityTime';
import Promises from '@/components/familyos/Promises';
import Emotions from '@/components/familyos/Emotions';
import Dashboard from '@/components/familyos/Dashboard';
import SettingsModal from '@/components/familyos/SettingsModal';
import HistoryModal from '@/components/familyos/HistoryModal';
import Shopping from '@/components/familyos/sections/Shopping';
import MealPlanner from '@/components/familyos/sections/MealPlanner';
import Pantry from '@/components/familyos/sections/Pantry';
import BillTracker from '@/components/familyos/sections/BillTracker';
import CarMaintenance from '@/components/familyos/sections/CarMaintenance';
import HomeMaintenance from '@/components/familyos/sections/HomeMaintenance';
import HouseholdMemory from '@/components/familyos/sections/HouseholdMemory';
import KidsHub from '@/components/familyos/sections/KidsHub';
import HealthHub from '@/components/familyos/sections/HealthHub';
import FamilyHub from '@/components/familyos/sections/FamilyHub';
import FinanceHub from '@/components/familyos/sections/FinanceHub';
import RewardStore from '@/components/familyos/RewardStore';
import QuickCapture from '@/components/familyos/QuickCapture';
import HermesChat from '@/components/familyos/HermesChat';
import WelcomeBackModal from '@/components/familyos/WelcomeBackModal';
import { recordVisit, recordLocation, checkAutobrief } from '@/lib/presenceTracker';
import MagicTrail from '@/components/familyos/MagicTrail';

type HouseholdTab = 'tasks' | 'shopping' | 'meals' | 'pantry' | 'bills' | 'home' | 'cars' | 'brain';

const HOUSEHOLD_TABS: { id: HouseholdTab; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean; }[] = [
  { id: 'tasks', label: 'Tasks', icon: Home },
  { id: 'shopping', label: 'Shopping', icon: ShoppingCart },
  { id: 'meals', label: 'Meals', icon: Utensils },
  { id: 'pantry', label: 'Pantry', icon: Package },
  { id: 'bills', label: 'Bills', icon: Receipt },
  { id: 'home', label: 'Home', icon: Wrench },
  { id: 'cars', label: 'Cars', icon: Car },
  { id: 'brain', label: 'Brain', icon: Brain },
];

const COLOR_DOT: Record<string, string> = {
  indigo: 'bg-indigo-400',
  pink: 'bg-pink-400',
  purple: 'bg-purple-400',
  blue: 'bg-blue-400',
};

const AppLayout: React.FC = () => {
  const { currentUser, currentRole, logout } = useAppContext();
  const isChild = currentRole === 'child';
  const isAdm = currentRole === 'superadmin' || currentRole === 'admin';

  const visibleModules = useMemo(
    () => (currentRole ? getVisibleModulesFor(currentRole) : []),
    [currentRole]
  );

  const coreNav = useMemo(() => {
    if (!currentUser) return [] as TopModule[];
    const prefs = loadMemberPreferences(currentUser.id);
    // Defensive fallback: drop any saved pick this role can no longer see (see navVisibility.ts's isModuleVisibleTo).
    const visibleIds = new Set(visibleModules.map((m) => m.id));
    const valid = prefs.coreNav.filter((id) => visibleIds.has(id));
    // Backfill from the default list if a role change or corrupted preference left fewer than 3 valid picks.
    for (const fallback of ['household', 'family', 'rewards', 'kids'] as TopModule[]) {
      if (valid.length >= 3) break;
      if (visibleIds.has(fallback) && !valid.includes(fallback)) valid.push(fallback);
    }
    return valid.slice(0, 3);
  }, [currentUser, visibleModules]);

  const dockModules = useMemo(
    () => ['dashboard' as TopModule, ...coreNav]
      .map((id) => visibleModules.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [coreNav, visibleModules]
  );

  const moreModules = useMemo(
    () => visibleModules.filter((m) => m.id !== 'dashboard' && !coreNav.includes(m.id)),
    [visibleModules, coreNav]
  );

  const [active, setActive] = useState<TopModule>('dashboard');
  const [householdTab, setHouseholdTab] = useState<HouseholdTab>('tasks');
  const [now, setNow] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);
  const [tick, setTick] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [autobrief, setAutobrief] = useState<{ days: number; reason: 'offline' | 'location'; miles?: number } | null>(null);
  const presenceChecked = useRef(false);

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

    // Check before recording so we capture "was away" state
    const homeLat = parseFloat(localStorage.getItem('home_lat') || '30.45');
    const homeLon = parseFloat(localStorage.getItem('home_lon') || '-91.15');
    const result = checkAutobrief(homeLat, homeLon);
    if (result.should) {
      setAutobrief({ days: result.days, reason: result.reason as 'offline' | 'location', miles: result.miles });
    }

    // Now record this visit
    recordVisit();

    // Try to get geolocation for away detection
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => recordLocation(pos.coords.latitude, pos.coords.longitude),
        () => {} // silently ignore if denied
      );
    }
  }, []);

  useEffect(() => setTick((t) => t + 1), [active, settingsOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'n' || e.key === 'N') setActive('household');
      if (e.key === 'p' || e.key === 'P') setActive('promises');
      if (e.key === 'e' || e.key === 'E') setActive('emotions');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const totals = useMemo(() => {
    const tasks = loadJSON<any[]>(KEYS.tasks, []);
    const promises = loadJSON<any[]>(KEYS.promises, []);
    const overdueTasks = tasks.filter((t) => !t.completed && isOverdue(t)).length;
    const overduePromises = promises.filter((p) => !p.completed && isOverdue(p)).length;
    return { overdue: overdueTasks + overduePromises };
  }, [tick, active]);

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

  // Child-visible household tabs
  const visibleHouseholdTabs = HOUSEHOLD_TABS.filter(t => {
    if (isChild && !['tasks', 'shopping'].includes(t.id)) return false;
    return true;
  });

  const dockSlotIndex = useMemo(() => {
    const idx = dockModules.findIndex((m) => m.id === active);
    return idx >= 0 ? idx : dockModules.length; // "More" slot (last) when a More-menu module is active
  }, [dockModules, active]);

  const renderModule = () => {
    // Redirect a role away from a module it can't see — defense in depth alongside
    // the nav-level filtering in dockModules/moreModules (navVisibility.ts is the
    // single source of truth for the restriction itself).
    if (currentRole && !visibleModules.some((m) => m.id === active)) {
      return (
        <div className="text-center py-16">
          <div className="text-cream-400/60 text-lg">This section isn't available for your account.</div>
        </div>
      );
    }

    switch (active) {
      case 'dashboard':
        return <Dashboard onNav={(m) => setActive(m as TopModule)} onQuickAdd={(m) => setActive(m as TopModule)} />;

      case 'household':
        return (
          <div className="space-y-4">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {visibleHouseholdTabs.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setHouseholdTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${householdTab === t.id ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            {householdTab === 'tasks' && <HouseholdBrain />}
            {householdTab === 'shopping' && <Shopping />}
            {householdTab === 'meals' && <MealPlanner />}
            {householdTab === 'pantry' && <Pantry />}
            {householdTab === 'bills' && <BillTracker />}
            {householdTab === 'home' && <HomeMaintenance />}
            {householdTab === 'cars' && <CarMaintenance />}
            {householdTab === 'brain' && <HouseholdMemory />}
          </div>
        );

      case 'rewards':
        return <RewardStore />;

      case 'kids':
        return <KidsHub />;
      case 'family':
        return <FamilyHub />;
      case 'health':
        return <HealthHub />;
      case 'finance':
        return <FinanceHub />;
      case 'quality':
        return <QualityTime />;
      case 'promises':
        return <Promises />;
      case 'emotions':
        return <Emotions />;
    }
  };

  const dotColor = currentUser ? (COLOR_DOT[currentUser.color] || 'bg-slate-400') : 'bg-slate-400';

  return (
    <div className="min-h-screen bg-[#1E0E04] text-white">

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-[#1E0E04]/90 backdrop-blur-md border-b border-[#F8DABC]/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#E08C00] flex items-center justify-center font-display font-bold text-sm text-white">
              FO
            </div>
            <div>
              <div className="font-display font-bold leading-none">FamilyOS</div>
              <div className="text-[10px] text-white/50 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                Hi, {currentUser?.name || 'Guest'}
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-md mx-auto hidden sm:block relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks & promises..."
              className="w-full bg-white/5 border border-white/10 rounded-full pl-9 pr-3 py-2 text-sm text-white placeholder-white/40 focus:border-[#E08C00] outline-none"
            />
            {searchResults && (searchResults.tasks.length > 0 || searchResults.promises.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl max-h-80 overflow-y-auto z-40">
                {searchResults.tasks.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] uppercase text-orange-400 px-2 py-1">Tasks</div>
                    {searchResults.tasks.map((t) => (
                      <div key={t.id} className="px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-700 rounded cursor-pointer" onClick={() => { setActive('household'); setSearch(''); }}>
                        {t.text}
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.promises.length > 0 && (
                  <div className="p-2 border-t border-slate-700">
                    <div className="text-[10px] uppercase text-blue-400 px-2 py-1">Promises</div>
                    {searchResults.promises.map((p) => (
                      <div key={p.id} className="px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-700 rounded cursor-pointer" onClick={() => { setActive('promises'); setSearch(''); }}>
                        <span className="text-blue-400 mr-2">{p.person}</span>{p.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <div className={`w-2 h-2 rounded-full ${inZone ? 'bg-[#1A8A4E] animate-pulse' : 'bg-white/30'}`} />
              <span className="text-white/50">{inZone ? 'In zone' : 'Off zone'}</span>
            </div>
            <div className="text-sm font-medium text-white/70 tabular-nums">{formatTime(now)}</div>
            <button onClick={() => setHistoryOpen(true)} title="History" className="text-white/50 hover:text-[#1A8A4E] p-1.5 transition">
              <History className="w-5 h-5" />
            </button>
            {isAdm && (
              <button onClick={() => setSettingsOpen(true)} className="relative text-white/50 hover:text-white p-1.5">
                <SettingsIcon className="w-5 h-5" />
                {totals.overdue > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {totals.overdue}
                  </span>
                )}
              </button>
            )}
            <button onClick={logout} title="Logout" className="text-white/50 hover:text-rose-400 p-1.5 transition">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

      </header>

      {/* No-API-key banner */}
      {!hasApiKey && isAdm && (
        <div className="bg-amber-900/30 border-b border-amber-500/30 text-amber-200 text-sm px-4 py-2 text-center">
          AI features need an Anthropic API key. <button onClick={() => setSettingsOpen(true)} className="underline font-semibold">Add one in Settings</button>.
        </div>
      )}

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-4 py-6 pb-28 transition-opacity duration-300" key={active}>
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {renderModule()}
        </div>
      </main>

      {/* Unified bottom dock — all breakpoints */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#1E0E04]/95 backdrop-blur-md border-t border-[#F8DABC]/10 px-2 py-2">
        {/* More drawer */}
        {showMore && moreModules.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-around mb-2 pb-2 border-b border-[#F8DABC]/10">
            {moreModules.map(n => {
              const Icon = n.icon;
              const isActive = active === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => { setActive(n.id); setShowMore(false); }}
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg transition focus-ring ${isActive ? 'text-[#F5A800]' : 'text-white/40 hover:text-white'}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-medium">{n.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        )}

        <div
          className="relative grid gap-1"
          style={{ gridTemplateColumns: `repeat(${dockModules.length + (moreModules.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
        >
          {/* Sliding active-state pill */}
          <div
            className="absolute inset-y-0 rounded-lg bg-white/5 transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{
              width: `${100 / (dockModules.length + (moreModules.length > 0 ? 1 : 0))}%`,
              transform: `translateX(${dockSlotIndex * 100}%)`,
            }}
          />

          {dockModules.map((n) => {
            const Icon = n.icon;
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setActive(n.id)}
                className={`relative flex flex-col items-center gap-0.5 py-2 rounded-lg transition-transform focus-ring ${isActive ? 'text-[#F5A800] scale-110' : 'text-white/40 hover:text-white'}`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-[9px] font-medium">{n.label.split(' ')[0]}</span>
              </button>
            );
          })}

          {moreModules.length > 0 && (
            <button
              onClick={() => setShowMore(m => !m)}
              className={`relative flex flex-col items-center gap-0.5 py-2 rounded-lg transition-transform focus-ring ${showMore ? 'text-white scale-110' : 'text-white/40 hover:text-white'}`}
            >
              <Grid2x2 className="w-6 h-6" />
              <span className="text-[9px] font-medium">More</span>
            </button>
          )}
        </div>
      </nav>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryModal open={historyOpen} onClose={() => { setHistoryOpen(false); setTick((t) => t + 1); }} />
      <QuickCapture />
      <HermesChat />
      {autobrief && (
        <WelcomeBackModal
          days={autobrief.days}
          reason={autobrief.reason}
          miles={autobrief.miles}
          onClose={() => setAutobrief(null)}
        />
      )}
      <MagicTrail />
    </div>
  );
};

export default AppLayout;
