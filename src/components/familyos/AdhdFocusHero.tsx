import React, { useState, useMemo } from 'react';
import { Sparkles, Zap, CheckCircle2, Shuffle, ArrowRight, Flame, Trophy, Play, Check } from 'lucide-react';
import { triggerConfetti } from '@/lib/confetti';
import { toast } from 'sonner';

interface Task {
  id: string;
  text: string;
  priority: string;
  category?: string;
  person?: string;
  room?: string;
  estimatedMinutes?: number;
  completed: boolean;
  dueDate?: number | null;
  dueEstimate?: string;
}

interface AdhdFocusHeroProps {
  tasks: Task[];
  onComplete: (id: string) => void;
  onLaunchFocusMode: () => void;
  todayCompletedCount: number;
  todayTotalCount: number;
}

export const AdhdFocusHero: React.FC<AdhdFocusHeroProps> = ({
  tasks,
  onComplete,
  onLaunchFocusMode,
  todayCompletedCount,
  todayTotalCount,
}) => {
  // Open tasks prioritized: High priority first, then estimated minutes ascending (easiest wins first for ADHD momentum!)
  const openTasks = useMemo(() => {
    return tasks
      .filter((t) => !t.completed)
      .sort((a, b) => {
        // High priority first
        if (a.priority === 'High' && b.priority !== 'High') return -1;
        if (b.priority === 'High' && a.priority !== 'High') return 1;
        // Then shortest time first (ADHD quick wins)
        const aMin = a.estimatedMinutes || 15;
        const bMin = b.estimatedMinutes || 15;
        return aMin - bMin;
      });
  }, [tasks]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Keep index within bounds if openTasks shrinks
  const safeIndex = openTasks.length > 0 ? currentIndex % openTasks.length : 0;
  const currentTask = openTasks[safeIndex];

  const handleShuffle = () => {
    if (openTasks.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % openTasks.length);
      toast.info('Switched task! Friction removed. Take whatever feels doable.', { duration: 2500 });
    }
  };

  const handleQuickComplete = () => {
    if (!currentTask) return;
    triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.35, 75);
    onComplete(currentTask.id);
    toast.success('BOOM! 💥 Task crushed. Dopamine unlocked!', {
      description: `"${currentTask.text}" is done. Executive dysfunction: 0, You: 1.`,
      duration: 3500,
    });
  };

  const completionPct = todayTotalCount > 0 ? Math.round((todayCompletedCount / todayTotalCount) * 100) : 100;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950/90 p-5 sm:p-6 backdrop-blur-xl shadow-2xl">
      {/* Decorative ambient background glows */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

      {/* Top row: Chaos Tamed meter & Streak */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-white/10 pb-4 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Flame className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <span>Hot Mess Express</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div className="text-sm font-semibold text-white">
              {completionPct >= 100 ? '🎉 Household Chaos 100% Tamed!' : `${completionPct}% Chaos Tamed Today`}
            </div>
          </div>
        </div>

        {/* Progress bar pill */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex-1 sm:w-44 h-3 bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-400 transition-all duration-700 ease-out"
              style={{ width: `${Math.min(100, Math.max(8, completionPct))}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold text-amber-300 min-w-[3rem] text-right">
            {todayCompletedCount}/{todayTotalCount}
          </span>
        </div>
      </div>

      {/* Main Focus Card */}
      {currentTask ? (
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/40">
                <Zap className="w-3.5 h-3.5 fill-current" /> ONE THING RIGHT NOW
              </span>
              {openTasks.length > 1 && (
                <span className="text-xs text-slate-400 font-mono">
                  ({safeIndex + 1} of {openTasks.length})
                </span>
              )}
            </div>

            {openTasks.length > 1 && (
              <button
                onClick={handleShuffle}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-xl border border-white/10 transition"
                title="Stuck? Switch to another task"
              >
                <Shuffle className="w-3 h-3" />
                <span>Give me another</span>
              </button>
            )}
          </div>

          {/* Big task title */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 sm:p-5 hover:border-amber-500/30 transition-all group">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md border ${
                  currentTask.priority === 'High'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}
              >
                {currentTask.priority || 'Normal'}
              </span>
              {currentTask.estimatedMinutes && (
                <span className="text-[11px] text-slate-300 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                  ⏱️ ~{currentTask.estimatedMinutes} min
                </span>
              )}
              {currentTask.room && (
                <span className="text-[11px] text-slate-300 bg-white/5 px-2 py-0.5 rounded-md border border-white/10">
                  📍 {currentTask.room}
                </span>
              )}
              {currentTask.person && (
                <span className="text-[11px] text-amber-200/80 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  👤 {currentTask.person}
                </span>
              )}
            </div>

            <p className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-snug">
              {currentTask.text}
            </p>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleQuickComplete}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition active:scale-[0.98]"
            >
              <Check className="w-5 h-5 stroke-[3]" />
              <span>Mark Done (Dopamine!)</span>
            </button>

            <button
              onClick={onLaunchFocusMode}
              className="w-full py-3.5 px-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition active:scale-[0.98] hover:border-amber-400/40"
            >
              <Play className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>Start Focus Mode Timer</span>
            </button>
          </div>
        </div>
      ) : (
        /* All caught up celebration state */
        <div className="relative z-10 py-6 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 mx-auto flex items-center justify-center text-emerald-400">
            <Trophy className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-bold text-white font-display">Zero Overwhelm. You Crushed It!</h3>
          <p className="text-sm text-slate-300 max-w-md mx-auto">
            All priority tasks for today are clear. Your executive function did its job. Time to recharge guilt-free.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdhdFocusHero;
