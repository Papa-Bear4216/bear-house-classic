import { useEffect, useState } from 'react';
import { Paintbrush, Check } from 'lucide-react';

const STEPS = ['Move small stuff out of the way', 'Take out the recycling', 'Wipe down the counters'];

export default function LandingDemoCard() {
  const [demoStep, setDemoStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDemoStep((s) => (s + 1) % 5), 1300);
    return () => clearInterval(id);
  }, []);

  const checkedCount = Math.min(demoStep, STEPS.length);
  const pct = Math.round((checkedCount / STEPS.length) * 100);
  const celebrate = demoStep === 4;

  return (
    <div
      className="bg-white rounded-[var(--radius-xl)] p-8 relative overflow-hidden"
      style={{ boxShadow: 'var(--shadow-lg)' }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-white shrink-0"
          style={{ background: 'var(--berry-500)' }}
        >
          <Paintbrush className="w-[17px] h-[17px]" />
        </div>
        <div className="flex-1">
          <div className="bh-font-display font-bold text-[17px]" style={{ color: 'var(--bark-700)' }}>
            Kitchen reset
          </div>
          <div className="h-1 rounded-full bg-[var(--border-default)]/30 overflow-hidden mt-1.5 w-full">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ background: 'var(--berry-500)', width: `${pct}%` }}
            />
          </div>
        </div>
        <div
          className="text-xs font-bold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(192,32,160,0.12)', color: 'var(--berry-600)' }}
        >
          +45
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {STEPS.map((label, i) => {
          const done = checkedCount > i;
          const active = checkedCount === i;
          return (
            <div
              key={label}
              className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border ${done ? 'bh-pop' : ''}`}
              style={{
                background: done || active ? 'var(--cream-100)' : 'var(--cream-100)',
                borderColor: active ? 'var(--berry-400)' : 'var(--border-light)',
                borderWidth: active ? 1.5 : 1,
                boxShadow: active ? 'var(--shadow-sm)' : undefined,
                opacity: !done && !active ? 0.6 : 1,
              }}
            >
              <div
                className="w-[22px] h-[22px] rounded-full shrink-0 flex items-center justify-center text-white text-xs"
                style={done ? { background: 'var(--sage-500)' } : { border: '2px solid var(--stone-300)' }}
              >
                {done ? '✓' : null}
              </div>
              <div
                className="text-sm font-semibold"
                style={{
                  color: done ? 'var(--fg-muted)' : 'var(--bark-700)',
                  textDecoration: done ? 'line-through' : 'none',
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>

      {celebrate && (
        <div
          className="bh-pop-slow absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ background: 'rgba(253,246,236,0.94)' }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white"
            style={{ background: 'var(--sage-500)' }}
          >
            <Check className="w-[30px] h-[30px]" />
          </div>
          <div className="bh-font-display font-extrabold text-xl" style={{ color: 'var(--bark-700)' }}>
            Nice work! +45 points
          </div>
          <div className="text-sm" style={{ color: 'var(--fg-muted)' }}>
            Streak now at 8 days.
          </div>
        </div>
      )}
    </div>
  );
}
