import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CheckCircle2, SkipForward, X, PartyPopper, Circle } from 'lucide-react';
import { buildFocusQueue, type FocusQueueTask } from '@/lib/focusQueue';
import { getTimerState } from '@/lib/taskTimer';

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
  // Sorted once on mount — a point-in-time snapshot, not live-synced to the
  // parent's task list while focus mode is open (see plan's Global Constraints).
  const [queue, setQueue] = useState<FocusModeTask[]>(() => buildFocusQueue(tasks));
  const [justFinished, setJustFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const total = useMemo(() => queue.length, []); // fixed at mount for a stable "X of N" denominator
  const current = queue[0];

  // Restart the countdown whenever the current task changes (new task id at
  // the front of the queue) — one interval for the component's lifetime,
  // reset via a ref comparison rather than tearing down/rebuilding the timer.
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
        setTimeout(onExit, 1500);
      }
      return next;
    });
  };

  const handleComplete = () => {
    if (!current) return;
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
      // Reflect the toggle in the local queue snapshot immediately (onToggleStep
      // updates the parent's real state asynchronously via setTasks) so the
      // checklist doesn't visually lag a render behind the click.
      setQueue((q) => q.map((t, i) => (i === 0 ? { ...t, stepsCompleted: updatedCompleted } : t)));
    }
  };

  if (justFinished || !current) {
    return (
      <div className="bg-slate-800 border border-emerald-500/30 rounded-2xl p-10 text-center">
        <PartyPopper className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
        <p className="text-xl font-bold text-white">All done!</p>
        <p className="text-sm text-slate-400 mt-1">Nice work clearing the queue.</p>
      </div>
    );
  }

  const ringColor = timerState
    ? { green: 'rgb(52,211,153)', yellow: 'rgb(251,191,36)', red: 'rgb(244,63,94)' }[timerState.zone]
    : null;
  const ringPct = timerState
    ? Math.max(0, Math.min(1, timerState.remainingSeconds / (current.estimatedMinutes! * 60)))
    : 0;
  const displaySeconds = timerState ? Math.abs(timerState.remainingSeconds) : 0;
  const displayLabel = timerState
    ? `${timerState.overtime ? '+' : ''}${Math.floor(displaySeconds / 60)}:${String(displaySeconds % 60).padStart(2, '0')}`
    : null;

  return (
    <div className="bg-slate-800 border border-orange-500/30 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-orange-300 font-medium">
          Task {total - queue.length + 1} of {total}
        </span>
        <button onClick={onExit} className="text-slate-400 hover:text-white p-1" title="Exit focus mode">
          <X className="w-4 h-4" />
        </button>
      </div>

      {timerState && (
        <div className="flex justify-center">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90">
              <circle cx="40" cy="40" r="34" stroke="rgb(51,65,85)" strokeWidth="6" fill="none" />
              <circle
                cx="40" cy="40" r="34" strokeWidth="6" fill="none" strokeLinecap="round"
                stroke={ringColor!}
                strokeDasharray={`${ringPct * 213.6} 213.6`}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm tabular-nums">
              {displayLabel}
            </div>
          </div>
        </div>
      )}

      <p className="text-2xl font-bold text-white text-center py-4">{current.text}</p>

      {current.steps && current.steps.length > 0 && (
        <div className="space-y-2">
          {current.steps.map((step, i) => {
            const done = current.stepsCompleted?.[i] ?? false;
            return (
              <button
                key={i}
                onClick={() => handleToggleStep(i)}
                className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-lg border transition ${
                  done ? 'bg-emerald-900/30 border-emerald-600/40 text-emerald-200' : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-600'
                }`}
              >
                {done ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <Circle className="w-4 h-4 flex-shrink-0" />}
                <span className={done ? 'line-through opacity-70' : ''}>{step}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={handleComplete}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-4 flex items-center justify-center gap-2 text-lg font-semibold transition"
        >
          <CheckCircle2 className="w-6 h-6" /> Done
        </button>
        <button
          onClick={handleSkip}
          className="w-full text-slate-400 hover:text-white text-sm py-2 flex items-center justify-center gap-1.5 transition"
        >
          <SkipForward className="w-3.5 h-3.5" /> Skip for now
        </button>
      </div>
    </div>
  );
};

export default FocusMode;
