import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import {
  ListChecks, CalendarDays, ShoppingCart, Utensils, DollarSign,
  Heart, Trophy, Wrench, ShieldCheck, Scale, Zap, Sparkles, CheckCircle2,
  Clock, AlertTriangle, AlertCircle, Package, Home, Users
} from 'lucide-react';


import { KEYS, loadJSON, saveJSON, isOverdue, daysUntilDue, relativeDate } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import { useBentoGrid } from './BentoGridContext';
import { BentoCard } from './BentoCard';
import { BentoExpandedModal } from './BentoExpandedModal';

import { BentoHermesChatPreview, BentoHermesChatExpanded } from './modules/BentoHermesChat';
import { BentoLegalPrivacyPreview, BentoLegalPrivacyExpanded } from './modules/BentoLegalPrivacy';
import { BentoLegalTermsPreview, BentoLegalTermsExpanded } from './modules/BentoLegalTerms';
import { BentoCustodyPreview, BentoCustodyExpanded } from './modules/BentoCustody';

// Lazy load full heavy interactive submodules for inline expansion
const HouseholdBrain = lazy(() => import('@/components/familyos/HouseholdBrain'));
const RunOfShow = lazy(() => import('@/components/familyos/sections/RunOfShow'));
const Shopping = lazy(() => import('@/components/familyos/sections/Shopping'));
const MealPlanner = lazy(() => import('@/components/familyos/sections/MealPlanner'));
const Pantry = lazy(() => import('@/components/familyos/sections/Pantry'));
const BillTracker = lazy(() => import('@/components/familyos/sections/BillTracker'));
const FinanceHub = lazy(() => import('@/components/familyos/sections/FinanceHub'));
const FamilyHub = lazy(() => import('@/components/familyos/sections/FamilyHub'));
const KidsHub = lazy(() => import('@/components/familyos/sections/KidsHub'));
const RewardStore = lazy(() => import('@/components/familyos/RewardStore'));
const HomeMaintenance = lazy(() => import('@/components/familyos/sections/HomeMaintenance'));
const CarMaintenance = lazy(() => import('@/components/familyos/sections/CarMaintenance'));
const QualityTime = lazy(() => import('@/components/familyos/QualityTime'));
const Promises = lazy(() => import('@/components/familyos/Promises'));

