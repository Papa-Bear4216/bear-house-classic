import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeftRight,
  Check,
  X,
  Clock,
  Home,
  Shield,
  AlertCircle,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  CustodySchedule,
  CustodySwapRequest,
  CustodyPattern,
  loadCustodySchedule,
  saveCustodySchedule,
  loadCustodySwaps,
  createCustodySwap,
  respondToCustodySwap,
  getHouseForDate,
  calculateOvernights,
  formatLocalDateKey,
} from '@/lib/custody';
import { KEYS } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { useAppContext } from '@/contexts/AppContext';

export const CustodyCalendar: React.FC = () => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const canCoordinate = currentRole === 'admin' || currentRole === 'superadmin';

  const [schedule, setSchedule] = useState<CustodySchedule>(() => loadCustodySchedule());
  const [swaps, setSwaps] = useState<CustodySwapRequest[]>(() => loadCustodySwaps());
  const [viewDays, setViewDays] = useState<14 | 30>(14);
  const [selectedChildFilter, setSelectedChildFilter] = useState<string>('All');
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapError, setSwapError] = useState<string>('');

  // Schedule modal draft state
  const [draftSchedule, setDraftSchedule] = useState<CustodySchedule | null>(null);
  const [configError, setConfigError] = useState<string>('');

  // New swap form state
  const [swapChild, setSwapChild] = useState('All Children');
  const [swapTargetHouse, setSwapTargetHouse] = useState<'primary' | 'secondary'>('secondary');
  const [swapDate, setSwapDate] = useState('');
  const [swapMakeupDate, setSwapMakeupDate] = useState('');
  const [swapReason, setSwapReason] = useState('');

  // Local date clock (refreshes on timer and focus)
  const [todayStr, setTodayStr] = useState<string>(() => formatLocalDateKey(new Date()));

  useEffect(() => {
    const updateToday = () => setTodayStr(formatLocalDateKey(new Date()));
    const timer = setInterval(updateToday, 60000);
    window.addEventListener('focus', updateToday);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', updateToday);
    };
  }, []);

  // Sync listener
  useEffect(() => {
    return onSyncUpdate((key) => {
      if (key === KEYS.custodySchedule || key === '*') {
        setSchedule(loadCustodySchedule());
      }
      if (key === KEYS.custodySwaps || key === '*') {
        setSwaps(loadCustodySwaps());
      }
    });
  }, []);

  const activeChild = selectedChildFilter === 'All' ? undefined : selectedChildFilter;

  // Compute days to display using local dates
  const calendarDays = useMemo(() => {
    const days: { dateStr: string; dateObj: Date; house: 'primary' | 'secondary' }[] = [];
    const now = new Date();
    for (let i = 0; i < viewDays; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const dateStr = formatLocalDateKey(d);
      const house = getHouseForDate(dateStr, schedule, swaps, activeChild);
      days.push({ dateStr, dateObj: d, house });
    }
    return days;
  }, [schedule, swaps, viewDays, activeChild]);

  const tonightHouse = useMemo(() => {
    return getHouseForDate(todayStr, schedule, swaps, activeChild);
  }, [todayStr, schedule, swaps, activeChild]);

  const metrics = useMemo(() => {
    const endDate = calendarDays[calendarDays.length - 1]?.dateStr || todayStr;
    return calculateOvernights(todayStr, endDate, schedule, swaps, activeChild);
  }, [todayStr, calendarDays, schedule, swaps, activeChild]);

  const pendingSwaps = useMemo(() => {
    return swaps.filter((s) => s.status === 'pending');
  }, [swaps]);

  const resolvedSwaps = useMemo(() => {
    return swaps
      .filter((s) => s.status !== 'pending')
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0))
      .slice(0, 5);
  }, [swaps]);

  const childrenList = useMemo(() => {
    return householdMembers.filter((m) => m.role === 'child').map((m) => m.name);
  }, [householdMembers]);

  const handleDayClick = (dateStr: string) => {
    // Only admins can override, and overrides apply to the global baseline schedule
    if (!canCoordinate || selectedChildFilter !== 'All') return;
    const current = getHouseForDate(dateStr, schedule, swaps);
    const nextHouse: 'primary' | 'secondary' = current === 'primary' ? 'secondary' : 'primary';

    const updatedOverrides = { ...(schedule.overrides || {}) };
    if (updatedOverrides[dateStr]) {
      delete updatedOverrides[dateStr];
    } else {
      updatedOverrides[dateStr] = nextHouse;
    }

    const updatedSchedule: CustodySchedule = {
      ...schedule,
      overrides: updatedOverrides,
    };
    setSchedule(updatedSchedule);
    saveCustodySchedule(updatedSchedule);
  };

  const handleCreateSwap = (e: React.FormEvent) => {
    e.preventDefault();
    setSwapError('');
    if (!swapDate) {
      setSwapError('Please select a date to swap.');
      return;
    }
    if (!currentUser?.id) {
      setSwapError('You must be signed in to request a swap.');
      return;
    }

    const result = createCustodySwap({
      childName: swapChild || 'All Children',
      requesterId: currentUser.id,
      requesterName: currentUser.name || 'Parent',
      requesterRole: currentRole || undefined,
      targetHouse: swapTargetHouse,
      currentDate: swapDate,
      makeupDate: swapMakeupDate || undefined,
      reason: swapReason || undefined,
    });

    if (!result.ok) {
      setSwapError(result.error || 'Failed to submit swap request.');
      return;
    }

    setSwaps(loadCustodySwaps());
    setShowSwapModal(false);
    setSwapDate('');
    setSwapMakeupDate('');
    setSwapReason('');
  };

  const handleRespondSwap = (swapId: string, decision: 'approved' | 'declined' | 'cancelled') => {
    setSwapError('');
    if (!currentUser?.id) return;

    const result = respondToCustodySwap({
      swapId,
      decision,
      responderId: currentUser.id,
      responderName: currentUser.name || 'Co-Parent',
      responderRole: currentRole || undefined,
    });

    if (!result.ok) {
      setSwapError(result.error || 'Failed to respond to swap request.');
      return;
    }

    setSwaps(loadCustodySwaps());
  };

  const openConfigModal = () => {
    setDraftSchedule(JSON.parse(JSON.stringify(schedule)));
    setConfigError('');
  };

  const saveConfig = () => {
    if (!draftSchedule) return;
    if (!draftSchedule.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(draftSchedule.startDate)) {
      setConfigError('Cycle anchor date must be in YYYY-MM-DD format.');
      return;
    }
    if (!draftSchedule.primaryHouseName.trim() || !draftSchedule.secondaryHouseName.trim()) {
      setConfigError('Both house names are required.');
      return;
    }

    const updated: CustodySchedule = {
      ...schedule,
      pattern: draftSchedule.pattern,
      startDate: draftSchedule.startDate,
      primaryHouseName: draftSchedule.primaryHouseName.trim(),
      secondaryHouseName: draftSchedule.secondaryHouseName.trim(),
      primaryParentName: draftSchedule.primaryParentName.trim() || schedule.primaryParentName,
      secondaryParentName: draftSchedule.secondaryParentName.trim() || schedule.secondaryParentName,
      transitionTime: draftSchedule.transitionTime || schedule.transitionTime,
    };

    setSchedule(updated);
    saveCustodySchedule(updated);
    setDraftSchedule(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                Co-Parenting Logistics
              </span>
              <span className="text-xs text-slate-500">Pattern: {schedule.pattern}</span>
            </div>
            <h2 className="text-2xl font-black text-white mt-1">Custody Calendar & Swaps</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              One kid, two houses, one life. Keep transitions predictable and drama-free.
            </p>
          </div>

          {canCoordinate && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => {
                  setShowSwapModal(true);
                  setSwapError('');
                }}
                className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Request Swap
              </button>
              <button
                onClick={openConfigModal}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-2 rounded-xl text-xs border border-slate-700 active:scale-95 transition"
              >
                <Settings className="w-3.5 h-3.5" /> Schedule Settings
              </button>
            </div>
          )}
        </div>

        {/* Child Filter (if multiple children exist) */}
        {childrenList.length > 0 && (
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/80">
            <span className="text-xs text-slate-400 font-medium">Child Schedule:</span>
            <div className="flex gap-1 overflow-x-auto">
              {['All', ...childrenList].map((name) => (
                <button
                  key={name}
                  onClick={() => setSelectedChildFilter(name)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    selectedChildFilter === name
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {name === 'All' ? 'All Children' : name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tonight's Status & Metrics */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${
                tonightHouse === 'primary'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              }`}
            >
              <Home className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Tonight</div>
              <div className="text-sm font-bold text-white">
                {tonightHouse === 'primary' ? schedule.primaryHouseName : schedule.secondaryHouseName}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                Transition: {schedule.transitionTime}
              </div>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Next {viewDays} Days Split
            </div>
            <div className="text-sm font-bold text-white mt-0.5">
              {metrics.primary} overnights ({metrics.primaryPercent}%) · {metrics.secondary} overnights ({metrics.secondaryPercent}%)
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden flex">
              <div
                style={{ width: `${metrics.primaryPercent}%` }}
                className="bg-amber-500 h-full transition-all duration-300"
                title={`${schedule.primaryHouseName}: ${metrics.primaryPercent}%`}
              />
              <div
                style={{ width: `${metrics.secondaryPercent}%` }}
                className="bg-indigo-500 h-full transition-all duration-300"
                title={`${schedule.secondaryHouseName}: ${metrics.secondaryPercent}%`}
              />
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Calendar View</span>
              <div className="flex gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs">
                <button
                  onClick={() => setViewDays(14)}
                  className={`px-2 py-0.5 rounded ${viewDays === 14 ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  14d
                </button>
                <button
                  onClick={() => setViewDays(30)}
                  className={`px-2 py-0.5 rounded ${viewDays === 30 ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'}`}
                >
                  30d
                </button>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" /> {schedule.primaryHouseName}
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500 ml-2" /> {schedule.secondaryHouseName}
            </div>
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {swapError && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between">
          <span>{swapError}</span>
          <button onClick={() => setSwapError('')} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Swaps Section */}
      {pendingSwaps.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Pending Custody Swap Requests ({pendingSwaps.length})</h3>
          </div>
          <div className="space-y-2">
            {pendingSwaps.map((s) => {
              const isRequester =
                currentUser?.id && s.requesterId
                  ? currentUser.id === s.requesterId
                  : currentUser?.name?.trim().toLowerCase() === s.requesterName.trim().toLowerCase();

              const destHouseName =
                s.targetHouse === 'primary' ? schedule.primaryHouseName : schedule.secondaryHouseName;

              return (
                <div
                  key={s.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-semibold text-white">
                      <span className="text-amber-400">{s.requesterName}</span> requested{' '}
                      <span className="text-white font-bold">{s.childName}</span> stay at{' '}
                      <span className="text-emerald-400 font-bold">{destHouseName}</span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      Swap date: <span className="font-semibold text-white">{s.currentDate}</span>
                      {s.makeupDate && (
                        <span> · Makeup return date: <span className="font-semibold text-emerald-400">{s.makeupDate}</span></span>
                      )}
                    </div>
                    {s.reason && <div className="text-xs text-slate-400 italic mt-0.5">"{s.reason}"</div>}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {isRequester ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg font-medium">
                          Waiting for Co-Parent
                        </span>
                        <button
                          onClick={() => handleRespondSwap(s.id, 'cancelled')}
                          className="text-xs text-slate-400 hover:text-rose-400 p-1 rounded transition"
                          title="Cancel request"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : canCoordinate ? (
                      <>
                        <button
                          onClick={() => handleRespondSwap(s.id, 'approved')}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition shadow-md shadow-emerald-600/20 active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => handleRespondSwap(s.id, 'declined')}
                          className="flex items-center gap-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-rose-500/30 transition active:scale-95"
                        >
                          <X className="w-3.5 h-3.5" /> Decline
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>
            {selectedChildFilter === 'All'
              ? canCoordinate
                ? 'Click any day to toggle a one-off override'
                : 'Showing standard schedule'
              : 'Switch to "All Children" to configure manual day overrides'}
          </span>
          <span>Showing next {viewDays} days {activeChild ? `for ${activeChild}` : ''}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
          {calendarDays.map(({ dateStr, dateObj, house }) => {
            const isToday = dateStr === todayStr;
            const isPrimary = house === 'primary';
            const hasOverride = schedule.overrides && schedule.overrides[dateStr];
            const hasSwap = swaps.some(
              (s) =>
                s.status === 'approved' &&
                (s.currentDate === dateStr || s.makeupDate === dateStr) &&
                (!activeChild ? s.childName === 'All Children' : s.childName === 'All Children' || s.childName === activeChild)
            );

            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const canClick = canCoordinate && selectedChildFilter === 'All';

            return (
              <button
                key={dateStr}
                onClick={() => handleDayClick(dateStr)}
                disabled={!canClick}
                className={`relative flex flex-col p-3 rounded-xl border text-left transition-all ${
                  isPrimary
                    ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50'
                    : 'bg-indigo-500/10 border-indigo-500/30 hover:border-indigo-500/50'
                } ${isToday ? 'ring-2 ring-white shadow-lg' : ''} ${!canClick ? 'cursor-default' : 'hover:scale-[1.02]'}`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className={isToday ? 'text-amber-400 font-black' : 'text-slate-400'}>{dayName}</span>
                  <span className={isToday ? 'text-white font-extrabold' : 'text-slate-300'}>{monthDay}</span>
                </div>

                <div className="mt-2.5">
                  <span
                    className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md ${
                      isPrimary
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-indigo-500 text-white'
                    }`}
                  >
                    {isPrimary ? schedule.primaryHouseName : schedule.secondaryHouseName}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-1">
                  {hasOverride && (
                    <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                      Override
                    </span>
                  )}
                  {hasSwap && (
                    <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      Swap
                    </span>
                  )}
                  {isToday && (
                    <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.2 rounded bg-white/20 text-white font-bold">
                      Today
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolved Swaps / Audit Trail */}
      {resolvedSwaps.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-2">Recent Swap History</div>
          <div className="space-y-1.5">
            {resolvedSwaps.map((s) => (
              <div key={s.id} className="text-xs text-slate-400 flex items-center justify-between py-1 border-b border-slate-800/60 last:border-0">
                <div>
                  <span className="font-semibold text-slate-200">{s.childName}:</span> {s.currentDate}{' '}
                  {s.makeupDate ? `(makeup: ${s.makeupDate})` : ''} — requested by {s.requesterName}
                  {s.responderName ? ` · resolved by ${s.responderName}` : ''}
                </div>
                <span
                  className={`capitalize font-bold text-[10px] px-2 py-0.5 rounded ${
                    s.status === 'approved'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : s.status === 'cancelled'
                      ? 'bg-slate-700 text-slate-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legal & Compliance Disclaimer */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-500">
        <Shield className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-400">Notice & Disclaimer:</span> Hot Mess Express is a family
          coordination tool. Custody schedules and swap arrangements made here are for day-to-day parent communication
          only and do not alter or supersede court-ordered custody agreements or decrees.
        </div>
      </div>

      {/* Request Swap Modal */}
      {showSwapModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-amber-400" />
                Request Day Swap
              </h3>
              <button
                onClick={() => setShowSwapModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSwap} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Child</label>
                <select
                  value={swapChild}
                  onChange={(e) => setSwapChild(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                >
                  <option value="All Children">All Children</option>
                  {childrenList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Child Stays At</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSwapTargetHouse('primary')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      swapTargetHouse === 'primary'
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-md'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {schedule.primaryHouseName}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwapTargetHouse('secondary')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      swapTargetHouse === 'secondary'
                        ? 'bg-indigo-500 text-white border-indigo-500 shadow-md'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {schedule.secondaryHouseName}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Date to Swap (YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={swapDate}
                  onChange={(e) => setSwapDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Makeup Date (Optional Return Day)</label>
                <input
                  type="date"
                  value={swapMakeupDate}
                  onChange={(e) => setSwapMakeupDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Reason / Note</label>
                <input
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                  placeholder="e.g. Work travel, school play, family visit"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowSwapModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-amber-500/20 active:scale-95"
                >
                  Send Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Configuration Modal (isolated draft) */}
      {draftSchedule && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                Custody Schedule Settings
              </h3>
              <button
                onClick={() => setDraftSchedule(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {configError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-2.5 rounded-lg text-xs">
                {configError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Schedule Pattern</label>
                <select
                  value={draftSchedule.pattern}
                  onChange={(e) =>
                    setDraftSchedule({ ...draftSchedule, pattern: e.target.value as CustodyPattern })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                >
                  <option value="2-2-3">2-2-3 Rotating (14-day cycle)</option>
                  <option value="alternating_weeks">Alternating Weeks (7 days each)</option>
                  <option value="2-2-5-5">2-2-5-5 Schedule (14-day cycle)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Cycle Anchor Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  value={draftSchedule.startDate}
                  onChange={(e) => setDraftSchedule({ ...draftSchedule, startDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">Primary House Name</label>
                  <input
                    value={draftSchedule.primaryHouseName}
                    onChange={(e) => setDraftSchedule({ ...draftSchedule, primaryHouseName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">Secondary House Name</label>
                  <input
                    value={draftSchedule.secondaryHouseName}
                    onChange={(e) => setDraftSchedule({ ...draftSchedule, secondaryHouseName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">Primary Parent</label>
                  <input
                    value={draftSchedule.primaryParentName}
                    onChange={(e) => setDraftSchedule({ ...draftSchedule, primaryParentName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">Secondary Parent</label>
                  <input
                    value={draftSchedule.secondaryParentName}
                    onChange={(e) => setDraftSchedule({ ...draftSchedule, secondaryParentName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium block mb-1">Handoff Transition Time</label>
                <input
                  type="time"
                  value={draftSchedule.transitionTime}
                  onChange={(e) => setDraftSchedule({ ...draftSchedule, transitionTime: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setDraftSchedule(null)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveConfig}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-amber-500/20 active:scale-95"
                >
                  Save Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustodyCalendar;
