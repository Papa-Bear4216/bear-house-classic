import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, BookOpen, Star, Activity, DollarSign } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

const SUBJECTS = ['Math', 'English', 'Science', 'History', 'Reading', 'PE', 'Art', 'Other'];
const HW_STATUSES = ['Not Started', 'In Progress', 'Done'];
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Homework
interface HWItem {
  id: string;
  kid: string;
  subject: string;
  task: string;
  dueDate: string;
  status: string;
  createdAt: number;
  deletedAt?: number;
}

// Grades
interface GradeEntry {
  id: string;
  kid: string;
  subject: string;
  grade: string;
  date: string;
  notes: string;
  createdAt: number;
}

// Activities
interface ActivityEntry {
  id: string;
  kid: string;
  name: string;
  day: string;
  time: string;
  location: string;
  createdAt: number;
  deletedAt?: number;
}

// Allowance
interface AllowanceEntry {
  id: string;
  kid: string;
  amount: number;
  type: 'earned' | 'spent';
  reason: string;
  date: string;
  createdAt: number;
}

const KidsHub: React.FC = () => {
  const { currentRole, householdMembers } = useAppContext();
  const kids = householdMembers.filter((m) => m.role === 'child').map((m) => m.name);
  const [tab, setTab] = useState<'homework' | 'grades' | 'activities' | 'allowance'>('homework');
  const isAdm = currentRole && canDelete(currentRole);
  const TABS = [
    { id: 'homework' as const, label: 'Homework', icon: BookOpen },
    { id: 'grades' as const, label: 'Grades', icon: Star },
    { id: 'activities' as const, label: 'Activities', icon: Activity },
    { id: 'allowance' as const, label: 'Allowance', icon: DollarSign },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Kids Hub</h2>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${tab === t.id ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'homework' && <HomeworkTab isAdm={!!isAdm} kids={kids} />}
      {tab === 'grades' && <GradesTab isAdm={!!isAdm} kids={kids} />}
      {tab === 'activities' && <ActivitiesTab isAdm={!!isAdm} kids={kids} />}
      {tab === 'allowance' && <AllowanceTab isAdm={!!isAdm} kids={kids} />}
    </div>
  );
};

