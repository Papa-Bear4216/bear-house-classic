import React, { useState, useMemo } from 'react';
import { CheckCircle2, SkipForward, X, PartyPopper } from 'lucide-react';
import { buildFocusQueue, type FocusQueueTask } from '@/lib/focusQueue';

export interface FocusModeTask extends FocusQueueTask {
  text: string;
}

interface FocusModeProps {
  tasks: FocusModeTask[];
  onComplete: (id: string) => void;
  onExit: () => void;
}

const FocusMode: React.FC<FocusModeProps> = ({ tasks, onComplete, onExit }) => {
  // Sorted once on mount — a point-in-time snapshot, not live-synced to the
  // parent's task list while focus mode is open (see plan's Global Constraints).
  const [queue, setQueue] = useState<FocusModeTask[]>(() => buildFocusQueue(tasks));
  const [justFinished, setJustFinished] = useState(false);

  const total = useMemo(() => queue.length, []); // fixed at mount for a stable "X of N" denominator
  const current = queue[0];

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

  if (justFinished || !current) {
    return (
      <div className="bg-slate-800 border border-emerald-500/30 rounded-2xl p-10 text-center">
        <PartyPopper className="w-10 h-10 mx-auto mb-3 text-emerald-400" />
        <p className="text-xl font-bold text-white">All done!</p>
        <p className="text-sm text-slate-400 mt-1">Nice work clearing the queue.</p>
      </div>
    );
  }

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

      <p className="text-2xl font-bold text-white text-center py-4">{current.text}</p>

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
