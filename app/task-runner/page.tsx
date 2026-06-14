'use client';

import { useState, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Play, RotateCw } from 'lucide-react';
import { sampleHouse } from '../../src/lib/sampleHouse';
import { runCompletion } from '../../src/lib/completion';
import { updateBaseline } from '../../src/lib/learnBaseline';

export default function TaskRunnerPage() {
  const [choreIndex, setChoreIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [verified, setVerified] = useState<boolean[]>([]);
  const [completed, setCompleted] = useState<{ success: boolean; awardedPoints: number } | null>(null);

  const allChores = useMemo(
    () => sampleHouse.rooms.flatMap(r => r.zones.flatMap(z => z.chores)),
    []
  );

  const chore = allChores[choreIndex] || allChores[0];
  const steps = chore?.steps || [];

  const stepVerifications = useMemo(() => {
    if (verified.length === 0) {
      return Array(steps.length).fill(false);
    }
    return verified;
  }, [verified, steps.length]);

  const allStepsVerified = stepVerifications.every(Boolean);
  const completedSteps = stepVerifications.filter(Boolean).length;

  function toggleVerify(i: number) {
    const next = [...stepVerifications];
    next[i] = !next[i];
    setVerified(next);
  }

  function finishChore() {
    const res = runCompletion(chore, stepVerifications);
    setCompleted(res);
    if (res.success) {
      // Record baseline learning (mock)
      const room = sampleHouse.rooms[0];
      if (room?.zones[0]) {
        updateBaseline(room.zones[0], 0.1, 0.2);
      }
    }
  }

  function nextChore() {
    setChoreIndex(i => (i + 1) % allChores.length);
    setStepIndex(0);
    setVerified([]);
    setCompleted(null);
  }

  function reset() {
    setChoreIndex(0);
    setStepIndex(0);
    setVerified([]);
    setCompleted(null);
  }

  if (completed) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border-2 border-black shadow-lg p-6">
          {completed.success ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <h2 className="text-2xl font-bold text-slate-900">Done! 🎉</h2>
              </div>
              <p className="text-lg font-bold text-emerald-600 mb-6">Awarded {completed.awardedPoints} points</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-10 h-10 text-red-500" />
                <h2 className="text-2xl font-bold text-slate-900">Not Complete</h2>
              </div>
              <p className="text-sm text-slate-600 mb-6">Not all steps were verified. Try again!</p>
            </>
          )}
          <div className="flex gap-2">
            <button onClick={nextChore} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">
              Next Chore
            </button>
            <button onClick={reset} className="flex-1 px-4 py-2 bg-slate-300 text-slate-900 rounded-xl font-bold">
              Restart
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border-2 border-black shadow-lg p-6 mb-4">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Chore {choreIndex + 1} of {allChores.length}</p>
            <h1 className="text-3xl font-bold text-slate-900 mt-2">{chore?.name || 'No Chore'}</h1>
            <p className="text-sm text-slate-600 mt-1">Points: {chore?.points || 0}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-slate-500">{completedSteps} / {steps.length}</p>
            <p className="text-xs text-slate-400">steps verified</p>
          </div>
        </div>

        {/* Step list */}
        <div className="space-y-3 mb-6">
          {steps.map((step, idx) => (
            <div
              key={idx}
              onClick={() => setStepIndex(idx)}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                idx === stepIndex ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    toggleVerify(idx);
                  }}
                  className={`flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                    stepVerifications[idx] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'
                  }`}
                >
                  {stepVerifications[idx] && '✓'}
                </button>
                <p className="flex-1 text-sm font-medium text-slate-800">{step.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={finishChore}
            disabled={!allStepsVerified}
            className={`flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${
              allStepsVerified ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-300 cursor-not-allowed'
            }`}
          >
            <Play className="w-4 h-4" />
            {allStepsVerified ? 'Complete Chore' : 'Verify All Steps'}
          </button>
          <button onClick={reset} className="px-4 py-3 bg-slate-300 text-slate-900 rounded-xl font-bold hover:bg-slate-400">
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
