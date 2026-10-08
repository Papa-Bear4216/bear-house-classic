import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  CalendarDays,
  Clock,
  Home,
  Sparkles,
  ArrowLeftRight,
  Shield,
} from 'lucide-react';
import {
  loadCustodySchedule,
  loadCustodySwaps,
  getCustodyDayDetails,
  formatLocalDateKey,
  type CustodySchedule,
  type CustodySwapRequest,
} from '@/lib/custody';
import { KEYS } from '@/lib/familyos';

const CustodyCalendar = lazy(() => import('@/components/familyos/sections/CustodyCalendar'));

export const BentoCustodyPreview: React.FC = () => {
  const [schedule, setSchedule] = useState<CustodySchedule>(() => loadCustodySchedule());
  const [swaps, setSwaps] = useState<CustodySwapRequest[]>(() => loadCustodySwaps());

  useEffect(() => {
    const handleUpdate = () => {
      setSchedule(loadCustodySchedule());
      setSwaps(loadCustodySwaps());
    };
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('familyos:sync-updated', handleUpdate);
    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('familyos:sync-updated', handleUpdate);
    };
  }, []);

  const todayStr = useMemo(() => formatLocalDateKey(new Date()), []);
  const todayDetails = useMemo(() => {
    return getCustodyDayDetails(todayStr, schedule, swaps);
  }, [todayStr, schedule, swaps]);

  const pendingSwaps = useMemo(() => {
    return swaps.filter((s) => s.status === 'pending');
  }, [swaps]);

  const isNonTraditional =
    schedule.pattern === 'split_day_alternating_weekends' ||
    schedule.pattern === 'custom';

  return (
    <div className="space-y-2.5">
      {/* Live Today / Tonight Status */}
      <div className="p-3 rounded-2xl bg-amber-950/20 border border-amber-500/20 space-y-1">
        <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-amber-400">
          <span>{todayDetails.isSplitDay ? 'Today (Split Routine)' : 'Today & Tonight'}</span>
          {pendingSwaps.length > 0 && (
            <span className="text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded-full">
              {pendingSwaps.length} swap pending
            </span>
          )}
        </div>

        <div className="text-sm font-bold text-white truncate">
          {todayDetails.isSplitDay
            ? `${schedule.primaryParentName} (School & Bed) · ${schedule.secondaryParentName} (After-School)`
            : todayDetails.summaryLabel}
        </div>

        <div className="text-xs text-slate-300 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="truncate">
            {todayDetails.isSplitDay
              ? `Handoff at ${todayDetails.afterSchoolHandoff?.endTime || '19:30'} back to ${schedule.primaryParentName}`
              : `Transition time: ${schedule.transitionTime}`}
          </span>
        </div>
      </div>

      {/* Routine Flags / First Choice / Holiday Agreement */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5 space-y-0.5">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">First Choice (ROFR)</div>
          <div className="text-emerald-300 font-medium truncate flex items-center gap-1">
            <Shield className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            <span>
              {schedule.firstChoicePolicy?.enabled !== false
                ? `${schedule.firstChoicePolicy?.triggerHours || 4}h+ / Overnight`
                : 'Disabled'}
            </span>
          </div>
        </div>

        <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5 space-y-0.5">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Holidays</div>
          <div className="text-indigo-300 font-medium truncate flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-400 flex-shrink-0" />
            <span>Working out mutually</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const BentoCustodyExpanded: React.FC = () => {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-xs text-amber-300/80 animate-pulse">
          Loading Custody Calendar &amp; Co-Parent Deck...
        </div>
      }
    >
      <CustodyCalendar />
    </Suspense>
  );
};
