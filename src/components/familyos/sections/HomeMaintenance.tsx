import React, { useState, useEffect } from 'react';
import { Plus, Trash2, RotateCcw, AlertTriangle, Home, ScanLine, Wrench } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, householdPersons } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { useAppContext } from '@/contexts/AppContext';
import { logActivity } from '@/lib/householdActivity';
import { triggerConfetti } from '@/lib/confetti';
import ChoreScanner from '@/components/familyos/ChoreScanner';
import CameraViewer from '@/components/familyos/CameraViewer';

const STORAGE_KEY = 'familyos_home_maintenance';
const CATEGORIES = ['HVAC', 'Plumbing', 'Electrical', 'Appliances', 'Yard', 'Other'] as const;
type Category = typeof CATEGORIES[number];

interface HomeItem {
  id: string;
  item: string;
  category: Category;
  lastDone: string;
  nextDue: string;
  notes: string;
  createdAt: number;
  deletedAt?: number;
  deletedBy?: string;
}

const CAT_STYLES: Record<Category, { icon: string; badge: string; text: string }> = {
  HVAC: { icon: 'bg-blue-500/15 border border-blue-500/30', badge: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-400' },
  Plumbing: { icon: 'bg-cyan-500/15 border border-cyan-500/30', badge: 'bg-cyan-500/10 border-cyan-500/30', text: 'text-cyan-400' },
  Electrical: { icon: 'bg-amber-500/15 border border-amber-500/30', badge: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400' },
  Appliances: { icon: 'bg-purple-500/15 border border-purple-500/30', badge: 'bg-purple-500/10 border-purple-500/30', text: 'text-purple-400' },
  Yard: { icon: 'bg-emerald-500/15 border border-emerald-500/30', badge: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400' },
  Other: { icon: 'bg-slate-800 border border-slate-700', badge: 'bg-slate-800 border-slate-700', text: 'text-slate-400' },
};

const HomeMaintenance: React.FC = () => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const persons = householdPersons(householdMembers).filter((p) => p !== 'Family' && p !== 'General');
  const [items, setItems] = useState<HomeItem[]>(() => loadJSON(STORAGE_KEY, []));
  const [showForm, setShowForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [filterCat, setFilterCat] = useState<Category | 'All'>('All');

  const [item, setItem] = useState('');
  const [category, setCategory] = useState<Category>('HVAC');
  const [lastDone, setLastDone] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [notes, setNotes] = useState('');

  const isAdm = currentRole && canDelete(currentRole);
  const save = (next: HomeItem[]) => { setItems(next); saveJSON(STORAGE_KEY, next); };

  useEffect(() => {
    return onSyncUpdate((key) => {
      if (key !== STORAGE_KEY && key !== '*') return;
      setItems(loadJSON(STORAGE_KEY, []));
    });
  }, []);

  const addItem = () => {
    if (!item.trim()) return;
    const newItem: HomeItem = {
      id: uid(),
      item: item.trim(),
      category,
      lastDone,
      nextDue,
      notes,
      createdAt: Date.now(),
    };
    save([newItem, ...items]);
    if (currentUser) logActivity(currentUser.name, `logged home maintenance: "${newItem.item}"`);
    triggerConfetti(undefined, undefined, 20);
    setItem(''); setLastDone(''); setNextDue(''); setNotes(''); setShowForm(false);
  };

  const softDelete = (id: string) => {
    if (!currentUser || !isAdm) return;
    save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now(), deletedBy: currentUser.id } : i));
  };

  const restore = (id: string) => {
    if (!isAdm) return;
    save(items.map(i => i.id === id ? { ...i, deletedAt: undefined, deletedBy: undefined } : i));
  };

  const isOverdue = (nextDue: string) => {
    if (!nextDue) return false;
    return new Date(nextDue).getTime() < Date.now();
  };

  const active = items.filter(i => !i.deletedAt);
  const filtered = filterCat === 'All' ? active : active.filter(i => i.category === filterCat);
  const deleted = items.filter(i => !!i.deletedAt);

  let autoAssignCursor = 0;
  const autoAssign = (): string => {
    if (persons.length === 0) return 'General';
    const assignee = persons[autoAssignCursor % persons.length];
    autoAssignCursor++;
    return assignee;
  };

  const handleScanSave = (detected: Array<{ id: string; chore: string; detail: string; priority: string; addedAt: number }>) => {
    const existingTasks = loadJSON<any[]>('household_tasks', []);
    const newTasks = detected.map(d => ({
      id: uid(),
      text: d.chore,
      person: autoAssign(),
      priority: d.priority === 'high' ? 'High' : d.priority === 'low' ? 'Low' : 'Medium',
      category: 'Maintenance',
      dueEstimate: 'Today',
      dueDate: null,
      completed: false,
      createdAt: d.addedAt,
      notes: d.detail,
      source: 'chore_scanner',
    }));
    saveJSON('household_tasks', [...newTasks, ...existingTasks]);
    triggerConfetti(undefined, undefined, 40);
  };

  return (
    <div className="space-y-6">
      {showScanner && (
        <ChoreScanner
          onClose={() => setShowScanner(false)}
          onSave={handleScanSave}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm shadow-cyan-500/10">
              <Wrench className="w-5 h-5" />
            </div>
            Home Maintenance
          </h2>
          <p className="text-xs text-slate-400 mt-1">Prevent breakdowns with scheduled upkeep</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowScanner(true)} 
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-lg shadow-purple-500/20 focus-ring"
          >
            <ScanLine className="w-4 h-4" /> Scan Room
          </button>
          <button 
            onClick={() => setShowForm(f => !f)} 
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-lg shadow-cyan-500/20 focus-ring"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      <CameraViewer />

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {(['All', ...CATEGORIES] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition active:scale-95 focus-ring ${
              filterCat === cat 
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' 
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800/80 hover:border-slate-700/80'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="font-semibold text-sm text-cyan-400 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Schedule Maintenance Item
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-1 sm:col-span-2">
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Item / Task</label>
              <input 
                value={item} 
                onChange={e => setItem(e.target.value)} 
                placeholder="e.g. Replace HVAC air filters, flush water heater" 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition" 
                autoFocus 
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Category</label>
              <select 
                value={category} 
                onChange={e => setCategory(e.target.value as Category)} 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Last Done</label>
              <input 
                type="date" 
                value={lastDone} 
                onChange={e => setLastDone(e.target.value)} 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition" 
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Next Due</label>
              <input 
                type="date" 
                value={nextDue} 
                onChange={e => setNextDue(e.target.value)} 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition" 
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1 block">Notes</label>
              <input 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                placeholder="Model numbers, filter sizes, etc." 
                className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition" 
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button 
              onClick={() => setShowForm(false)} 
              className="text-slate-400 hover:text-white text-xs font-medium px-4 py-2 rounded-xl transition focus-ring"
            >
              Cancel
            </button>
            <button 
              onClick={addItem} 
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs px-5 py-2 rounded-xl transition shadow-lg shadow-cyan-500/20 focus-ring"
            >
              Add Item
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !showForm && (
        <div className="text-center bg-slate-900/40 border border-slate-800/60 rounded-2xl py-12 px-4">
          <Home className="w-10 h-10 text-slate-600 mx-auto mb-3 opacity-60" />
          <p className="text-slate-400 font-medium text-sm">No maintenance items found.</p>
          <p className="text-slate-500 text-xs mt-1">Add items or scan rooms to track what needs regular servicing.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {filtered.map(i => {
          const overdue = isOverdue(i.nextDue);
          const style = CAT_STYLES[i.category];
          return (
            <div 
              key={i.id} 
              className={`bg-slate-900/60 backdrop-blur-md border rounded-2xl px-4 py-3.5 shadow-md transition group ${
                overdue ? 'border-rose-500/40 bg-rose-500/5' : 'border-slate-800/80 hover:border-slate-700/80'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className={`w-9 h-9 rounded-xl ${style.icon} flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm`}>
                  <Home className={`w-4 h-4 ${style.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-semibold truncate">{i.item}</span>
                    {overdue && (
                      <span className="flex items-center gap-1 text-[10px] text-rose-300 bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 rounded-full font-bold animate-pulse">
                        <AlertTriangle className="w-2.5 h-2.5" /> OVERDUE
                      </span>
                    )}
                  </div>
                  <div className="text-slate-400 text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`font-medium ${style.text}`}>{i.category}</span>
                    {i.lastDone && <span>· Last: {i.lastDone}</span>}
                    {i.nextDue && <span className={overdue ? 'text-rose-400 font-medium' : ''}>· Next: {i.nextDue}</span>}
                  </div>
                  {i.notes && <div className="text-slate-400/80 text-xs mt-1.5 bg-slate-800/50 rounded-lg px-2.5 py-1 inline-block border border-slate-700/40">{i.notes}</div>}
                </div>
                {isAdm && (
                  <button 
                    onClick={() => softDelete(i.id)} 
                    className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-slate-500 hover:text-rose-400 transition active:scale-95 flex-shrink-0 focus-ring opacity-60 group-hover:opacity-100"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isAdm && deleted.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-slate-600 text-xs font-bold uppercase tracking-wider">Archived Items</div>
          <div className="space-y-1.5">
            {deleted.map(i => (
              <div key={i.id} className="flex items-center gap-3 bg-slate-900/20 border border-slate-800/30 rounded-xl px-3.5 py-2 opacity-40 hover:opacity-75 transition">
                <div className="flex-1 text-slate-500 text-xs line-through">{i.item}</div>
                <button 
                  onClick={() => restore(i.id)} 
                  className="text-slate-500 hover:text-cyan-400 transition focus-ring p-1"
                  title="Restore item"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeMaintenance;
