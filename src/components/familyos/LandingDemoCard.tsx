import { useEffect, useState } from 'react';
import { Paintbrush, Check } from 'lucide-react';
import { triggerConfetti } from '@/lib/confetti';

const STEPS = ['Move small stuff out of the way', 'Take out the recycling', 'Wipe down the counters'];

export default function LandingDemoCard() {
  const [demoStep, setDemoStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setDemoStep((s) => {
        const next = (s + 1) % 5;
        if (next === 4) {
          triggerConfetti(undefined, undefined, 30);
        }
        return next;
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const checkedCount = Math.min(demoStep, STEPS.length);
  const pct = Math.round((checkedCount / STEPS.length) * 100);
  const celebrate = demoStep === 4;

  return (
    <div className="bg-slate-900/90 backdrop-blur-xl border border-white/15 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-2xl text-slate-100">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0 bg-gradient-to-tr from-purple-500 to-pink-500 shadow-md">
          <Paintbrush className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="font-display font-bold text-base sm:text-lg text-white">
            Kitchen reset
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1.5 w-full">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-purple-500 to-pink-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="text-xs font-bold px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30">
          +45 pts
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {STEPS.map((label, i) => {
          const done = checkedCount > i;
          const active = checkedCount === i;
          return (
            <div
              key={label}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-300 ${
                active 
                  ? 'bg-slate-800/90 border-pink-500/50 shadow-lg shadow-pink-500/10' 
                  : done 
                  ? 'bg-slate-900/50 border-emerald-500/20 opacity-70' 
                  : 'bg-slate-900/30 border-white/5 opacity-40'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold transition-all ${
                  done 
                    ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30' 
                    : 'border-2 border-slate-600'
                }`}
              >
                {done ? '✓' : null}
              </div>
              <div
                className={`text-sm font-semibold transition-all ${
                  done ? 'line-through text-slate-400' : 'text-white'
                }`}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>

      {celebrate && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/95 backdrop-blur-md animate-in fade-in zoom-in-95 duration-300">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-slate-950 bg-emerald-400 shadow-xl shadow-emerald-500/30">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>
          <div className="font-display font-black text-xl text-white">
            Nice work! +45 points
          </div>
          <div className="text-xs text-emerald-400 font-semibold">
            Streak now at 8 days 🔥
          </div>
        </div>
      )}
    </div>
  );
}
