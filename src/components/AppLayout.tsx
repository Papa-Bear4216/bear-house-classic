import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import {
  Settings as SettingsIcon, Search, History, ChevronUp, LogOut,
  ShoppingCart, Utensils, Receipt, Car, Wrench, Brain, Package, Home, Grid2x2, Smartphone, ClipboardList, CalendarDays
} from 'lucide-react';

import { KEYS, loadJSON, isOverdue, formatTime, loadMemberPreferences } from '@/lib/familyos';
import { getVisibleModulesFor, type TopModule } from '@/lib/navVisibility';
import { useAppContext } from '@/contexts/AppContext';
// Dashboard is the default landing view — keep it eager to avoid a loading
// flash on every app open. Everything below only renders behind user
// navigation (the renderModule() switch, or a modal's `open` prop), so it's
// lazy-loaded to keep the initial bundle from including code most sessions
// never touch.
import Dashboard from '@/components/familyos/Dashboard';
import MagicTrail from '@/components/familyos/MagicTrail';
import { recordVisit, recordLocation, checkAutobrief } from '@/lib/presenceTracker';
import BrainBatteryModal from '@/components/familyos/BrainBatteryModal';
import { getBrainBattery, BATTERY_LEVELS, type BatteryLevel } from '@/lib/brainBattery';

// Floating widgets rendered on every page, not the initial view itself —
// lazy per the rule above so Dashboard can paint before these hydrate.
const HermesChat = lazy(() => import('@/components/familyos/HermesChat'));
const QuickCapture = lazy(() => import('@/components/familyos/QuickCapture'));
const WelcomeBackModal = lazy(() => import('@/components/familyos/WelcomeBackModal'));

const HouseholdBrain = lazy(() => import('@/components/familyos/HouseholdBrain'));
const QualityTime = lazy(() => import('@/components/familyos/QualityTime'));
const Promises = lazy(() => import('@/components/familyos/Promises'));
const Emotions = lazy(() => import('@/components/familyos/Emotions'));
const SettingsModal = lazy(() => import('@/components/familyos/SettingsModal'));
const HistoryModal = lazy(() => import('@/components/familyos/HistoryModal'));
const Shopping = lazy(() => import('@/components/familyos/sections/Shopping'));
const MealPlanner = lazy(() => import('@/components/familyos/sections/MealPlanner'));
const Pantry = lazy(() => import('@/components/familyos/sections/Pantry'));
const BillTracker = lazy(() => import('@/components/familyos/sections/BillTracker'));
const CarMaintenance = lazy(() => import('@/components/familyos/sections/CarMaintenance'));
const HomeMaintenance = lazy(() => import('@/components/familyos/sections/HomeMaintenance'));
const DeviceWarranty = lazy(() => import('@/components/familyos/sections/DeviceWarranty'));
const HouseholdMemory = lazy(() => import('@/components/familyos/sections/HouseholdMemory'));
const KidsHub = lazy(() => import('@/components/familyos/sections/KidsHub'));
const HealthHub = lazy(() => import('@/components/familyos/sections/HealthHub'));
const FamilyHub = lazy(() => import('@/components/familyos/sections/FamilyHub'));
const FinanceHub = lazy(() => import('@/components/familyos/sections/FinanceHub'));
const RewardStore = lazy(() => import('@/components/familyos/RewardStore'));
const RunOfShow = lazy(() => import('@/components/familyos/sections/RunOfShow'));

type HouseholdTab = 'tasks' | 'logistics' | 'shopping' | 'meals' | 'pantry' | 'bills' | 'home' | 'cars' | 'warranty' | 'brain';

