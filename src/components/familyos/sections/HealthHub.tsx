import React, { useState } from 'react';
import { Plus, Trash2, Pill, Calendar, Heart } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

const FAMILY_MEMBERS = ['Daddy', 'Mommy', 'Abriana', 'Julia'];
const FREQUENCIES = ['Daily', 'Twice daily', 'Weekly', 'As needed', 'Other'];

interface Medication {
  id: string;
  person: string;
  name: string;
  dosage: string;
  frequency: string;
  nextRefill: string;
  notes: string;
  createdAt: number;
  deletedAt?: number;
}

interface Appointment {
  id: string;
  person: string;
  type: string;
  doctor: string;
  date: string;
  notes: string;
  createdAt: number;
  deletedAt?: number;
}

interface LucyEntry {
  id: string;
  type: 'vet' | 'flea' | 'heartworm' | 'walk' | 'other';
  date: string;
  notes: string;
  nextDue?: string;
  createdAt: number;
  deletedAt?: number;
}

const HealthHub: React.FC = () => {
  const { currentRole } = useAppContext();
  const [tab, setTab] = useState<'medications' | 'appointments' | 'lucy'>('medications');
  const isAdm = currentRole && canDelete(currentRole);

  const TABS = [
    { id: 'medications' as const, label: 'Medications', icon: Pill },
    { id: 'appointments' as const, label: 'Appointments', icon: Calendar },
    { id: 'lucy' as const, label: 'Lucy', icon: Heart },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Health Hub</h2>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${tab === t.id ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'medications' && <MedsTab isAdm={!!isAdm} />}
      {tab === 'appointments' && <ApptTab isAdm={!!isAdm} />}
      {tab === 'lucy' && <LucyTab isAdm={!!isAdm} />}
    </div>
  );
};

