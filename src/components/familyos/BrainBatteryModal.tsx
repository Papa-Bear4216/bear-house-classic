import React, { useState } from 'react';
import { X, Sparkles, BatteryCharging } from 'lucide-react';
import { getBrainBattery, setBrainBattery, BATTERY_LEVELS, type BatteryLevel } from '@/lib/brainBattery';
import { triggerConfetti } from '@/lib/confetti';

interface BrainBatteryModalProps {
  open: boolean;
  onClose: () => void;
}

export const BrainBatteryModal: React.FC<BrainBatteryModalProps> = ({ open, onClose }) => {
  const [current, setCurrent] = useState<BatteryLevel>(() => getBrainBattery());

  if (!open) return null;

  const handleSelect = (lvl: BatteryLevel) => {
    setCurrent(lvl);
    setBrainBattery(lvl);
    if (lvl === 'high') {
      triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.45, 40);
    }
  };

  const activeCfg = BATTERY_LEVELS[current];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 rounded-3xl shadow-2xl p-6 relative overflow-hidden">
        {/* Subtle glow orb behind modal */}
        <div className={`absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-gradient-to-b ${activeCfg.bgGlow} blur-3xl pointer-events-none transition-all duration-500`} />

        <div className="flex items-center justify-between relative z-10 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-1.5 font-display">
                Brain Battery <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h3>
              <p className="text-xs text-slate-400">What's your executive bandwidth right now?</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Battery selector cards */}
        <div className="grid grid-cols-2 gap-3 relative z-10 mb-5">
          {(Object.keys(BATTERY_LEVELS) as BatteryLevel[]).map((key) => {
            const item = BATTERY_LEVELS[key];
            const isSelected = current === key;
            return (
              <button
                key={key}
                onClick={() => handleSelect(key)}
                className={`p-3.5 rounded-2xl border text-left transition-all duration-200 relative group ${
                  isSelected
                    ? `${item.badgeClass} ring-2 ring-amber-400/50 scale-[1.02] shadow-lg`
                    : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20 text-slate-300'
                }`}
              >
                <div className="text-2xl mb-1.5">{item.emoji}</div>
                <div className="font-bold text-sm text-white">{item.label}</div>
                <div className="text-[11px] opacity-80 line-clamp-1">{item.tagline}</div>
              </button>
            );
          })}
        </div>

        {/* ADHD Coaching Tip */}
        <div className="relative z-10 p-4 rounded-2xl bg-white/[0.04] border border-white/10 text-xs text-slate-300 space-y-1 mb-5">
          <div className="font-semibold text-amber-300 flex items-center gap-1">
            <span>{activeCfg.emoji}</span> Coach Hermes says:
          </div>
          <p className="leading-relaxed text-slate-300">{activeCfg.tip}</p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition active:scale-[0.98]"
        >
          Got it, let's roll
        </button>
      </div>
    </div>
  );
};

export default BrainBatteryModal;
