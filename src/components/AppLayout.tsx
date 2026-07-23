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

        {/* Desktop nav */}
        <div className="max-w-6xl mx-auto px-4 hidden md:flex gap-1 pb-2 -mt-1 flex-wrap">
          {visibleMainNav.map((n) => {
            const Icon = n.icon;
            const isActive = active === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setActive(n.id)}
                className={`px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 transition ${
                  isActive ? 'bg-[#E08C00] text-white shadow-[0_4px_20px_rgba(224,140,0,0.45)]' : 'text-white/50 hover:text-white hover:bg-white/5'
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
                className="px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 text-white/50 hover:text-white hover:bg-white/5 transition"
              >
                More {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showMore && (
                <div className="absolute top-full left-0 mt-1 bg-[#1E0E04] border border-[#F8DABC]/10 rounded-xl shadow-2xl overflow-hidden z-40 min-w-[150px]">
                  {MORE_NAV.map(n => {
                    const Icon = n.icon;
                    const isActive = active === n.id;
                    return (
                      <button
                        key={n.id}
                        onClick={() => { setActive(n.id); setShowMore(false); }}
                        className={`w-full px-4 py-2.5 text-sm flex items-center gap-2 transition ${isActive ? 'bg-[#E08C00]/20 text-[#F5A800]' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#1E0E04]/95 backdrop-blur-md border-t border-[#F8DABC]/10 px-2 py-2">
        {/* More drawer */}
        {showMore && isAdm && (
          <div className="flex gap-1 justify-around mb-2 pb-2 border-b border-[#F8DABC]/10">
            {MORE_NAV.map(n => {
              const Icon = n.icon;
              const isActive = active === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => { setActive(n.id); setShowMore(false); }}
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg transition ${isActive ? 'text-[#F5A800]' : 'text-white/40'}`}
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
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${isActive ? 'text-[#F5A800]' : 'text-white/40'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-medium">{n.label.split(' ')[0]}</span>
              </button>
            );
          })}

          {isAdm && (
            <button
              onClick={() => setShowMore(m => !m)}
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition ${showMore ? 'text-white' : 'text-white/40'}`}
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
