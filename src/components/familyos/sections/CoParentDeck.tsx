import React, { useState } from 'react';
import { CalendarDays, Pill, GraduationCap, DoorOpen, Sparkles, HeartHandshake } from 'lucide-react';
import { useAppContext } from '@/contexts/AppContext';
import { useFeatureFlag } from '@/lib/featureFlags';
import { canDelete } from '@/lib/familyos';
import CustodyCalendar from './CustodyCalendar';
import { MedsTab } from './HealthHub';
import { HomeworkTab } from './KidsHub';
import KidRoom from './KidRoom';
import BiffToneCheckModal from './BiffToneCheckModal';

export type CoParentTab = 'custody' | 'meds' | 'school' | 'rooms';

export interface CoParentDeckProps {
  initialTab?: CoParentTab;
}

export const CoParentDeck: React.FC<CoParentDeckProps> = ({ initialTab = 'custody' }) => {
  const [tab, setTab] = useState<CoParentTab>(initialTab);
  const [showToneCheck, setShowToneCheck] = useState(false);
  const { currentRole, householdMembers } = useAppContext();
  const hermesNeutralEnabled = useFeatureFlag('hermes_neutral');
  const isAdm = currentRole && canDelete(currentRole);

  const people = householdMembers.filter((m) => m.role !== 'pet').map((m) => m.name);
  const fallbackPeople = people.length > 0 ? people : ['Family Member'];
  const childMembers = householdMembers.filter((m) => m.role === 'child').map((m) => m.name);
  const kids = childMembers.length > 0 ? childMembers : fallbackPeople;

  const TABS = [
    { id: 'custody' as const, label: 'Custody & Swaps', icon: CalendarDays },
    { id: 'meds' as const, label: 'Medications', icon: Pill },
    { id: 'school' as const, label: 'School & Homework', icon: GraduationCap },
    { id: 'rooms' as const, label: 'Kid Rooms', icon: DoorOpen },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm shadow-indigo-500/10">
              <HeartHandshake className="w-5 h-5" />
            </div>
            Co-Parent &amp; Kids Deck
          </h2>
          <p className="text-xs text-slate-400 mt-1">Custody swaps, medication safety, school notes &amp; kid profiles</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hermesNeutralEnabled && (
            <button
              onClick={() => setShowToneCheck(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 transition shadow-sm active:scale-95"
              title="BIFF Tone Checker"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>BIFF Tone Check</span>
            </button>
          )}
          <div className="flex items-center gap-1 bg-slate-900/80 border border-white/10 rounded-xl p-1 overflow-x-auto scrollbar-none">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    active ? 'bg-indigo-500 text-white shadow-sm font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {tab === 'custody' && <CustodyCalendar />}
      {tab === 'meds' && <MedsTab isAdm={!!isAdm} people={fallbackPeople} />}
      {tab === 'school' && <HomeworkTab isAdm={!!isAdm} kids={kids} />}
      {tab === 'rooms' && <KidRoom />}

      {hermesNeutralEnabled && (
        <BiffToneCheckModal
          open={showToneCheck}
          onOpenChange={setShowToneCheck}
        />
      )}
    </div>
  );
};

export default CoParentDeck;
