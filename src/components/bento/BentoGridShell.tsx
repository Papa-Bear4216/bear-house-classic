import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import {
  ListChecks, CalendarDays, ShoppingCart, Utensils, DollarSign,
  Heart, Trophy, Wrench, ShieldCheck, Scale, Zap, Sparkles, CheckCircle2,
  Clock, AlertTriangle, AlertCircle, Package
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
const Emotions = lazy(() => import('@/components/familyos/Emotions'));
const KidsHub = lazy(() => import('@/components/familyos/sections/KidsHub'));
const RewardStore = lazy(() => import('@/components/familyos/RewardStore'));
const HomeMaintenance = lazy(() => import('@/components/familyos/sections/HomeMaintenance'));
const CarMaintenance = lazy(() => import('@/components/familyos/sections/CarMaintenance'));
const QualityTime = lazy(() => import('@/components/familyos/QualityTime'));
const Promises = lazy(() => import('@/components/familyos/Promises'));

export const BentoGridShell: React.FC = () => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const { expandedModule, scope } = useBentoGrid();

  // Live state tracking for glanceable card previews
  const [tasks, setTasks] = useState<any[]>(() => loadJSON(KEYS.tasks, []));
  const [promises, setPromises] = useState<any[]>(() => loadJSON(KEYS.promises, []));
  const [shoppingItems, setShoppingItems] = useState<any[]>(() => loadJSON(KEYS.shopping, []));
  const [bills, setBills] = useState<any[]>(() => loadJSON(KEYS.bills, []));
  const [emotions, setEmotions] = useState<any[]>(() => loadJSON(KEYS.emotions, []));
  const [activities, setActivities] = useState<any[]>(() => loadJSON(KEYS.activities, []));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const handleStorage = () => {
      setTasks(loadJSON(KEYS.tasks, []));
      setPromises(loadJSON(KEYS.promises, []));
      setShoppingItems(loadJSON(KEYS.shopping, []));
      setBills(loadJSON(KEYS.bills, []));
      setEmotions(loadJSON(KEYS.emotions, []));
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

  const emotionStats = useMemo(() => {
    const recent = emotions.slice(-5);
    const avg = recent.length ? (recent.reduce((acc, e) => acc + (e.intensity || 3), 0) / recent.length).toFixed(1) : '4.2';
    return {
      average: avg,
      recentCount: emotions.length,
    };
  }, [emotions, tick]);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-6">
      {/* 12-Column Responsive Bento Grid Container */}
      <div className="@container/bento-grid grid grid-cols-12 gap-4 sm:gap-5">

        {/* 1. Focus & Chores Hero Bento Card (8 Cols) */}
        <BentoCard
          id="household"
          title="Chores & Household Brain"
          subtitle="Priority chores, task lists & recurring home routines"
          icon={ListChecks}
          accentColor="amber"
          colSpan={8}
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

        {/* 2. Schedule & Run of Show Bento Card (4 Cols) */}
        <BentoCard
          id="quality"
          title="Schedule & Run of Show"
          subtitle="Family timeline & logistics"
          icon={CalendarDays}
          accentColor="emerald"
          colSpan={4}
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

        {/* 3. Hermes Copilot AI Stream Card (6 Cols) */}
        <BentoCard
          id="hermes-chat"
          title="Hermes Copilot AI"
          subtitle="Triad Fusion household intelligence"
          icon={Sparkles}
          accentColor="violet"
          colSpan={6}
          badge={
            <span className="px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/40 text-[11px] font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-ping" />
              Triad Stream
            </span>
          }
        >
          <BentoHermesChatPreview />
        </BentoCard>

        {/* 4. Family Squad & Vibe / Emotions Card (6 Cols) */}
        <BentoCard
          id="emotions"
          title="Family Squad & Vibe"
          subtitle="Presence, mood tracking & connection"
          icon={Heart}
          accentColor="rose"
          colSpan={6}
          badge={
            <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold">
              Mood: {emotionStats.average} / 5
            </span>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Roster:</span>
              <div className="flex -space-x-2">
                {householdMembers.map((m) => (
                  <div
                    key={m.id}
                    title={m.name}
                    className="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-900 text-[11px] font-extrabold text-white flex items-center justify-center ring-1 ring-white/10"
                  >
                    {m.name.charAt(0)}
                  </div>
                ))}
              </div>
              <span className="text-xs text-slate-400 ml-2">({householdMembers.length} active)</span>
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between text-xs text-slate-300">
              <span>Recent Vibe Check-ins:</span>
              <span className="font-semibold text-rose-300">{emotionStats.recentCount} logged</span>
            </div>
          </div>
        </BentoCard>

        {/* 5. Meal Planner Stream (4 Cols) */}
        <BentoCard
          id="household"
          title="Meal & Nutrition Hub"
          subtitle="Weekly dinner menu & scaling"
          icon={Utensils}
          accentColor="sky"
          colSpan={4}
          badge={
            <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 text-[10px] font-bold">
              Tonight&apos;s Dinner
            </span>
          }
        >
          <div className="p-3 rounded-2xl bg-sky-950/30 border border-sky-500/20 space-y-1">
            <div className="text-xs text-sky-400 font-semibold uppercase">Featured Meal:</div>
            <div className="text-sm font-bold text-white truncate">Home Cooked Dinner</div>
            <div className="text-[11px] text-slate-400">Ingredients ready &bull; Recipes synced</div>
          </div>
        </BentoCard>

        {/* 6. Pantry & Grocery Stream (4 Cols) */}
        <BentoCard
          id="household"
          title="Pantry & Shopping"
          subtitle="Inventory & groceries"
          icon={ShoppingCart}
          accentColor="amber"
          colSpan={4}
          badge={
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold">
              {shoppingStats.neededCount} to buy
            </span>
          }
        >
          <div className="space-y-1.5 text-xs text-slate-300">
            {shoppingStats.previewList.length > 0 ? (
              shoppingStats.previewList.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-1.5 rounded-lg bg-white/[0.02]">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="truncate">{item}</span>
                </div>
              ))
            ) : (
              <div className="text-slate-400 italic text-center p-2">Pantry well stocked</div>
            )}
          </div>
        </BentoCard>

        {/* 7. Finance & Bills Stream (4 Cols, Role-gated by Triad scope) */}
        <BentoCard
          id="finance"
          title="Finance & Bill Tracker"
          subtitle="Household bills & expenses"
          icon={DollarSign}
          accentColor="cyan"
          colSpan={4}
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
          <div className="p-3 rounded-2xl bg-cyan-950/30 border border-cyan-500/20 space-y-1">
            <div className="text-[11px] text-cyan-400 font-semibold">Unpaid Total:</div>
            <div className="text-xl font-extrabold text-white font-mono">${billStats.totalAmount.toFixed(2)}</div>
            <div className="text-[10px] text-slate-400">Strictly isolated to Admin/Adult scope</div>
          </div>
        </BentoCard>

        {/* 8. Kids & Rewards Stream (4 Cols) */}
        {/* 8. Custody & Co-Parenting Bento Card (6 Cols) */}
        <BentoCard
          id="custody"
          title="Custody & Co-Parenting"
          subtitle="Predictable schedules, handoffs & calm swaps"
          icon={CalendarDays}
          accentColor="amber"
          colSpan={6}
          badge={
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold">
              Co-Parent Logistics
            </span>
          }
        >
          <BentoCustodyPreview />
        </BentoCard>

        {/* 9. Kids & Rewards Stream (6 Cols) */}
        <BentoCard
          id="rewards"
          title="Kids Corner & Rewards"
          subtitle="Gamified points & allowances"
          icon={Trophy}
          accentColor="amber"
          colSpan={6}
          badge={
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-[10px] font-bold">
              Rewards Active
            </span>
          }
        >
          <div className="p-3 rounded-2xl bg-amber-950/20 border border-amber-500/20 text-xs text-slate-300 space-y-1">
            <div className="font-bold text-amber-300">Point Economy Online</div>
            <div>Chores automatically convert into rewards and milestone badges.</div>
          </div>
        </BentoCard>

        {/* 10. Privacy Policy Bento Card (6 Cols) */}
        <BentoCard
          id="legal-privacy"
          title="Privacy Policy"
          subtitle="HotMessExpress family data pledge"
          icon={ShieldCheck}
          accentColor="indigo"
          colSpan={6}
        >
          <BentoLegalPrivacyPreview />
        </BentoCard>

        {/* 11. Terms of Service Bento Card (6 Cols) */}
        <BentoCard
          id="legal-terms"
          title="Terms of Service"
          subtitle="Neurodivergent-friendly agreement"
          icon={Scale}
          accentColor="sky"
          colSpan={6}
        >
          <BentoLegalTermsPreview />
        </BentoCard>

      </div>

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

          {expandedModule === 'quality' && (
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
              title="Family Hub & Emotions"
              subtitle="Household roster, check-ins & vibe logging"
              icon={Heart}
            >
              <div className="space-y-6">
                <FamilyHub />
                <Emotions />
              </div>
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
