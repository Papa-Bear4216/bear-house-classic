import React, { useState } from 'react';
import { Edit3, Check, X, ChefHat } from 'lucide-react';
import { loadJSON, saveJSON } from '@/lib/familyos';

const STORAGE_KEY = 'familyos_meals';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
type Day = typeof DAYS[number];
const MEALS = ['Breakfast', 'Lunch', 'Dinner'] as const;
type MealType = typeof MEALS[number];

interface DayPlan {
  Breakfast: string;
  Lunch: string;
  Dinner: string;
  cook: string;
}

type WeekPlan = Record<Day, DayPlan>;

const EMPTY_DAY: DayPlan = { Breakfast: '', Lunch: '', Dinner: '', cook: '' };

const defaultPlan = (): WeekPlan => {
  const plan = {} as WeekPlan;
  DAYS.forEach(d => { plan[d] = { ...EMPTY_DAY }; });
  return plan;
};

const COOKS = ['', 'Daddy', 'Mommy', 'Abriana', 'Julia', 'Together', 'Takeout'];

const MealPlanner: React.FC = () => {
  const [plan, setPlan] = useState<WeekPlan>(() => {
    const saved = loadJSON<WeekPlan | null>(STORAGE_KEY, null);
    if (!saved) return defaultPlan();
    // ensure all days present
    const full = defaultPlan();
    DAYS.forEach(d => { if (saved[d]) full[d] = { ...EMPTY_DAY, ...saved[d] }; });
    return full;
  });

  const [editing, setEditing] = useState<{ day: Day; meal: MealType } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editingCook, setEditingCook] = useState<Day | null>(null);

  const save = (next: WeekPlan) => {
    setPlan(next);
    saveJSON(STORAGE_KEY, next);
  };

  const startEdit = (day: Day, meal: MealType) => {
    setEditing({ day, meal });
    setEditValue(plan[day][meal]);
    setEditingCook(null);
  };

  const commitEdit = () => {
    if (!editing) return;
    const next = { ...plan, [editing.day]: { ...plan[editing.day], [editing.meal]: editValue.trim() } };
    save(next);
    setEditing(null);
  };

  const setCook = (day: Day, cook: string) => {
    save({ ...plan, [day]: { ...plan[day], cook } });
    setEditingCook(null);
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }) as Day;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Meal Planner</h2>
        <div className="text-slate-400 text-sm">Weekly Plan</div>
      </div>

      <div className="space-y-3">
        {DAYS.map(day => {
          const isToday = day === today;
          const dayPlan = plan[day];
          return (
            <div
              key={day}
              className={`bg-slate-800/40 border rounded-xl overflow-hidden ${isToday ? 'border-emerald-500/50' : 'border-slate-700'}`}
            >
              <div className={`px-4 py-2 flex items-center justify-between ${isToday ? 'bg-emerald-900/30' : 'bg-slate-800/60'}`}>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm ${isToday ? 'text-emerald-300' : 'text-white'}`}>
                    {day}
                    {isToday && <span className="ml-2 text-xs bg-emerald-500 text-slate-900 px-1.5 py-0.5 rounded font-medium">Today</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ChefHat className="w-3.5 h-3.5 text-slate-500" />
                  {editingCook === day ? (
                    <select
                      autoFocus
                      value={dayPlan.cook}
                      onChange={e => setCook(day, e.target.value)}
                      onBlur={() => setEditingCook(null)}
                      className="bg-slate-700 border border-slate-600 rounded text-xs text-white px-1 py-0.5 outline-none"
                    >
                      {COOKS.map(c => <option key={c} value={c}>{c || 'Set cook...'}</option>)}
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingCook(day)}
                      className="text-xs text-slate-400 hover:text-white transition"
                    >
                      {dayPlan.cook || 'Who\'s cooking?'}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-slate-700/50">
                {MEALS.map(meal => {
                  const isEdit = editing?.day === day && editing?.meal === meal;
                  const value = dayPlan[meal];
                  return (
                    <div key={meal} className="p-3">
                      <div className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">{meal}</div>
                      {isEdit ? (
                        <div className="space-y-1">
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs outline-none focus:border-emerald-500"
                            placeholder="Enter meal..."
                          />
                          <div className="flex gap-1">
                            <button onClick={commitEdit} className="text-emerald-400 hover:text-emerald-300 transition"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-white transition"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(day, meal)}
                          className="w-full text-left group"
                        >
                          <span className={`text-sm ${value ? 'text-slate-200' : 'text-slate-600 italic'}`}>
                            {value || 'Tap to add...'}
                          </span>
                          <Edit3 className="w-3 h-3 text-slate-600 group-hover:text-slate-400 inline ml-1 opacity-0 group-hover:opacity-100 transition" />
                        </button>
                      )}
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
};

export default MealPlanner;