const HOUSEHOLD_TABS: { id: HouseholdTab; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean; }[] = [
  { id: 'tasks', label: 'Tasks', icon: Home },
  { id: 'logistics', label: 'Run of Show', icon: CalendarDays },
  { id: 'shopping', label: 'Shopping', icon: ShoppingCart },
  { id: 'meals', label: 'Meals', icon: Utensils },
  { id: 'pantry', label: 'Pantry', icon: Package },
  { id: 'bills', label: 'Bills', icon: Receipt },
  { id: 'home', label: 'Home', icon: Wrench },
  { id: 'cars', label: 'Cars', icon: Car },
  { id: 'warranty', label: 'Warranty', icon: Smartphone },
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
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {visibleHouseholdTabs.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setHouseholdTab(t.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 shadow-sm ${
                      householdTab === t.id
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-amber-500/25 scale-[1.02]'
                        : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            {householdTab === 'tasks' && <HouseholdBrain />}
            {householdTab === 'logistics' && <RunOfShow />}
            {householdTab === 'shopping' && <Shopping />}
            {householdTab === 'meals' && <MealPlanner />}
            {householdTab === 'pantry' && <Pantry />}
            {householdTab === 'bills' && <BillTracker />}
            {householdTab === 'home' && <HomeMaintenance />}
            {householdTab === 'cars' && <CarMaintenance />}
            {householdTab === 'warranty' && <DeviceWarranty />}
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
    <div className="min-h-screen bg-[#090D16] text-slate-100 relative selection:bg-amber-500 selection:text-slate-950 overflow-x-hidden font-sans">
      {/* Atmospheric ambient lighting */}
      <div className="fixed -top-40 -right-40 w-96 h-96 rounded-full bg-amber-500/[0.08] blur-[140px] pointer-events-none" />
      <div className="fixed top-1/3 -left-40 w-96 h-96 rounded-full bg-indigo-500/[0.08] blur-[140px] pointer-events-none" />
      <div className="fixed -bottom-40 right-1/3 w-96 h-96 rounded-full bg-rose-500/[0.05] blur-[140px] pointer-events-none" />

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-[#090D16]/80 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center font-display font-extrabold text-base text-slate-950 shadow-md shadow-amber-500/20 ring-2 ring-white/10">
              🐻
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-black text-sm tracking-tight text-white">FamilyOS</span>
                <span 
                  className="text-[9px] uppercase font-black tracking-widest text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md hidden xs:inline cursor-help"
                  title="HotMessExpress — A proud product of Dysfunction Junction 🚂"
                >
                  HOT MESS · DYSFUNCTION JUNCTION 🚂
                </span>
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
              className="w-full bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition"
            />
            {searchResults && (searchResults.tasks.length > 0 || searchResults.promises.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl max-h-80 overflow-y-auto z-40 p-2">
                {searchResults.tasks.length > 0 && (
                  <div className="p-1">
                    <div className="text-[10px] uppercase font-bold text-amber-400 px-2 py-1">Chores</div>
                    {searchResults.tasks.map((t) => (
                      <div key={t.id} className="px-3 py-2 text-sm text-slate-200 hover:bg-white/10 rounded-xl cursor-pointer transition" onClick={() => { setActive('household'); setSearch(''); }}>
                        {t.text}
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.promises.length > 0 && (
                  <div className="p-1 border-t border-white/10">
                    <div className="text-[10px] uppercase font-bold text-sky-400 px-2 py-1">Promises</div>
                    {searchResults.promises.map((p) => (
                      <div key={p.id} className="px-3 py-2 text-sm text-slate-200 hover:bg-white/10 rounded-xl cursor-pointer transition" onClick={() => { setActive('promises'); setSearch(''); }}>
                        <span className="text-sky-400 mr-2 font-semibold">{p.person}</span>{p.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
            <button
              onClick={() => setBatteryModalOpen(true)}
              className="sm:hidden p-2 rounded-xl bg-white/5 border border-white/10 text-sm"
              title="Brain Battery"
            >
              {BATTERY_LEVELS[batteryLevel].emoji}
            </button>
            <div className="hidden sm:flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-slate-300">
              <div className={`w-2 h-2 rounded-full ${inZone ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-[11px]">{inZone ? 'Home Zone' : 'Away'}</span>
            </div>
            <div className="text-xs font-mono font-semibold text-slate-300 tabular-nums px-1">{formatTime(now)}</div>
            <button onClick={() => setHistoryOpen(true)} title="History" className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition">
              <History className="w-4 h-4" />
            </button>
            {isAdm && (
              <button onClick={() => setSettingsOpen(true)} className="relative text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition">
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
          AI features need an Anthropic API key. <button onClick={() => setSettingsOpen(true)} className="underline font-semibold">Add one in Settings</button>.
        </div>
      )}

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-4 py-6 pb-32 transition-opacity duration-300" key={active}>
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <Suspense fallback={<div className="text-center py-16 text-slate-400 text-lg">Loading…</div>}>
            {renderModule()}
          </Suspense>
        </div>
      </main>

      {/* Unified floating island dock */}
      <nav className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[94%] max-w-lg bg-slate-900/85 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl shadow-black/60 px-3 py-2 ring-1 ring-white/10">
        {/* More drawer */}
        {showMore && moreModules.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-around mb-2 pb-3 border-b border-white/10">
            {moreModules.map(n => {
              const Icon = n.icon;
              const isActive = active === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => { setActive(n.id); setShowMore(false); }}
                  className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-xl transition focus-ring ${
                    isActive ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px]">{n.label.split(' ')[0]}</span>
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
            className="absolute inset-y-0 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 transition-transform duration-300 ease-out motion-reduce:transition-none"
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
                className={`relative flex flex-col items-center gap-1 py-1.5 rounded-xl transition-all focus-ring ${
                  isActive ? 'text-amber-400 font-bold scale-105 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] tracking-tight">{n.label.split(' ')[0]}</span>
              </button>
            );
          })}

          {moreModules.length > 0 && (
            <button
              onClick={() => setShowMore(m => !m)}
              className={`relative flex flex-col items-center gap-1 py-1.5 rounded-xl transition-all focus-ring ${
                showMore ? 'text-white font-bold scale-105 bg-white/10' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid2x2 className="w-5 h-5" />
              <span className="text-[10px] tracking-tight">More</span>
            </button>
          )}
        </div>
      </nav>

      <Suspense fallback={null}>
        {settingsOpen && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
        {historyOpen && <HistoryModal open={historyOpen} onClose={() => { setHistoryOpen(false); setTick((t) => t + 1); }} />}
        <BrainBatteryModal open={batteryModalOpen} onClose={() => setBatteryModalOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
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
      </Suspense>
      <MagicTrail />
    </div>
  );
};

export default AppLayout;