const MedsTab: React.FC<{ isAdm: boolean }> = ({ isAdm }) => {
  const [meds, setMeds] = useState<Medication[]>(() => loadJSON('familyos_medications', []));
  const [showForm, setShowForm] = useState(false);
  const [person, setPerson] = useState(FAMILY_MEMBERS[0]);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState(FREQUENCIES[0]);
  const [nextRefill, setNextRefill] = useState('');
  const [notes, setNotes] = useState('');
  const [filterPerson, setFilterPerson] = useState('All');

  const save = (next: Medication[]) => { setMeds(next); saveJSON('familyos_medications', next); };
  const add = () => {
    if (!name.trim()) return;
    save([...meds, { id: uid(), person, name: name.trim(), dosage, frequency, nextRefill, notes, createdAt: Date.now() }]);
    setName(''); setDosage(''); setNextRefill(''); setNotes(''); setShowForm(false);
  };
  const del = (id: string) => {
    if (isAdm) save(meds.map(m => m.id === id ? { ...m, deletedAt: Date.now() } : m));
  };

  const active = meds.filter(m => !m.deletedAt && (filterPerson === 'All' || m.person === filterPerson));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {['All', ...FAMILY_MEMBERS].map(p => (
            <button key={p} onClick={() => setFilterPerson(p)} className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition ${filterPerson === p ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{p}</button>
          ))}
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition ml-2"><Plus className="w-3.5 h-3.5" /> Add</button>
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Person</label>
              <select value={person} onChange={e => setPerson(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {FAMILY_MEMBERS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Medication name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Metformin" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Dosage</label>
              <input value={dosage} onChange={e => setDosage(e.target.value)} placeholder="e.g. 500mg" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Frequency</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Next refill</label>
              <input type="date" value={nextRefill} onChange={e => setNextRefill(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-rose-600 hover:bg-rose-500 text-white text-xs px-3 py-1 rounded transition">Save</button>
          </div>
        </div>
      )}

      {active.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No medications tracked.</div>}

      <div className="space-y-2">
        {active.map(med => {
          const refillSoon = med.nextRefill && new Date(med.nextRefill).getTime() - Date.now() < 7 * 86400000;
          return (
            <div key={med.id} className="flex items-start gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-900/40 border border-rose-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Pill className="w-4 h-4 text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium">{med.name}</div>
                <div className="text-slate-400 text-xs">{med.person} · {med.dosage} · {med.frequency}</div>
                {med.nextRefill && (
                  <div className={`text-xs mt-0.5 ${refillSoon ? 'text-amber-400' : 'text-slate-500'}`}>
                    Refill: {med.nextRefill}{refillSoon ? ' (soon!)' : ''}
                  </div>
                )}
                {med.notes && <div className="text-slate-500 text-xs">{med.notes}</div>}
              </div>
              {isAdm && <button onClick={() => del(med.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ApptTab: React.FC<{ isAdm: boolean }> = ({ isAdm }) => {
  const [appts, setAppts] = useState<Appointment[]>(() => loadJSON('familyos_appointments', []));
  const [showForm, setShowForm] = useState(false);
  const [person, setPerson] = useState(FAMILY_MEMBERS[0]);
  const [type, setType] = useState('Doctor');
  const [doctor, setDoctor] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');

  const save = (next: Appointment[]) => { setAppts(next); saveJSON('familyos_appointments', next); };
  const add = () => {
    if (!date) return;
    save([...appts, { id: uid(), person, type, doctor, date, notes, createdAt: Date.now() }].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    setDoctor(''); setDate(''); setNotes(''); setShowForm(false);
  };
  const del = (id: string) => {
    if (isAdm) save(appts.map(a => a.id === id ? { ...a, deletedAt: Date.now() } : a));
  };

  const active = appts.filter(a => !a.deletedAt);
  const upcoming = active.filter(a => new Date(a.date).getTime() >= Date.now() - 86400000).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const past = active.filter(a => new Date(a.date).getTime() < Date.now() - 86400000);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm">{upcoming.length} upcoming</span>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition"><Plus className="w-3.5 h-3.5" /> Add Appt</button>
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Who</label>
              <select value={person} onChange={e => setPerson(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {FAMILY_MEMBERS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Type</label>
              <input value={type} onChange={e => setType(e.target.value)} placeholder="Doctor, Dentist..." className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Doctor / Provider</label>
              <input value={doctor} onChange={e => setDoctor(e.target.value)} placeholder="Dr. Smith" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" autoFocus />
            </div>
            <div className="col-span-2">
              <label className="text-slate-400 text-xs mb-1 block">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-rose-600 hover:bg-rose-500 text-white text-xs px-3 py-1 rounded transition">Save</button>
          </div>
        </div>
      )}

      {active.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No appointments.</div>}

      <div className="space-y-2">
        {upcoming.map(a => {
          const daysUntil = Math.round((new Date(a.date).getTime() - Date.now()) / 86400000);
          return (
            <div key={a.id} className="flex items-start gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-900/40 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium">{a.type}</div>
                <div className="text-slate-400 text-xs">{a.person}{a.doctor ? ` · ${a.doctor}` : ''}</div>
                <div className="text-slate-400 text-xs">{a.date}{daysUntil === 0 ? ' · Today!' : daysUntil === 1 ? ' · Tomorrow' : daysUntil > 0 ? ` · ${daysUntil}d away` : ''}</div>
                {a.notes && <div className="text-slate-500 text-xs">{a.notes}</div>}
              </div>
              {isAdm && <button onClick={() => del(a.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          );
        })}
      </div>

      {past.length > 0 && (
        <div className="space-y-2">
          <div className="text-slate-600 text-xs uppercase tracking-wide">Past</div>
          {past.slice(-5).reverse().map(a => (
            <div key={a.id} className="flex items-center gap-3 bg-slate-900/30 border border-slate-800 rounded-xl px-3 py-2 opacity-50">
              <div className="flex-1 min-w-0">
                <div className="text-slate-400 text-sm">{a.person} · {a.type}</div>
                <div className="text-slate-500 text-xs">{a.date}</div>
              </div>
              {isAdm && <button onClick={() => del(a.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LUCY_TYPES: { id: LucyEntry['type']; label: string }[] = [
  { id: 'vet', label: 'Vet Visit' },
  { id: 'flea', label: 'Flea Med' },
  { id: 'heartworm', label: 'Heartworm Med' },
  { id: 'walk', label: 'Walk Log' },
  { id: 'other', label: 'Other' },
];

const LucyTab: React.FC<{ isAdm: boolean }> = ({ isAdm }) => {
  const [entries, setEntries] = useState<LucyEntry[]>(() => loadJSON('familyos_lucy', []));
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<LucyEntry['type']>('vet');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDue, setNextDue] = useState('');

  const save = (next: LucyEntry[]) => { setEntries(next); saveJSON('familyos_lucy', next); };
  const add = () => {
    if (!date) return;
    save([{ id: uid(), type, date, notes, nextDue, createdAt: Date.now() }, ...entries]);
    setDate(''); setNotes(''); setNextDue(''); setShowForm(false);
  };
  const del = (id: string) => {
    if (isAdm) save(entries.map(e => e.id === id ? { ...e, deletedAt: Date.now() } : e));
  };

  const active = entries.filter(e => !e.deletedAt);

  const lastFlea = active.find(e => e.type === 'flea');
  const lastHeartworm = active.find(e => e.type === 'heartworm');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-xs">
          <span className="text-slate-400">Last flea: <span className="text-amber-300">{lastFlea?.date || 'Unknown'}</span>{lastFlea?.nextDue ? ` · Next: ${lastFlea.nextDue}` : ''}</span>
        </div>
        <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white text-xs px-2.5 py-1.5 rounded-lg transition"><Plus className="w-3.5 h-3.5" /> Log</button>
      </div>

      <div className="text-xs text-slate-400">
        Last heartworm: <span className="text-amber-300">{lastHeartworm?.date || 'Unknown'}</span>{lastHeartworm?.nextDue ? ` · Next: ${lastHeartworm.nextDue}` : ''}
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Type</label>
              <select value={type} onChange={e => setType(e.target.value as LucyEntry['type'])} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none">
                {LUCY_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Next due (optional)</label>
              <input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-xs placeholder-slate-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 text-xs hover:text-white transition">Cancel</button>
            <button onClick={add} className="bg-rose-600 hover:bg-rose-500 text-white text-xs px-3 py-1 rounded transition">Save</button>
          </div>
        </div>
      )}

      {active.length === 0 && <div className="text-center text-slate-500 py-6 text-sm">No Lucy records yet.</div>}

      <div className="space-y-2">
        {active.map(e => {
          const typeLabel = LUCY_TYPES.find(t => t.id === e.type)?.label || e.type;
          return (
            <div key={e.id} className="flex items-start gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-3 py-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-900/40 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Heart className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm">{typeLabel}</div>
                <div className="text-slate-400 text-xs">{e.date}{e.nextDue ? ` · Next: ${e.nextDue}` : ''}</div>
                {e.notes && <div className="text-slate-500 text-xs">{e.notes}</div>}
              </div>
              {isAdm && <button onClick={() => del(e.id)} className="text-slate-600 hover:text-rose-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HealthHub;
