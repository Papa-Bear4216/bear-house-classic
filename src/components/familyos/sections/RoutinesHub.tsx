import React, { useState, useEffect, useMemo } from 'react';
import {
  Sun,
  Moon,
  Sparkles,
  Clock,
  Flame,
  CheckCircle2,
  Circle,
  Play,
  Plus,
  Trash2,
  Home,
  Lightbulb,
  Zap,
  RotateCcw,
  Trophy,
  ChevronRight,
  Check,
  Award,
} from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import {
  loadRoutines,
  loadRoutineRuns,
  startRoutineRun,
  toggleRoutineStep,
  finishRoutineRun,
  createRoutine,
  deleteRoutine,
  type Routine,
  type RoutineStep,
  type RoutineRun,
} from '@/lib/routines';
import { getMemberStreak, type MemberStreak } from '@/lib/streaks';
import { KEYS, canDelete } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { triggerConfetti } from '@/lib/confetti';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const COLOR_DOT: Record<string, string> = {
  indigo: 'bg-indigo-400',
  pink: 'bg-pink-400',
  purple: 'bg-purple-400',
  blue: 'bg-blue-400',
  orange: 'bg-orange-400',
  rose: 'bg-rose-400',
  emerald: 'bg-emerald-400',
  slate: 'bg-slate-400',
};