const HomeworkTab: React.FC<{ isAdm: boolean; kids: string[] }> = ({ isAdm, kids: KIDS }) => {
  const [items, setItems] = useState<HWItem[]>(() => loadJSON('familyos_homework', []));
  const [showForm, setShowForm] = useState(false);
  const [kid, setKid] = useState(KIDS[0] || '');
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [task, setTask] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('Not Started');
  const [filterKid, setFilterKid] = useState<string>('All');

  const save = (next: HWItem[]) => { setItems(next); saveJSON('familyos_homework', next); };

  const add = () => {
    if (!task.trim()) return;
    save([{ id: uid(), kid, subject, task: task.trim(), dueDate, status, createdAt: Date.now() }, ...items]);
    setTask(''); setShowForm(false);
  };

  const setItemStatus = (id: string, s: string) => save(items.map(i => i.id === id ? { ...i, status: s } : i));
  const del = (id: string) => save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now() } : i));

  const active = items.filter(i => !i.deletedAt && (filterKid === 'All' || i.kid === filterKid));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {['All', ...KIDS].map(k => (
            <button key={k} onClick={() => setFilterKid(k)} className={`px-2.5 py-1 rounded-lg text-xs transition ${filterKid === k ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{k}</button>
          ))}
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition"><Plus className="w-3.5 h-3.5" /> Add</button>
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Kid</label>
              <select value={kid} onChange={e => setKid(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {KIDS.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Subject</label>
              <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Task</label>
              <input value={task} onChange={e => setTask(e.target.value)} placeholder="Describe the homework..." className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {HW_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1 rounded transition">Add</button>
          </div>
        </div>
      )}

      {active.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No homework items.</div>}

      <div className="space-y-2">
        {active.map(item => (
          <div key={item.id} className={`flex items-start gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-2.5 ${item.status === 'Done' ? 'opacity-60' : ''}`}>
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${KIDS.indexOf(item.kid) % 2 === 0 ? 'bg-purple-400' : 'bg-blue-400'}`} />
            <div className="flex-1 min-w-0">
              <div className={`text-white text-sm ${item.status === 'Done' ? 'line-through text-slate-400' : ''}`}>{item.task}</div>
              <div className="text-slate-500 text-xs">{item.kid} · {item.subject}{item.dueDate ? ` · Due ${item.dueDate}` : ''}</div>
            </div>
            <select
              value={item.status}
              onChange={e => setItemStatus(item.id, e.target.value)}
              className={`bg-slate-700 border border-slate-600 rounded text-xs px-1 py-0.5 outline-none ${item.status === 'Done' ? 'text-emerald-400' : item.status === 'In Progress' ? 'text-amber-400' : 'text-slate-300'}`}
            >
              {HW_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            {isAdm && (
              <button onClick={() => del(item.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const GradesTab: React.FC<{ isAdm: boolean; kids: string[] }> = ({ isAdm, kids: KIDS }) => {
  const [entries, setEntries] = useState<GradeEntry[]>(() => loadJSON('familyos_grades', []));
  const [showForm, setShowForm] = useState(false);
  const [kid, setKid] = useState(KIDS[0] || '');
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [grade, setGrade] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [filterKid, setFilterKid] = useState('All');

  const save = (next: GradeEntry[]) => { setEntries(next); saveJSON('familyos_grades', next); };
  const add = () => {
    if (!grade.trim()) return;
    save([{ id: uid(), kid, subject, grade: grade.trim(), date, notes, createdAt: Date.now() }, ...entries]);
    setGrade(''); setNotes(''); setShowForm(false);
  };
  const del = (id: string) => { if (isAdm) save(entries.filter(e => e.id !== id)); };

  const filtered = entries.filter(e => filterKid === 'All' || e.kid === filterKid);

  const gradeColor = (g: string) => {
    const n = parseFloat(g);
    if (!isNaN(n)) {
      if (n >= 90) return 'text-emerald-400';
      if (n >= 80) return 'text-blue-400';
      if (n >= 70) return 'text-amber-400';
      return 'text-rose-400';
    }
    const letter = g.toUpperCase()[0];
    if (letter === 'A') return 'text-emerald-400';
    if (letter === 'B') return 'text-blue-400';
    if (letter === 'C') return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {['All', ...KIDS].map(k => (
            <button key={k} onClick={() => setFilterKid(k)} className={`px-2.5 py-1 rounded-lg text-xs transition ${filterKid === k ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{k}</button>
          ))}
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition"><Plus className="w-3.5 h-3.5" /> Add Grade</button>
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Kid</label>
              <select value={kid} onChange={e => setKid(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {KIDS.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Subject</label>
              <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Grade</label>
              <input value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. 95, A+" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1 rounded transition">Save</button>
          </div>
        </div>
      )}

      {filtered.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No grades logged.</div>}

      <div className="space-y-2">
        {filtered.map(e => (
          <div key={e.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-2.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${KIDS.indexOf(e.kid) % 2 === 0 ? 'bg-purple-400' : 'bg-blue-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm">{e.kid} · {e.subject}</div>
              <div className="text-slate-500 text-xs">{e.date}{e.notes ? ` · ${e.notes}` : ''}</div>
            </div>
            <span className={`text-lg font-bold ${gradeColor(e.grade)}`}>{e.grade}</span>
            {isAdm && <button onClick={() => del(e.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
};

const ActivitiesTab: React.FC<{ isAdm: boolean; kids: string[] }> = ({ isAdm, kids: KIDS }) => {
  const [entries, setEntries] = useState<ActivityEntry[]>(() => loadJSON('familyos_activities_kids', []));
  const [showForm, setShowForm] = useState(false);
  const [kid, setKid] = useState(KIDS[0] || '');
  const [name, setName] = useState('');
  const [day, setDay] = useState('Monday');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  const save = (next: ActivityEntry[]) => { setEntries(next); saveJSON('familyos_activities_kids', next); };
  const add = () => {
    if (!name.trim()) return;
    save([...entries, { id: uid(), kid, name: name.trim(), day, time, location, createdAt: Date.now() }]);
    setName(''); setTime(''); setLocation(''); setShowForm(false);
  };
  const del = (id: string) => {
    if (isAdm) save(entries.filter(e => e.id !== id));
  };

  const byKid = (k: string) => entries.filter(e => !e.deletedAt && e.kid === k);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">Extracurricular schedule</span>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition"><Plus className="w-3.5 h-3.5" /> Add Activity</button>
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Kid</label>
              <select value={kid} onChange={e => setKid(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {KIDS.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Activity name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Soccer" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Day</label>
              <select value={day} onChange={e => setDay(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {DAYS_OF_WEEK.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Time</label>
              <input value={time} onChange={e => setTime(e.target.value)} placeholder="e.g. 4:00 PM" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Location</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. City Park Field 3" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1 rounded transition">Add</button>
          </div>
        </div>
      )}

      {KIDS.map((k, i) => {
        const kidActivities = byKid(k);
        return (
          <div key={k}>
            <div className={`text-sm font-semibold mb-2 ${i % 2 === 0 ? 'text-purple-400' : 'text-blue-400'}`}>{k}</div>
            {kidActivities.length === 0 && <div className="text-slate-600 text-xs mb-3">No activities scheduled.</div>}
            <div className="space-y-1.5 mb-3">
              {kidActivities.map(a => (
                <div key={a.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm">{a.name}</div>
                    <div className="text-slate-500 text-xs">{a.day}{a.time ? ` · ${a.time}` : ''}{a.location ? ` · ${a.location}` : ''}</div>
                  </div>
                  {isAdm && <button onClick={() => del(a.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const AllowanceTab: React.FC<{ isAdm: boolean; kids: string[] }> = ({ isAdm, kids: KIDS }) => {
  const [entries, setEntries] = useState<AllowanceEntry[]>(() => loadJSON('familyos_allowance', []));
  const [showForm, setShowForm] = useState(false);
  const [kid, setKid] = useState(KIDS[0] || '');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'earned' | 'spent'>('earned');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [filterKid, setFilterKid] = useState(KIDS[0] || '');

  const save = (next: AllowanceEntry[]) => { setEntries(next); saveJSON('familyos_allowance', next); };
  const add = () => {
    if (!amount || !reason.trim()) return;
    save([{ id: uid(), kid, amount: parseFloat(amount), type, reason: reason.trim(), date, createdAt: Date.now() }, ...entries]);
    setAmount(''); setReason(''); setShowForm(false);
  };
  const del = (id: string) => { if (isAdm) save(entries.filter(e => e.id !== id)); };

  const kidEntries = entries.filter(e => e.kid === filterKid);
  const balance = kidEntries.reduce((s, e) => e.type === 'earned' ? s + e.amount : s - e.amount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {KIDS.map(k => (
            <button key={k} onClick={() => setFilterKid(k)} className={`px-2.5 py-1 rounded-lg text-xs transition ${filterKid === k ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{k}</button>
          ))}
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition"><Plus className="w-3.5 h-3.5" /> Add Entry</button>
      </div>

      <div className={`bg-slate-800/40 border border-slate-700 rounded-xl p-3 flex justify-between items-center`}>
        <span className="text-slate-400 text-sm">{filterKid}'s balance</span>
        <span className={`text-2xl font-bold ${balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${balance.toFixed(2)}</span>
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Kid</label>
              <select value={kid} onChange={e => setKid(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {KIDS.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Type</label>
              <select value={type} onChange={e => setType(e.target.value as 'earned' | 'spent')} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                <option value="earned">Earned</option>
                <option value="spent">Spent</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Amount ($)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Reason</label>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Chores, Treat" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1 rounded transition">Save</button>
          </div>
        </div>
      )}

      {kidEntries.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No allowance entries.</div>}

      <div className="space-y-2">
        {kidEntries.map(e => (
          <div key={e.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-2.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${e.type === 'earned' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm">{e.reason}</div>
              <div className="text-slate-500 text-xs">{e.date}</div>
            </div>
            <span className={`font-semibold ${e.type === 'earned' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {e.type === 'earned' ? '+' : '-'}${e.amount.toFixed(2)}
            </span>
            {isAdm && <button onClick={() => del(e.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default KidsHub;
