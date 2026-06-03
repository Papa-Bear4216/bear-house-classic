import React, { useState } from 'react';
import { Plus, Trash2, RotateCcw, AlertTriangle, Home, ScanLine } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import ChoreScanner from '@/components/familyos/ChoreScanner';

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

const CAT_COLORS: Record<Category, string> = {
  HVAC: 'blue',
  Plumbing: 'cyan',
  Electrical: 'yellow',
  Appliances: 'purple',
  Yard: 'green',
  Other: 'slate',
};

const HomeMaintenance: React.FC = () => {
  const { currentUser, currentRole } = useAppContext();
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

  // Auto-assign chore to family member based on type keywords
  const autoAssign = (chore: string): string => {
    const c = chore.toLowerCase();
    if (/lawn|yard|mow|trim|outdoor|gutter|fence|driveway|garage/.test(c)) return 'Daddy';
    if (/dish|laundry|vacuum|sweep|mop|clean|dust|wipe|bathroom|kitchen|cook/.test(c)) return 'Mommy';
    if (/litter|feed|walk|pet|lucy/.test(c)) return 'Julia';
    if (/trash|garbage|recycl/.test(c)) return 'Abriana';
    return 'Daddy'; // default
  };

  const handleScanSave = (detected: Array<{ id: string; chore: string; detail: string; priority: string; addedAt: number }>) => {
    // Save scanned chores as Tasks (household_tasks), NOT as home maintenance items
    const existingTasks = loadJSON<any[]>('household_tasks', []);
    const newTasks = detected.map(d => ({
      id: uid(),
      text: d.chore,
      person: autoAssign(d.chore),
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
  };

  return (
    <div className="space-y-4">
      {showScanner && (
        <ChoreScanner
          onClose={() => setShowScanner(false)}
          onSave={handleScanSave}
        />
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Home Maintenance</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowScanner(true)} className="flex items-center gap-1 bg-violet-600 hover:bg-violet-500 text-white text-sm px-3 py-1.5 rounded-lg transition">
            <ScanLine className="w-4 h-4" /> Scan Room
          </button>
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white text-sm px-3 py-1.5 rounded-lg transition">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {(['All', ...CATEGORIES] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${filterCat === cat ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Item / Task</label>
              <input value={item} onChange={e => setItem(e.target.value)} placeholder="e.g. Replace HVAC filter" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-green-500 outline-none" autoFocus />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as Category)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Last Done</label>
              <input type="date" value={lastDone} onChange={e => setLastDone(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Next Due</label>
              <input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm outline-none" />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 outline-none" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded transition">Cancel</button>
            <button onClick={addItem} className="bg-green-600 hover:bg-green-500 text-white text-sm px-4 py-1.5 rounded-lg transition">Add</button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !showForm && (
        <div className="text-center text-slate-500 py-8 text-sm">No maintenance items. Add one!</div>
      )}

      <div className="space-y-2">
        {filtered.map(i => {
          const overdue = isOverdue(i.nextDue);
          const color = CAT_COLORS[i.category];
          return (
            <div key={i.id} className={`bg-slate-800/40 border rounded-xl px-4 py-3 ${overdue ? 'border-rose-500/40' : 'border-slate-700'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg bg-${color}-900/40 border border-${color}-500/30 flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <Home className={`w-4 h-4 text-${color}-400`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium">{i.item}</span>
                    {overdue && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5">
                    <span className={`text-${color}-400`}>{i.category}</span>
                    {i.lastDone && <span> · Last: {i.lastDone}</span>}
                    {i.nextDue && <span className={overdue ? ' text-rose-400' : ''}> · Next: {i.nextDue}</span>}
                  </div>
                  {i.notes && <div className="text-slate-500 text-xs mt-1">{i.notes}</div>}
                </div>
                {isAdm && (
                  <button onClick={() => softDelete(i.id)} className="text-slate-600 hover:text-rose-400 transition flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isAdm && deleted.length > 0 && (
        <div className="space-y-2">
          <div className="text-slate-600 text-xs uppercase tracking-wide">Removed</div>
          {deleted.map(i => (
            <div key={i.id} className="flex items-center gap-3 bg-slate-900/20 border border-slate-800/50 rounded-xl px-4 py-2 opacity-40">
              <div className="flex-1 text-slate-500 text-sm line-through">{i.item}</div>
              <button onClick={() => restore(i.id)} className="text-slate-600 hover:text-amber-400 transition"><RotateCcw className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HomeMaintenance;