export const BentoGridShell: React.FC = () => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const { expandedModule, expandModule, scope } = useBentoGrid();

  // Live state tracking for glanceable card previews
  const [tasks, setTasks] = useState<any[]>(() => loadJSON(KEYS.tasks, []));
  const [promises, setPromises] = useState<any[]>(() => loadJSON(KEYS.promises, []));
  const [shoppingItems, setShoppingItems] = useState<any[]>(() => loadJSON(KEYS.shopping, []));
  const [bills, setBills] = useState<any[]>(() => loadJSON(KEYS.bills, []));
  const [activities, setActivities] = useState<any[]>(() => loadJSON(KEYS.activities, []));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const handleStorage = () => {
      setTasks(loadJSON(KEYS.tasks, []));
      setPromises(loadJSON(KEYS.promises, []));
      setShoppingItems(loadJSON(KEYS.shopping, []));
      setBills(loadJSON(KEYS.bills, []));
      setActivities(loadJSON(KEYS.activities, []));
      setTick((t) => t + 1);
    };


    window.addEventListener('storage', handleStorage);
    window.addEventListener('familyos:sync-updated', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('familyos:sync-updated', handleStorage);
    };
  }, []);

  // Summary Metrics
  const taskStats = useMemo(() => {
    const uncompleted = tasks.filter((t) => !t.completed);
    const overdue = uncompleted.filter((t) => isOverdue(t));
    const today = uncompleted.filter((t) => t.priority === 'High' || (t.dueDate && daysUntilDue(t.dueDate) <= 0));
    return {
      uncompletedCount: uncompleted.length,
      overdueCount: overdue.length,
      todayCount: today.length,
      topTasks: uncompleted.slice(0, 3),
    };
  }, [tasks, tick]);

  const scheduleStats = useMemo(() => {
    const now = Date.now();
    const upcoming = activities
      .filter((a) => !a.completed && a.scheduledAt && a.scheduledAt > now)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
    return {
      nextItem: upcoming[0] || null,
      count: upcoming.length,
    };
  }, [activities, tick]);

  const shoppingStats = useMemo(() => {
    const needed = shoppingItems.filter((item) => !item.bought);
    return {
      neededCount: needed.length,
      previewList: needed.slice(0, 3).map((i) => i.name || i.text),
    };
  }, [shoppingItems, tick]);

  const billStats = useMemo(() => {
    const unpaid = bills.filter((b) => !b.paid);
    const totalAmount = unpaid.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    return {
      unpaidCount: unpaid.length,
      totalAmount,
      nextDue: unpaid[0]?.dueDate || null,
    };
  }, [bills, tick]);


  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-6">
      {/* 12-Column Responsive Bento Grid Container */}
      <div className="@container/bento-grid grid grid-cols-12 gap-4 sm:gap-5">

        {/* 1. Custody & Co-Parenting Bento Card (7 Cols) - Top Anchor */}
        <BentoCard
          id="custody"
          title="Custody & Co-Parenting"
          subtitle="Predictable schedules, handoffs & calm swaps"
          icon={CalendarDays}
          accentColor="amber"
          colSpan={7}
          badge={
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold">
              Co-Parent Logistics
            </span>
          }
        >
          <BentoCustodyPreview />
        </BentoCard>

        {/* 2. Schedule & Run of Show Bento Card (5 Cols) */}
        <BentoCard
          id="quality"
          title="Schedule & Run of Show"
          subtitle="Family timeline & logistics"
          icon={CalendarDays}
          accentColor="emerald"
          colSpan={5}
          badge={
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
              {scheduleStats.count} upcoming
            </span>
          }
        >
          <div className="space-y-2.5">
            <div className="text-xs text-slate-400">Next Scheduled Milestone:</div>
            {scheduleStats.nextItem ? (
              <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/20 space-y-1">
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{scheduleStats.nextItem.name}</span>
                </div>
                <div className="text-xs text-emerald-300">
                  {new Date(scheduleStats.nextItem.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} &bull; {scheduleStats.nextItem.person || 'Family'}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-xs text-slate-400 text-center">
                Open schedule &bull; No conflicts right now
              </div>
            )}
          </div>
        </BentoCard>

        {/* 3. Chores & Household Focus (7 Cols) */}
        <BentoCard
          id="household"
          title="Chores & Household Focus"
          subtitle="Priority chores & recurring home routines"
          icon={ListChecks}
          accentColor="amber"
          colSpan={7}
          badge={
            taskStats.overdueCount > 0 ? (
              <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold flex items-center gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" /> {taskStats.overdueCount} Overdue
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold">
                {taskStats.uncompletedCount} Active
              </span>
            )
          }
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{taskStats.todayCount} due today</span>
              <span>Top Focus Chores</span>
            </div>
            <div className="space-y-1.5">
              {taskStats.topTasks.length > 0 ? (
                taskStats.topTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-200"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="truncate font-medium">{t.text}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-md bg-white/5 flex-shrink-0">
                      {t.person || 'Anyone'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-3 text-center rounded-xl bg-white/[0.02] text-xs text-slate-400">
                  All chores complete! Enjoy your day.
                </div>
              )}
            </div>
          </div>
        </BentoCard>

        {/* 4. Hermes Copilot AI Stream Card (5 Cols) */}
        <BentoCard
          id="hermes-chat"
          title="Hermes Copilot AI"
          subtitle="Triad Fusion household intelligence"
          icon={Sparkles}
          accentColor="violet"
          colSpan={5}
          badge={
            <span className="px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 text-[11px] font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
              Triad Stream
            </span>
          }
        >
          <BentoHermesChatPreview />
        </BentoCard>

        {/* 5. Kitchen, Meals & Groceries (6 or 12 Cols) */}
        <BentoCard
          id="pantry-shopping"
          title="Kitchen & Groceries"
          subtitle="Dinner menu, pantry & shopping list"
          icon={Utensils}
          accentColor="sky"
          colSpan={scope.role === 'child' ? 12 : 6}
          badge={
            <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 text-[10px] font-bold">
              {shoppingStats.neededCount} to buy
            </span>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-sky-950/20 border border-sky-500/20 space-y-1">
              <div className="text-[10px] uppercase font-bold text-sky-400">Tonight&apos;s Dinner</div>
              <div className="text-xs font-bold text-white truncate">Home Cooked Dinner</div>
              <div className="text-[10px] text-slate-400">Recipes synced</div>
            </div>
            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
              <div className="text-[10px] uppercase font-bold text-amber-400">Shopping List</div>
              {shoppingStats.previewList.length > 0 ? (
                <div className="text-slate-200 truncate">{shoppingStats.previewList.join(', ')}</div>
              ) : (
                <div className="text-slate-400 italic">Pantry stocked</div>
              )}
            </div>
          </div>
        </BentoCard>

        {/* 6. Finance & Bills Stream (6 Cols, Role-gated by Triad scope) */}
        {scope.role !== 'child' && (
          <BentoCard
            id="finance"
            title="Finance & Bill Tracker"
            subtitle="Household bills & upcoming expenses"
            icon={DollarSign}
            accentColor="cyan"
            colSpan={6}
            badge={
              billStats.unpaidCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] font-bold">
                  {billStats.unpaidCount} due
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                  All paid
                </span>
              )
            }
          >
            <div className="p-3 rounded-2xl bg-cyan-950/30 border border-cyan-500/20 flex items-center justify-between">
              <div>
                <div className="text-[10px] text-cyan-400 font-semibold uppercase">Unpaid Total:</div>
                <div className="text-xl font-extrabold text-white font-mono">${billStats.totalAmount.toFixed(2)}</div>
              </div>
              <div className="text-right text-[11px] text-slate-400">
                {billStats.nextDue ? `Next due: ${billStats.nextDue}` : 'No bills due'}
              </div>
            </div>
          </BentoCard>
        )}

      </div>

      {/* Comprehensive Site Map Directory */}
      <section className="mt-12 pt-8 pb-4 border-t border-white/10" aria-label="Site Map Directory">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-sm font-bold tracking-wide uppercase text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Family OS Directory &amp; Navigation
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Instant access to all modules, routines, tools and household documentation
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/10 self-start sm:self-auto">
            12 Modules &bull; Triad Fusion
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-8 p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-white/10 backdrop-blur-md">
          {/* Column 1: Home & Tasks */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider pb-1.5 border-b border-white/10">
              <Home className="w-3.5 h-3.5" />
              <span>Home &amp; Tasks</span>
            </div>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('household')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <ListChecks className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 transition" />
                    <span className="font-medium">Household Brain</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Chores</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('meal-planner')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Utensils className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-400 transition" />
                    <span className="font-medium">Meal Planner</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Dinners</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('pantry-shopping')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition" />
                    <span className="font-medium">Pantry &amp; Groceries</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Lists</span>
                </button>
              </li>
              {scope.role !== 'child' && (
                <li>
                  <button
                    type="button"
                    onClick={() => expandModule('maintenance')}
                    className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2">
                      <Wrench className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 transition" />
                      <span className="font-medium">Maintenance &amp; Auto</span>
                    </span>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Upkeep</span>
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Column 2: Family & Kids */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-300 uppercase tracking-wider pb-1.5 border-b border-white/10">
              <Users className="w-3.5 h-3.5" />
              <span>Family &amp; Kids</span>
            </div>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('emotions')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Heart className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-400 transition" />
                    <span className="font-medium">Family Squad &amp; Roster</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Members</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('kids')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 transition" />
                    <span className="font-medium">Kids Corner</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Active</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('rewards')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-slate-400 group-hover:text-yellow-400 transition" />
                    <span className="font-medium">Reward Store</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Redeem</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('promises')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 transition" />
                    <span className="font-medium">Promises &amp; Commitments</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Trust</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Logistics & AI */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-violet-300 uppercase tracking-wider pb-1.5 border-b border-white/10">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Logistics &amp; AI</span>
            </div>
            <ul className="space-y-1.5 text-xs">
              {scope.role !== 'child' && (
                <li>
                  <button
                    type="button"
                    onClick={() => expandModule('custody')}
                    className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 transition" />
                      <span className="font-medium">Custody &amp; Co-Parent</span>
                    </span>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Handoffs</span>
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('quality')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition" />
                    <span className="font-medium">Run of Show &amp; Timelines</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Daily</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('hermes-chat')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-400 transition" />
                    <span className="font-medium">Hermes Copilot AI</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Assistant</span>
                </button>
              </li>
              {scope.role !== 'child' && (
                <li>
                  <button
                    type="button"
                    onClick={() => expandModule('finance')}
                    className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 transition" />
                      <span className="font-medium">Finance Hub &amp; Bills</span>
                    </span>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Expenses</span>
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Column 4: Legal & Policies */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider pb-1.5 border-b border-white/10">
              <Scale className="w-3.5 h-3.5" />
              <span>Legal &amp; Policies</span>
            </div>
            <ul className="space-y-1.5 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('legal-privacy')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 transition" />
                    <span className="font-medium">Privacy Policy</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Data</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => expandModule('legal-terms')}
                  className="w-full text-left py-1.5 px-2 -mx-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition flex items-center justify-between group"
                >
                  <span className="flex items-center gap-2">
                    <Scale className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 transition" />
                    <span className="font-medium">Terms of Service</span>
                  </span>
                  <span className="text-[10px] text-slate-500 group-hover:text-slate-300">Legal</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Quiet Clean Footer */}
        <footer className="mt-6 pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">HotMessExpress</span>
            <span>&bull;</span>
            <span>Zero-Friction Family OS</span>
            <span>&bull;</span>
            <span className="text-[11px] text-slate-500">v2.1.0</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400 text-[11px]">
            <span>Triad Fusion Architecture</span>
            <span>&bull;</span>
            <span>Encrypted Local State</span>
          </div>
        </footer>
      </section>

      {/* Inline Spatial Expansion Viewport: Zero Context Shift */}
      {expandedModule && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
              <div className="p-6 rounded-3xl bg-slate-900 border border-amber-400/30 text-amber-300 animate-pulse text-sm">
                Expanding Bento Module...
              </div>
            </div>
          }
        >
          {expandedModule === 'hermes-chat' && (
            <BentoExpandedModal
              title="Hermes Copilot"
              subtitle="Triad Fusion Intelligent Household Assistant"
              icon={Sparkles}
            >
              <BentoHermesChatExpanded />
            </BentoExpandedModal>
          )}

          {expandedModule === 'household' && (
            <BentoExpandedModal
              title="Household Brain"
              subtitle="Task Management, Chores, Pantry & Logistics"
              icon={ListChecks}
            >
              <HouseholdBrain />
            </BentoExpandedModal>
          )}

          {expandedModule === 'meal-planner' && (
            <BentoExpandedModal
              title="Meal Planner"
              subtitle="Weekly recipes, prep schedules & family dinners"
              icon={Utensils}
            >
              <MealPlanner />
            </BentoExpandedModal>
          )}

          {expandedModule === 'pantry-shopping' && (
            <BentoExpandedModal
              title="Pantry & Groceries"
              subtitle="Smart grocery list, inventory & household staples"
              icon={ShoppingCart}
            >
              <div className="space-y-6">
                <Shopping />
                <Pantry />
              </div>
            </BentoExpandedModal>
          )}

          {expandedModule === 'maintenance' && (
            <BentoExpandedModal
              title="Home & Vehicle Maintenance"
              subtitle="Appliance checklists, car service logs & recurring upkeep"
              icon={Wrench}
            >
              <div className="space-y-6">
                <HomeMaintenance />
                <CarMaintenance />
              </div>
            </BentoExpandedModal>
          )}

          {(expandedModule === 'quality' || expandedModule === 'run-of-show') && (
            <BentoExpandedModal
              title="Run of Show & Logistics"
              subtitle="Daily timelines, commitments & quality time"
              icon={CalendarDays}
            >
              <div className="space-y-6">
                <RunOfShow />
                <QualityTime />
              </div>
            </BentoExpandedModal>
          )}

          {expandedModule === 'emotions' && (
            <BentoExpandedModal
              title="Family Hub & Roster"
              subtitle="Household roster, connections & family messages"
              icon={Heart}
            >
              <FamilyHub />
            </BentoExpandedModal>
          )}


          {expandedModule === 'finance' && (
            <BentoExpandedModal
              title="Finance Hub & Bills"
              subtitle="Admin financial tracking & upcoming due dates"
              icon={DollarSign}
            >
              <div className="space-y-6">
                <BillTracker />
                <FinanceHub />
              </div>
            </BentoExpandedModal>
          )}

          {expandedModule === 'rewards' && (
            <BentoExpandedModal
              title="Reward Store & Kids Hub"
              subtitle="Allowance, streaks and redeemable rewards"
              icon={Trophy}
            >
              <div className="space-y-6">
                <RewardStore />
                <KidsHub />
              </div>
            </BentoExpandedModal>
          )}

          {expandedModule === 'kids' && (
            <BentoExpandedModal
              title="Kids Corner"
              subtitle="Kid-friendly chores and activities"
              icon={Trophy}
            >
              <KidsHub />
            </BentoExpandedModal>
          )}

          {expandedModule === 'promises' && (
            <BentoExpandedModal
              title="Promises & Commitments"
              subtitle="Track agreements and accountability"
              icon={Heart}
            >
              <Promises />
            </BentoExpandedModal>
          )}

          {expandedModule === 'custody' && (
            <BentoExpandedModal
              title="Custody Calendar & Co-Parent Deck"
              subtitle="Predictable schedules, handoffs & calm swap agreements"
              icon={CalendarDays}
            >
              <BentoCustodyExpanded />
            </BentoExpandedModal>
          )}

          {expandedModule === 'legal-privacy' && (
            <BentoExpandedModal
              title="Privacy Policy"
              subtitle="Official HotMessExpress Data Protection Documentation"
              icon={ShieldCheck}
            >
              <BentoLegalPrivacyExpanded />
            </BentoExpandedModal>
          )}

          {expandedModule === 'legal-terms' && (
            <BentoExpandedModal
              title="Terms of Service"
              subtitle="Official HotMessExpress Terms and Licensing"
              icon={Scale}
            >
              <BentoLegalTermsExpanded />
            </BentoExpandedModal>
          )}
        </Suspense>
      )}
    </div>
  );
};
