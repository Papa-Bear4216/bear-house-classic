import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CheckCircle2, SkipForward, X, PartyPopper, Circle, Sparkles, Timer, Flame } from 'lucide-react';
import { buildFocusQueue, type FocusQueueTask } from '@/lib/focusQueue';
import { getTimerState } from '@/lib/taskTimer';
import { triggerConfetti } from '@/lib/confetti';

export interface FocusModeTask extends FocusQueueTask {
  text: string;
  steps?: string[];
  stepsCompleted?: boolean[];
  estimatedMinutes?: number;
}

interface FocusModeProps {
  tasks: FocusModeTask[];
  onComplete: (id: string) => void;
  onToggleStep: (taskId: string, stepIndex: number) => void;
  onExit: () => void;
}

const FocusMode: React.FC<FocusModeProps> = ({ tasks, onComplete, onToggleStep, onExit }) => {
  const [queue, setQueue] = useState<FocusModeTask[]>(() => buildFocusQueue(tasks));
  const [justFinished, setJustFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const total = useMemo(() => queue.length, []); // fixed at mount for a stable "X of N" denominator
  const current = queue[0];

  const currentIdRef = useRef<string | undefined>(current?.id);
  useEffect(() => {
    if (current?.id !== currentIdRef.current) {
      currentIdRef.current = current?.id;
      setElapsedSeconds(0);
    }
  }, [current?.id]);

  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const timerState = current?.estimatedMinutes
    ? getTimerState(current.estimatedMinutes, elapsedSeconds)
    : null;

  const advance = () => {
    setQueue((q) => {
      const next = q.slice(1);
      if (next.length === 0) {
        setJustFinished(true);
        triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.4, 80);
        setTimeout(onExit, 2200);
      }
      return next;
    });
  };

  const handleComplete = () => {
    if (!current) return;
    triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.35, 50);
    onComplete(current.id);
    advance();
  };

  const handleSkip = () => {
    if (!current) return;
    setQueue((q) => [...q.slice(1), q[0]]);
  };

  const handleToggleStep = (stepIndex: number) => {
    if (!current) return;
    onToggleStep(current.id, stepIndex);

    const updatedCompleted = (current.stepsCompleted ?? []).map((done, i) => (i === stepIndex ? !done : done));
    const allDone = updatedCompleted.length > 0 && updatedCompleted.every(Boolean);
    if (allDone) {
      handleComplete();
    } else {
      setQueue((q) => q.map((t, i) => (i === 0 ? { ...t, stepsCompleted: updatedCompleted } : t)));
    }
  };

  if (justFinished || !current) {
    return (
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-emerald-500/40 rounded-3xl p-10 text-center shadow-2xl relative overflow-hidden">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 mx-auto flex items-center justify-center text-emerald-400 mb-4 animate-bounce">
          <PartyPopper className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-bold text-white font-display">Queue Conquered! 🔥</h3>
        <p className="text-sm text-slate-300 mt-2 max-w-sm mx-auto">
          Massive dopamine win. Every task in this sprint is done. Take a well-earned break!
        </p>
      </div>
    );
  }

  const ringColor = timerState
    ? { green: '#34D399', yellow: '#FBBF24', red: '#F43F5E' }[timerState.zone]
    : '#F59E0B';
  const ringPct = timerState
    ? Math.max(0, Math.min(1, timerState.remainingSeconds / (current.estimatedMinutes! * 60)))
    : 0;
  const displaySeconds = timerState ? Math.abs(timerState.remainingSeconds) : 0;
  const displayLabel = timerState
    ? `${timerState.overtime ? '+' : ''}${Math.floor(displaySeconds / 60)}:${String(displaySeconds % 60).padStart(2, '0')}`
    : null;

  return (
    <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
      {/* Top ambient glow */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-300">
            <Flame className="w-3.5 h-3.5 fill-current" /> Focus Sprint: {total - queue.length + 1} of {total}
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline">· 1 task at a time</span>
        </div>
        <button
          onClick={onExit}
          className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
          title="Exit focus mode"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Timer Circle */}
      {timerState && (
        <div className="flex justify-center relative z-10">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 -rotate-90">
              <circle cx="48" cy="48" r="40" stroke="rgba(255,255,255,0.08)" strokeWidth="7" fill="none" />
              <circle
                cx="48" cy="48" r="40" strokeWidth="7" fill="none" strokeLinecap="round"
                stroke={ringColor}
                strokeDasharray={`${ringPct * 251.3} 251.3`}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <span className="font-mono font-bold text-base tabular-nums leading-none">{displayLabel}</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                {timerState.overtime ? 'Overtime' : 'Remaining'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Task description */}
      <div className="relative z-10 text-center py-2 px-2">
        <p className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
          {current.text}
        </p>
      </div>

      {/* Steps checklist if present */}
      {current.steps && current.steps.length > 0 && (
        <div className="space-y-2 relative z-10 max-w-lg mx-auto">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Check off steps as you go:
          </div>
          {current.steps.map((step, i) => {
            const done = current.stepsCompleted?.[i] ?? false;
            return (
              <button
                key={i}
                onClick={() => handleToggleStep(i)}
                className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl border transition-all ${
                  done
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200 line-through opacity-80'
                    : 'bg-white/[0.04] border-white/10 text-slate-200 hover:bg-white/[0.08] hover:border-white/20'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-500 flex-shrink-0" />
                )}
                <span className="text-sm font-medium">{step}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3 relative z-10 max-w-md mx-auto">
        <button
          onClick={handleComplete}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 rounded-2xl py-4 flex items-center justify-center gap-2.5 text-lg font-bold shadow-xl shadow-emerald-500/25 transition active:scale-[0.98]"
        >
          <CheckCircle2 className="w-6 h-6 stroke-[2.5]" /> Done (Give me dopamine!)
        </button>
        <button
          onClick={handleSkip}
          className="w-full text-slate-400 hover:text-white text-sm py-2 flex items-center justify-center gap-1.5 transition"
        >
          <SkipForward className="w-4 h-4" /> Skip this task for now
        </button>
      </div>
    </div>
  );
};

export default FocusMode;
