import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home, Calendar, Handshake, Heart, LayoutDashboard, Settings as SettingsIcon,
  Search, History, Users, DollarSign, ChevronUp, ChevronDown, LogOut,
  ShoppingCart, Utensils, Receipt, Car, Wrench, Baby, Brain, Package, Trophy
} from 'lucide-react';

import { KEYS, loadJSON, isOverdue, formatTime } from '@/lib/familyos';
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

type TopModule = 'dashboard' | 'household' | 'kids' | 'family' | 'health' | 'finance' | 'rewards' | 'quality' | 'promises' | 'emotions';
type HouseholdTab = 'tasks' | 'shopping' | 'meals' | 'pantry' | 'bills' | 'home' | 'cars' | 'brain';

interface NavItem { id: TopModule; label: string; icon: React.ComponentType<{ className?: string }>; accent: string; adminOnly?: boolean; }

const MAIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, accent: 'indigo' },
  { id: 'household', label: 'Household', icon: Home, accent: 'orange' },
  { id: 'rewards', label: 'Rewards', icon: Trophy, accent: 'amber' },
  { id: 'kids', label: 'Kids', icon: Baby, accent: 'purple' },
  { id: 'family', label: 'Family', icon: Users, accent: 'blue' },
  { id: 'health', label: 'Health', icon: Heart, accent: 'rose' },
  { id: 'finance', label: 'Finance', icon: DollarSign, accent: 'emerald', adminOnly: true },
];

