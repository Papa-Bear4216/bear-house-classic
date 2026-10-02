import React, { useState } from 'react';
import { UtensilsCrossed, Package, ShoppingBag } from 'lucide-react';
import MealPlanner from './MealPlanner';
import Pantry from './Pantry';
import Shopping from './Shopping';

export type KitchenTab = 'meals' | 'pantry' | 'shopping';

export const KitchenHub: React.FC<{ initialTab?: KitchenTab }> = ({ initialTab = 'meals' }) => {
  const [tab, setTab] = useState<KitchenTab>(initialTab);

  const TABS = [
    { id: 'meals' as const, label: 'Meal Planner', icon: UtensilsCrossed },
    { id: 'pantry' as const, label: 'Pantry & Fridge', icon: Package },
    { id: 'shopping' as const, label: 'Shopping List', icon: ShoppingBag },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/10">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            Kitchen & Food
          </h2>
          <p className="text-xs text-slate-400 mt-1">Weekly meal planning, pantry inventory & smart grocery list</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-900/80 border border-white/10 rounded-xl p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  active ? 'bg-amber-500 text-slate-950 shadow-sm font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'meals' && <MealPlanner />}
      {tab === 'pantry' && <Pantry />}
      {tab === 'shopping' && <Shopping />}
    </div>
  );
};

export default KitchenHub;
