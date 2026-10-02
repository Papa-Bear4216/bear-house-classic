import React, { useState } from 'react';
import { Wrench, Car, Smartphone, Brain } from 'lucide-react';
import HomeMaintenance from './HomeMaintenance';
import CarMaintenance from './CarMaintenance';
import DeviceWarranty from './DeviceWarranty';
import HouseholdMemory from './HouseholdMemory';

export type UpkeepTab = 'home' | 'cars' | 'warranty' | 'vault';

export const UpkeepHub: React.FC<{ initialTab?: UpkeepTab }> = ({ initialTab = 'home' }) => {
  const [tab, setTab] = useState<UpkeepTab>(initialTab);

  const TABS = [
    { id: 'home' as const, label: 'Home Maintenance', icon: Wrench },
    { id: 'cars' as const, label: 'Vehicles', icon: Car },
    { id: 'warranty' as const, label: 'Warranties', icon: Smartphone },
    { id: 'vault' as const, label: 'Family Vault', icon: Brain },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/10">
              <Wrench className="w-5 h-5" />
            </div>
            Property & Upkeep
          </h2>
          <p className="text-xs text-slate-400 mt-1">Home repairs, vehicle maintenance, device warranties & family vault</p>
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

      {tab === 'home' && <HomeMaintenance />}
      {tab === 'cars' && <CarMaintenance />}
      {tab === 'warranty' && <DeviceWarranty />}
      {tab === 'vault' && <HouseholdMemory />}
    </div>
  );
};

export default UpkeepHub;