const MORE_NAV: NavItem[] = [
  { id: 'quality', label: 'Quality Time', icon: Calendar, accent: 'purple' },
  { id: 'promises', label: 'Promises', icon: Handshake, accent: 'blue' },
  { id: 'emotions', label: 'Emotions', icon: Heart, accent: 'rose' },
];

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

  // Visible nav items based on role
  const visibleMainNav = MAIN_NAV.filter(n => {
    if (isChild && (n.id === 'health' || n.id === 'finance')) return false;
    if (n.adminOnly && !isAdm) return false;
    return true;
  });

  // Child-visible household tabs
  const visibleHouseholdTabs = HOUSEHOLD_TABS.filter(t => {
    if (isChild && !['tasks', 'shopping'].includes(t.id)) return false;
    return true;
  });

  const accent = [...MAIN_NAV, ...MORE_NAV].find((n) => n.id === active)?.accent || 'indigo';

  const renderModule = () => {
    // Redirect child away from restricted modules
    const restrictedForChild: TopModule[] = ['health', 'finance', 'quality', 'promises', 'emotions'];
    if (isChild && restrictedForChild.includes(active)) {
      return (
        <div className="text-center py-16">
          <div className="text-slate-500 text-lg">This section is for parents only.</div>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Hidden safelist */}
      <div className="hidden">
        <span className="from-orange-500 to-orange-700 from-indigo-500 to-indigo-700 from-purple-500 to-purple-700 from-blue-500 to-blue-700 from-rose-500 to-rose-700 from-pink-500 to-pink-700 from-emerald-500 to-emerald-700 from-amber-500 to-amber-700 from-green-500 to-green-700" />
        <span className="bg-orange-500 bg-orange-600 bg-orange-900/40 bg-orange-600/20 bg-orange-600/30 border-orange-500 border-orange-500/20 border-orange-500/30 border-orange-500/40 text-orange-200 text-orange-300 text-orange-400 from-orange-900/40 from-orange-900/30 hover:bg-orange-500 hover:bg-orange-600/30 shadow-orange-500/20" />
        <span className="bg-indigo-500 bg-indigo-600 bg-indigo-900/40 bg-indigo-600/20 bg-indigo-600/30 border-indigo-500 border-indigo-500/20 border-indigo-500/30 border-indigo-500/40 text-indigo-200 text-indigo-300 text-indigo-400 from-indigo-900/40 hover:bg-indigo-500 hover:bg-indigo-600/30 shadow-indigo-500/20" />
        <span className="bg-purple-500 bg-purple-600 bg-purple-900/40 border-purple-500 border-purple-500/20 border-purple-500/30 text-purple-200 text-purple-300 text-purple-400 from-purple-900/40 from-purple-900/30 hover:bg-purple-500 shadow-purple-500/20" />
        <span className="bg-blue-500 bg-blue-600 bg-blue-900/40 bg-blue-600/20 bg-blue-600/30 border-blue-500 border-blue-500/20 border-blue-500/30 border-blue-500/40 text-blue-200 text-blue-300 text-blue-400 from-blue-900/40 from-blue-900/30 hover:bg-blue-500 hover:bg-blue-600/30 shadow-blue-500/20" />
        <span className="bg-rose-500 bg-rose-600 bg-rose-900/40 bg-rose-600/20 bg-rose-600/30 border-rose-500 border-rose-500/20 border-rose-500/30 border-rose-500/40 text-rose-200 text-rose-300 text-rose-400 from-rose-900/40 hover:bg-rose-500 hover:bg-rose-600/30 shadow-rose-500/20" />
        <span className="bg-pink-500 bg-pink-600 bg-pink-900/40 border-pink-500 border-pink-500/20 border-pink-500/30 text-pink-200 text-pink-300 text-pink-400 from-pink-900/40 from-pink-900/30 shadow-pink-500/20" />
        <span className="bg-emerald-500 bg-emerald-600 bg-emerald-900/40 border-emerald-500 border-emerald-500/30 text-emerald-200 text-emerald-300 text-emerald-400 from-emerald-900/40 from-emerald-900/30 shadow-emerald-500/20" />
        <span className="bg-amber-500 bg-amber-600 bg-amber-600/20 bg-amber-900/40 border-amber-500 border-amber-500/30 text-amber-200 text-amber-300 text-amber-400 from-amber-900/40 from-amber-900/30 shadow-amber-500/20" />
        <span className="bg-green-500 border-green-500 border-green-500/30 from-green-900/40 from-green-900/30 text-green-200 text-green-300 text-green-400" />
        <span className="bg-indigo-400 bg-pink-400 bg-purple-400 bg-blue-400" />
        <span className="hover:border-indigo-500/60 hover:border-pink-500/60 hover:border-purple-500/60 hover:border-blue-500/60" />
      </div>

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br from-${accent}-500 to-${accent}-700 flex items-center justify-center font-bold text-sm transition-colors duration-500`}>
              FO
            </div>
            <div>
              <div className="font-bold leading-none">Family OS</div>
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                Hi, {currentUser?.name || 'Guest'}
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-md mx-auto hidden sm:block relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks & promises..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
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
              <div className={`w-2 h-2 rounded-full ${inZone ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-slate-400">{inZone ? 'In zone' : 'Off zone'}</span>
            </div>
            <div className="text-sm font-medium text-slate-300 tabular-nums">{formatTime(now)}</div>
            <button onClick={() => setHistoryOpen(true)} title="History" className="text-slate-400 hover:text-emerald-400 p-1.5 transition">
              <History className="w-5 h-5" />
            </button>
            {isAdm && (
              <button onClick={() => setSettingsOpen(true)} className="relative text-slate-400 hover:text-white p-1.5">
                <SettingsIcon className="w-5 h-5" />
                {totals.overdue > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                    {totals.overdue}
                  </span>
                )}
              </button>
            )}
            <button onClick={logout} title="Logout" className="text-slate-400 hover:text-rose-400 p-1.5 transition">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Desktop nav */}
        <div className="max-w-6xl mx-auto px-4 hidden md:flex gap-1 pb-2 -mt-1 flex-wrap">
          {visibleMainNav.map((n) => {
            const Icon = n.icon;
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setActive(n.id)}
                className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
                  isActive ? `bg-${n.accent}-600 text-white shadow-lg shadow-${n.accent}-500/20` : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {n.label}
              </button>
            );
          })}

          {/* More dropdown (desktop) */}
          {isAdm && (
            <div className="relative">
              <button
                onClick={() => setShowMore(m => !m)}
                className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                More {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showMore && (
                <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-40 min-w-[150px]">
                  {MORE_NAV.map(n => {
                    const Icon = n.icon;
                    const isActive = active === n.id;
                    return (
                      <button
                        key={n.id}
                        onClick={() => { setActive(n.id); setShowMore(false); }}
                        className={`w-full px-4 py-2.5 text-sm flex items-center gap-2 transition ${isActive ? `bg-${n.accent}-600/20 text-${n.accent}-300` : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                      >
                        <Icon className="w-4 h-4" /> {n.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* No-API-key banner */}
      {!hasApiKey && isAdm && (
        <div className="bg-amber-900/30 border-b border-amber-500/30 text-amber-200 text-sm px-4 py-2 text-center">
          AI features need an Anthropic API key. <button onClick={() => setSettingsOpen(true)} className="underline font-semibold">Add one in Settings</button>.
        </div>
      )}

      {/* MAIN */}
      <main className="max-w-6xl mx-auto px-4 py-6 pb-28 md:pb-10 transition-opacity duration-300" key={active}>
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          {renderModule()}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-2">
        {/* More drawer */}
        {showMore && isAdm && (
          <div className="flex gap-1 justify-around mb-2 pb-2 border-b border-slate-800">
            {MORE_NAV.map(n => {
              const Icon = n.icon;
              const isActive = active === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => { setActive(n.id); setShowMore(false); }}
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg transition ${isActive ? `text-${n.accent}-400` : 'text-slate-500'}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[9px] font-medium">{n.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={`grid gap-1 ${isAdm ? 'grid-cols-7' : 'grid-cols-5'}`}>
          {visibleMainNav.map((n) => {
            const Icon = n.icon;
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setActive(n.id)}
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${isActive ? `text-${n.accent}-400` : 'text-slate-500'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-medium">{n.label.split(' ')[0]}</span>
              </button>
            );
          })}

          {isAdm && (
            <button
              onClick={() => setShowMore(m => !m)}
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${showMore ? 'text-white' : 'text-slate-500'}`}
            >
              <ChevronUp className={`w-5 h-5 transition ${showMore ? 'rotate-180' : ''}`} />
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
