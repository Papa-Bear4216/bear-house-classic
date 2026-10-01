import React from 'react';
import { ToggleLeft, ToggleRight, RotateCcw, Sliders, Sparkles } from 'lucide-react';
import { useFeatureFlags, FEATURE_FLAG_METAS, type FeatureCategory, type FeatureFlagKey } from '@/lib/featureFlags';

const CATEGORIES: FeatureCategory[] = [
  'Co-Parenting',
  'Daily Rhythm',
  'Household Engagement',
  'Smart Tools',
];

export function FeatureSwitchboardPanel() {
  const { flags, setFlag, resetFlags } = useFeatureFlags();

  const handleToggle = (key: FeatureFlagKey) => {
    setFlag(key, !flags[key]);
  };

  return (
    <div className="space-y-6">
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              Feature Switchboard
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-normal">
                Live Sync
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Safely enable or disable modular household features. Changes sync immediately across all family devices.
            </p>
          </div>
        </div>

        <button
          onClick={resetFlags}
          title="Reset all feature flags to recommended defaults"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Defaults
        </button>
      </div>

      {/* Categories & Toggles */}
      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const categoryMetas = FEATURE_FLAG_METAS.filter((m) => m.category === cat);
          if (categoryMetas.length === 0) return null;

          return (
            <div key={cat} className="rounded-xl border border-slate-700 overflow-hidden bg-slate-900/60">
              <div className="px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{cat}</span>
                <span className="text-xs text-slate-500">
                  {categoryMetas.filter((m) => flags[m.key]).length}/{categoryMetas.length} active
                </span>
              </div>

              <div className="divide-y divide-slate-800">
                {categoryMetas.map((meta) => {
                  const isEnabled = !!flags[meta.key];

                  return (
                    <div
                      key={meta.key}
                      role="switch"
                      aria-checked={isEnabled}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(meta.key); } }}
                      onClick={() => handleToggle(meta.key)}
                      className={`flex items-center justify-between p-4 cursor-pointer transition hover:bg-slate-800/40 ${
                        isEnabled ? '' : 'opacity-70'
                      }`}
                    >
                      <div className="pr-4 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{meta.label}</span>
                          {isEnabled ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                              ENABLED
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-mono">
                              OFF
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 leading-normal">{meta.description}</p>
                      </div>

                      <div className="flex-shrink-0">
                        {isEnabled ? (
                          <ToggleRight className="w-8 h-8 text-indigo-400 hover:text-indigo-300 transition" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-slate-600 hover:text-slate-500 transition" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