export const RoutinesHub: React.FC = () => {
  const { householdMembers, currentUser, currentRole } = useAppContext();
  const isAdm = currentRole && canDelete(currentRole);

  const [routines, setRoutines] = useState<Routine[]>(() => loadRoutines());
  const [runs, setRuns] = useState<RoutineRun[]>(() => loadRoutineRuns());
  
  // Member selector state (defaults to current user or first child/member)
  const defaultMember = useMemo(() => {
    if (currentUser) return currentUser;
    const firstChild = householdMembers.find((m) => m.role === 'child');
    return firstChild || householdMembers[0] || { id: 'unknown', name: 'Family Member', color: 'indigo', role: 'child' };
  }, [currentUser, householdMembers]);

  const [selectedMemberId, setSelectedMemberId] = useState<string>(defaultMember.id);
  const selectedMemberIdRef = React.useRef(selectedMemberId);
  useEffect(() => {
    selectedMemberIdRef.current = selectedMemberId;
  }, [selectedMemberId]);

  // Sync state on external updates (routines, runs, streaks, points)
  useEffect(() => {
    return onSyncUpdate((key) => {
      if (key === KEYS.routines || key === '*') {
        setRoutines(loadRoutines());
      }
      if (key === KEYS.routineRuns || key === '*') {
        setRuns(loadRoutineRuns());
      }
      if (key === KEYS.memberStreaks || key === '*') {
        setRuns([...loadRoutineRuns()]);
      }
    });
  }, []);

  // Dynamic local date that refreshes across midnight and on focus
  const [todayStr, setTodayStr] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  useEffect(() => {
    const checkDate = () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const cur = `${y}-${m}-${d}`;
      setTodayStr((prev) => (prev !== cur ? cur : prev));
    };
    window.addEventListener('focus', checkDate);
    const interval = setInterval(checkDate, 60000);
    return () => {
      window.removeEventListener('focus', checkDate);
      clearInterval(interval);
    };
  }, []);

  const selectedMember = useMemo(() => {
    return (
      householdMembers.find((m) => m.id === selectedMemberId) ||
      defaultMember
    );
  }, [householdMembers, selectedMemberId, defaultMember]);

  const memberStreak: MemberStreak = useMemo(() => {
    return getMemberStreak(selectedMember.id, selectedMember.name);
  }, [selectedMember, runs]);

  // Active routine runner state
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Dialog for creating custom routine
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<Routine['type']>('custom');
  const [newXp, setNewXp] = useState(25);
  const [newHaEntity, setNewHaEntity] = useState('');
  const [newSteps, setNewSteps] = useState<{ title: string; durationMinutes: number }[]>([
    { title: 'Step 1', durationMinutes: 5 },
  ]);

  // Filter routines by non-deleted and member targeting
  const activeRoutines = useMemo(() => {
    return routines
      .filter((r) => !r.deletedAt)
      .filter(
        (r) =>
          r.targetMemberIds.length === 0 ||
          r.targetMemberIds.includes(selectedMember.id)
      );
  }, [routines, selectedMember.id]);

  // Today's runs for selected member
  const memberRunsToday = useMemo(() => {
    return runs.filter(
      (r) => r.memberId === selectedMember.id && r.date === todayStr
    );
  }, [runs, selectedMember.id, todayStr]);

  // Get active run object
  const activeRun = useMemo(() => {
    if (!activeRunId) return null;
    return runs.find((r) => r.id === activeRunId) || null;
  }, [runs, activeRunId]);

  const activeRoutine = useMemo(() => {
    if (!activeRun) return null;
    return routines.find((r) => r.id === activeRun.routineId) || null;
  }, [activeRun, routines]);

  // Handle start or resume a routine
  const handleStartRoutine = async (routineId: string) => {
    const targetMemberId = selectedMember.id;
    try {
      const result = await startRoutineRun(routineId, {
        id: selectedMember.id,
        name: selectedMember.name,
      });

      // Avoid race if user switched members during async start
      if (selectedMemberIdRef.current !== targetMemberId) return;

      setActiveRunId(result.run.id);
      setRuns(loadRoutineRuns());

      const r = routines.find((rt) => rt.id === routineId);
      if (!result.isResume && result.haResult?.ok) {
        toast({
          title: `Smart Home Scene Triggered 🏠`,
          description: `Activated ${r?.haTriggerEntityId || 'scene'} for ${r?.title}.`,
        });
      } else if (!result.isResume && result.haResult && !result.haResult.ok) {
        toast({
          title: 'Smart Home Warning',
          description: result.haResult.error || 'Could not trigger Home Assistant.',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Could not start routine',
        description: e.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle toggling a step
  const handleToggleStep = async (stepId: string) => {
    if (!activeRunId) return;
    const updated = await toggleRoutineStep(activeRunId, stepId);
    if (updated) {
      setRuns(loadRoutineRuns());
    }
  };

  // Handle finish routine
  const handleFinishRoutine = () => {
    if (!activeRunId) return;
    const res = finishRoutineRun(activeRunId);
    if (res.ok) {
      triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.35, 75);
      const runnerName = activeRun?.memberName || selectedMember.name;
      if (res.alreadyClaimedToday) {
        toast({
          title: `🎉 Routine Completed (Replay)!`,
          description: `Great job, ${runnerName}! Daily XP was already claimed earlier today.`,
        });
      } else {
        toast({
          title: `🎉 Routine Completed! +${res.pointsAwarded} XP`,
          description: `Great job, ${runnerName}! Streak extended to ${memberStreak.currentStreak + (memberStreak.activeToday ? 0 : 1)} days! 🔥`,
        });
      }
      setRuns(loadRoutineRuns());
      setActiveRunId(null);
    } else {
      toast({
        title: 'Cannot finish routine',
        description: res.error,
        variant: 'destructive',
      });
    }
  };

  // Add step to create dialog
  const handleAddStepField = () => {
    setNewSteps([...newSteps, { title: '', durationMinutes: 5 }]);
  };

  const handleCreateRoutine = () => {
    if (!newTitle.trim()) {
      toast({ title: 'Please enter a routine title', variant: 'destructive' });
      return;
    }
    const validSteps: RoutineStep[] = newSteps
      .filter((s) => s.title.trim().length > 0)
      .map((s, idx) => ({
        id: `step-${idx}-${Date.now()}`,
        title: s.title.trim(),
        durationMinutes: s.durationMinutes || 5,
      }));

    if (validSteps.length === 0) {
      toast({ title: 'Please add at least one step', variant: 'destructive' });
      return;
    }

    createRoutine({
      title: newTitle.trim(),
      type: newType,
      targetMemberIds: [],
      completionPoints: Number(newXp) || 25,
      haTriggerEntityId: newHaEntity.trim() || undefined,
      steps: validSteps,
    });

    setRoutines(loadRoutines());
    setShowCreateDialog(false);
    setNewTitle('');
    setNewHaEntity('');
    setNewSteps([{ title: 'Step 1', durationMinutes: 5 }]);
    toast({ title: 'Routine created!' });
  };

  const handleDeleteRoutine = (id: string, title: string) => {
    if (confirm(`Delete routine "${title}"?`)) {
      deleteRoutine(id);
      setRoutines(loadRoutines());
      if (activeRun?.routineId === id) {
        setActiveRunId(null);
      }
      toast({ title: 'Routine deleted' });
    }
  };

  const getRoutineIcon = (type: Routine['type']) => {
    switch (type) {
      case 'bedtime':
        return <Moon className="w-5 h-5 text-indigo-400" />;
      case 'morning':
      case 'school_prep':
        return <Sun className="w-5 h-5 text-amber-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-emerald-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Member Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5" /> Daily Rhythm & Routines
            </span>
          </div>
          <h2 className="text-2xl font-black text-white mt-1">Shared Daily Routines</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Morning school-prep, bedtime wind-downs, Home Assistant triggers, and squad XP.
          </p>
        </div>

        {/* Member Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {householdMembers
            .filter((m) => m.role !== 'pet')
            .map((m) => {
              const isSelected = m.id === selectedMember.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedMemberId(m.id);
                    setActiveRunId(null);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-md shadow-amber-500/10'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      COLOR_DOT[m.color] || 'bg-slate-400'
                    }`}
                  />
                  <span>{m.name}</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Selected Member Streak Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-slate-900/70 to-slate-950/90 border border-amber-500/20 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <span>{selectedMember.name}’s Streak Status</span>
              {memberStreak.activeToday ? (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-md">
                  Active Today 🔥
                </span>
              ) : memberStreak.currentStreak > 0 ? (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded-md">
                  At Risk Today ⚠️
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded-md">
                  Ready to Start 🚀
                </span>
              )}
            </div>
            <div className="text-lg font-black text-white">
              {memberStreak.currentStreak} Day{memberStreak.currentStreak === 1 ? '' : 's'}{' '}
              <span className="text-xs font-normal text-slate-400">
                (Best: {memberStreak.longestStreak}d)
              </span>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400 text-right">
          Finish today’s routine to keep the family streak ablaze!
        </div>
      </div>

      {/* Active Routine Runner (if running) */}
      {activeRun && activeRoutine && (
        <div className="bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border-2 border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
            <Sun className="w-48 h-48 text-amber-400" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-extrabold tracking-wider text-amber-400 bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                  <Play className="w-3 h-3 fill-current" /> Active Routine
                </span>
                {activeRoutine.haTriggerEntityId && (
                  <span className="text-xs text-sky-300 bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Home className="w-3 h-3" /> {activeRoutine.haTriggerEntityId}
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-black text-white mt-1">
                {activeRoutine.title}
              </h3>
              <p className="text-xs text-slate-400">
                Runner:{' '}
                <span className="text-amber-300 font-bold">
                  {activeRun.memberName}
                </span>{' '}
                • Earn{' '}
                <span className="text-amber-400 font-bold">
                  +{activeRoutine.completionPoints} XP
                </span>{' '}
                upon completion
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveRunId(null)}
              className="text-xs border-slate-700 hover:bg-slate-800"
            >
              Minimize Runner
            </Button>
          </div>

          {/* Progress bar */}
          <div>
            {(() => {
              const totalSteps = activeRoutine.steps.length;
              const completedCount = activeRun.completedStepIds.length;
              const pct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
              return (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-300">
                      Step Progress: {completedCount} of {totalSteps} done
                    </span>
                    <span className="font-mono font-bold text-amber-400">{pct}%</span>
                  </div>
                  <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Step List */}
          <div className="space-y-3">
            {activeRoutine.steps.map((step, idx) => {
              const isDone = activeRun.completedStepIds.includes(step.id);
              return (
                <div
                  key={step.id}
                  onClick={() => handleToggleStep(step.id)}
                  className={`flex items-start justify-between gap-3.5 p-4 rounded-2xl border transition-all cursor-pointer ${
                    isDone
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-slate-300'
                      : 'bg-white/[0.03] border-white/10 hover:border-amber-500/30 text-white'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1">
                    <button
                      type="button"
                      className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                        isDone
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-sm'
                          : 'border-slate-600 bg-slate-800/80 hover:border-amber-400'
                      }`}
                    >
                      {isDone ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : (
                        <span className="text-[11px] font-bold text-slate-400">
                          {idx + 1}
                        </span>
                      )}
                    </button>
                    <div>
                      <div
                        className={`text-sm font-bold ${
                          isDone ? 'line-through text-slate-400' : 'text-white'
                        }`}
                      >
                        {step.title}
                      </div>
                      {step.description && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {step.description}
                        </p>
                      )}
                      {step.haEntityId && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md mt-1.5">
                          <Lightbulb className="w-3 h-3" /> Smart Home:{' '}
                          {step.haEntityId} ({step.haAction || 'turn_on'})
                        </span>
                      )}
                    </div>
                  </div>

                  {step.durationMinutes && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 bg-white/5 border border-white/5 px-2.5 py-1 rounded-lg shrink-0">
                      <Clock className="w-3 h-3" />
                      <span>{step.durationMinutes}m</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveRunId(null)}
              className="text-xs border-slate-700"
            >
              Save & Exit
            </Button>

            <Button
              onClick={handleFinishRoutine}
              disabled={
                activeRoutine.steps.length === 0 ||
                activeRun.completedStepIds.length < activeRoutine.steps.length
              }
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold px-6 shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.02]"
            >
              <Trophy className="w-4 h-4 mr-2" />
              Finish Routine & Claim +{activeRoutine.completionPoints} XP
            </Button>
          </div>
        </div>
      )}

      {/* Routine Cards Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>Household Routines</span>
            <span className="text-xs text-slate-400 font-normal">
              ({activeRoutines.length} active)
            </span>
          </h3>

          {isAdm && (
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              className="bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/20 text-xs font-bold gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Create Routine
            </Button>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeRoutines.map((routine) => {
            const todayRun = memberRunsToday.find((r) => r.routineId === routine.id);
            const isCompletedToday = !!todayRun?.completedAt;
            const isInProgress = todayRun && !todayRun.completedAt;
            const totalDuration = routine.steps.reduce(
              (acc, s) => acc + (s.durationMinutes || 0),
              0
            );

            return (
              <div
                key={routine.id}
                className={`bg-gradient-to-br from-slate-900/80 to-slate-950/90 border rounded-3xl p-5 flex flex-col justify-between shadow-xl transition-all ${
                  isCompletedToday
                    ? 'border-emerald-500/30'
                    : isInProgress
                    ? 'border-amber-500/40 shadow-amber-500/5'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      {getRoutineIcon(routine.type)}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        +{routine.completionPoints} XP
                      </span>
                      {isAdm && (
                        <button
                          onClick={() => handleDeleteRoutine(routine.id, routine.title)}
                          className="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition"
                          title="Delete routine"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <h4 className="text-base font-bold text-white mb-1">
                    {routine.title}
                  </h4>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-4">
                    <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-md">
                      <Clock className="w-3 h-3" /> ~{totalDuration} min
                    </span>
                    <span className="bg-white/5 px-2 py-0.5 rounded-md">
                      {routine.steps.length} steps
                    </span>
                    {routine.haTriggerEntityId && (
                      <span className="text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Home className="w-3 h-3" /> HA Scene
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 mb-5">
                    {routine.steps.slice(0, 3).map((s, idx) => (
                      <div
                        key={s.id}
                        className="text-xs text-slate-300 flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                        <span className="truncate">{s.title}</span>
                      </div>
                    ))}
                    {routine.steps.length > 3 && (
                      <div className="text-[11px] text-slate-500 pl-3.5">
                        +{routine.steps.length - 3} more steps...
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  {isCompletedToday ? (
                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2 text-xs text-emerald-400 font-bold">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Completed Today
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStartRoutine(routine.id)}
                        className="text-[11px] h-6 px-2 text-emerald-300 hover:text-white"
                      >
                        Run Again
                      </Button>
                    </div>
                  ) : isInProgress ? (
                    <Button
                      onClick={() => handleStartRoutine(routine.id)}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-2"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Resume Routine ({todayRun?.completedStepIds.length || 0}/
                      {routine.steps.length})
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleStartRoutine(routine.id)}
                      className="w-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-2 border border-white/10"
                    >
                      <Play className="w-3.5 h-3.5 fill-current text-amber-400" />
                      Start Routine
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Custom Routine Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Create Custom Routine</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-slate-300">Routine Title</Label>
              <Input
                placeholder="e.g. After-School Backpack Dump"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-300">Category</Label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-md px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  <option value="school_prep">School Prep</option>
                  <option value="morning">Morning</option>
                  <option value="bedtime">Bedtime</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <Label className="text-xs text-slate-300">Reward XP</Label>
                <Input
                  type="number"
                  value={newXp}
                  onChange={(e) => setNewXp(parseInt(e.target.value) || 25)}
                  className="bg-slate-950 border-slate-800 text-white mt-1 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-300">
                Home Assistant Scene / Light (Optional)
              </Label>
              <Input
                placeholder="e.g. scene.bedtime_wind_down or light.kitchen"
                value={newHaEntity}
                onChange={(e) => setNewHaEntity(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white mt-1 text-sm font-mono"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-300">Routine Steps</Label>
                <button
                  type="button"
                  onClick={handleAddStepField}
                  className="text-xs text-amber-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Step
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {newSteps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder={`Step ${idx + 1}`}
                      value={step.title}
                      onChange={(e) => {
                        const updated = [...newSteps];
                        updated[idx].title = e.target.value;
                        setNewSteps(updated);
                      }}
                      className="bg-slate-950 border-slate-800 text-white text-xs h-8 flex-1"
                    />
                    <Input
                      type="number"
                      placeholder="min"
                      value={step.durationMinutes}
                      onChange={(e) => {
                        const updated = [...newSteps];
                        updated[idx].durationMinutes = parseInt(e.target.value) || 5;
                        setNewSteps(updated);
                      }}
                      className="bg-slate-950 border-slate-800 text-white text-xs h-8 w-16 font-mono text-center"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="text-xs border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateRoutine}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
            >
              Create Routine
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RoutinesHub;
