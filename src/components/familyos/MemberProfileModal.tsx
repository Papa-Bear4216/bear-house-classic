import React, { useState } from 'react';
import { X, Utensils, Music2, Gamepad2, HeartPulse, Save } from 'lucide-react';
import {
  loadMemberPreferences, preferencesKey, saveJSON, isAdmin,
  FOOD_LIKES_OPTIONS, FOOD_DISLIKES_OPTIONS, FOOD_ALLERGY_OPTIONS, FOOD_DIET_OPTIONS,
  HOBBY_OPTIONS, ENTERTAINMENT_OPTIONS, HEALTH_NOTE_OPTIONS,
  type MemberPreferences,
} from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

interface Props {
  memberId: string;
  onClose: () => void;
}

type Section = 'food' | 'hobbies' | 'entertainment' | 'health';

function CheckboxGrid({ options, selected, onToggle, disabled }: {
  options: string[]; selected: string[]; onToggle: (opt: string) => void; disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const checked = selected.includes(opt);
        return (
          <label
            key={opt}
            className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer transition ${
              checked ? 'bg-indigo-900/40 border-indigo-500/50 text-indigo-200' : 'bg-slate-900 border-slate-700 text-slate-300'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-slate-500'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(opt)}
              className="accent-indigo-500"
            />
            {opt}
          </label>
        );
      })}
    </div>
  );
}

const MemberProfileModal: React.FC<Props> = ({ memberId, onClose }) => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const member = householdMembers.find((m) => m.id === memberId);
  const canEdit = !!currentUser && (currentUser.id === memberId || (currentRole && isAdmin(currentRole)));

  const [prefs, setPrefs] = useState<MemberPreferences>(() => loadMemberPreferences(memberId));
  const [section, setSection] = useState<Section>('food');
  const [saved, setSaved] = useState(false);

  const toggle = (category: 'food' | 'hobbies' | 'entertainment' | 'healthNotes', field: string, opt: string) => {
    setPrefs((prev) => {
      const list: string[] = (prev as any)[category][field];
      const next = list.includes(opt) ? list.filter((o) => o !== opt) : [...list, opt];
      return { ...prev, [category]: { ...(prev as any)[category], [field]: next } };
    });
  };

  const setOtherNotes = (category: 'food' | 'hobbies' | 'entertainment' | 'healthNotes', value: string) => {
    setPrefs((prev) => ({ ...prev, [category]: { ...(prev as any)[category], otherNotes: value } }));
  };

  const save = () => {
    saveJSON(preferencesKey(memberId), { ...prefs, updatedAt: Date.now() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const SECTIONS: { id: Section; label: string; icon: typeof Utensils }[] = [
    { id: 'food', label: 'Food', icon: Utensils },
    { id: 'hobbies', label: 'Hobbies', icon: Gamepad2 },
    { id: 'entertainment', label: 'Entertainment', icon: Music2 },
    { id: 'health', label: 'Health Notes', icon: HeartPulse },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl max-w-2xl w-full mx-auto my-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-xl font-bold text-white">{member?.name || 'Member'}'s Preferences</h2>
            {!canEdit && <p className="text-xs text-slate-500 mt-0.5">View only</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 p-4 border-b border-slate-700 overflow-x-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                section === s.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </button>
          ))}
        </div>

        <div className="p-6 max-h-[55vh] overflow-y-auto space-y-4">
          {section === 'food' && (
            <>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Diet</div>
                <CheckboxGrid options={FOOD_DIET_OPTIONS} selected={prefs.food.diet} disabled={!canEdit}
                  onToggle={(o) => toggle('food', 'diet', o)} />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Allergies</div>
                <CheckboxGrid options={FOOD_ALLERGY_OPTIONS} selected={prefs.food.allergies} disabled={!canEdit}
                  onToggle={(o) => toggle('food', 'allergies', o)} />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Dislikes</div>
                <CheckboxGrid options={FOOD_DISLIKES_OPTIONS} selected={prefs.food.dislikes} disabled={!canEdit}
                  onToggle={(o) => toggle('food', 'dislikes', o)} />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Likes</div>
                <CheckboxGrid options={FOOD_LIKES_OPTIONS} selected={prefs.food.likes} disabled={!canEdit}
                  onToggle={(o) => toggle('food', 'likes', o)} />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">Other</div>
                <input
                  value={prefs.food.otherNotes}
                  onChange={(e) => setOtherNotes('food', e.target.value)}
                  disabled={!canEdit}
                  placeholder="Anything else about food preferences…"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-60"
                />
              </div>
            </>
          )}

          {section === 'hobbies' && (
            <>
              <CheckboxGrid options={HOBBY_OPTIONS} selected={prefs.hobbies.selected} disabled={!canEdit}
                onToggle={(o) => toggle('hobbies', 'selected', o)} />
              <input
                value={prefs.hobbies.otherNotes}
                onChange={(e) => setOtherNotes('hobbies', e.target.value)}
                disabled={!canEdit}
                placeholder="Other hobbies…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-60"
              />
            </>
          )}

          {section === 'entertainment' && (
            <>
              <CheckboxGrid options={ENTERTAINMENT_OPTIONS} selected={prefs.entertainment.selected} disabled={!canEdit}
                onToggle={(o) => toggle('entertainment', 'selected', o)} />
              <input
                value={prefs.entertainment.otherNotes}
                onChange={(e) => setOtherNotes('entertainment', e.target.value)}
                disabled={!canEdit}
                placeholder="Other favorites…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-60"
              />
            </>
          )}

          {section === 'health' && (
            <>
              <CheckboxGrid options={HEALTH_NOTE_OPTIONS} selected={prefs.healthNotes.selected} disabled={!canEdit}
                onToggle={(o) => toggle('healthNotes', 'selected', o)} />
              <input
                value={prefs.healthNotes.otherNotes}
                onChange={(e) => setOtherNotes('healthNotes', e.target.value)}
                disabled={!canEdit}
                placeholder="Other notes…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none disabled:opacity-60"
              />
            </>
          )}
        </div>

        {canEdit && (
          <div className="p-6 border-t border-slate-700 flex items-center gap-3">
            <button
              onClick={save}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              <Save className="w-4 h-4" /> Save
            </button>
            {saved && <span className="text-emerald-400 text-sm">Saved</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberProfileModal;
