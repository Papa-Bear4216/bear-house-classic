import React, { useState } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, RotateCcw } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';

const STORAGE_KEY = 'familyos_shopping';
const CATEGORIES = ['Groceries', 'Household', 'School', 'Other'] as const;
type Category = typeof CATEGORIES[number];

interface ShoppingItem {
  id: string;
  name: string;
  category: Category;
  assignedTo: string;
  quantity: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  deletedAt?: number;
  deletedBy?: string;
}

const PERSONS = ['Anyone', 'Daddy', 'Mommy', 'Abriana', 'Julia'];

const Shopping: React.FC = () => {
  const { currentUser, currentRole } = useAppContext();
  const [items, setItems] = useState<ShoppingItem[]>(() => loadJSON(STORAGE_KEY, []));
  const [activeTab, setActiveTab] = useState<Category>('Groceries');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [assignedTo, setAssignedTo] = useState('Anyone');
  const [showForm, setShowForm] = useState(false);

  const save = (next: ShoppingItem[]) => {
    setItems(next);
    saveJSON(STORAGE_KEY, next);
  };

  const addItem = () => {
    if (!name.trim()) return;
    const item: ShoppingItem = {
      id: uid(),
      name: name.trim(),
      category: activeTab,
      assignedTo,
      quantity,
      completed: false,
      createdAt: Date.now(),
    };
    save([item, ...items]);
    setName('');
    setQuantity('1');
    setShowForm(false);
  };

  const toggleComplete = (id: string) => {
    save(items.map(i => i.id === id ? { ...i, completed: !i.completed, completedAt: i.completed ? undefined : Date.now() } : i));
  };

  const softDelete = (id: string) => {
    if (!currentUser || !canDelete(currentRole!)) return;
    save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now(), deletedBy: currentUser.id } : i));
  };

  const restore = (id: string) => {
    if (!currentUser || !canDelete(currentRole!)) return;
    save(items.map(i => i.id === id ? { ...i, deletedAt: undefined, deletedBy: undefined } : i));
  };

  const clearCompleted = () => {
    if (!currentRole || !canDelete(currentRole)) return;
    save(items.filter(i => !i.completed || i.deletedAt));
  };

  const visible = items.filter(i => i.category === activeTab);
  const active = visible.filter(i => !i.completed && !i.deletedAt);
  const completed = visible.filter(i => i.completed && !i.deletedAt);
  const deleted = visible.filter(i => !!i.deletedAt);
  const isAdm = currentRole && canDelete(currentRole);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Shopping List</h2>
        <div className="flex gap-2">
          {isAdm && completed.length > 0 && (
            <button onClick={clearCompleted} className="text-xs text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 px-2 py-1 rounded transition">
              Clear completed
            </button>
          )}
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 py-1.5 rounded-lg transition">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${activeTab === cat ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            {cat}
            <span className="ml-1.5 text-xs opacity-70">{items.filter(i => i.category === cat && !i.completed && !i.deletedAt).length || ''}</span>
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Item name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="e.g. Milk, Tide Pods..."
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-emerald-500 outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Qty</label>
              <input
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="1"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs uppercase tracking-wide mb-1 block">Assigned to</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none"
              >
                {PERSONS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white text-sm px-3 py-1.5 rounded transition">Cancel</button>
            <button onClick={addItem} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-1.5 rounded-lg transition">Add Item</button>
          </div>
        </div>
      )}

      {/* Active items */}
      <div className="space-y-2">
        {active.length === 0 && completed.length === 0 && deleted.length === 0 && (
          <div className="text-center text-slate-500 py-8 text-sm">No items in {activeTab}. Add something!</div>
        )}
        {active.map(item => (
          <div key={item.id} className="flex items-center gap-3 bg-slate-800/40 border border-slate-700 rounded-xl px-4 py-3">
            <button onClick={() => toggleComplete(item.id)} className="text-slate-400 hover:text-emerald-400 transition flex-shrink-0">
              <Circle className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium">{item.name}</div>
              <div className="text-slate-500 text-xs flex gap-2">
                {item.quantity !== '1' && <span>Qty: {item.quantity}</span>}
                {item.assignedTo !== 'Anyone' && <span>For: {item.assignedTo}</span>}
              </div>
            </div>
            {isAdm && (
              <button onClick={() => softDelete(item.id)} className="text-slate-600 hover:text-rose-400 transition flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-2">
          <div className="text-slate-500 text-xs uppercase tracking-wide">Completed ({completed.length})</div>
          {completed.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 opacity-60">
              <button onClick={() => toggleComplete(item.id)} className="text-emerald-500 transition flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-slate-400 text-sm line-through">{item.name}</div>
              </div>
              {isAdm && (
                <button onClick={() => softDelete(item.id)} className="text-slate-600 hover:text-rose-400 transition flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Deleted items (admin only) */}
      {isAdm && deleted.length > 0 && (
        <div className="space-y-2">
          <div className="text-slate-600 text-xs uppercase tracking-wide">Removed ({deleted.length})</div>
          {deleted.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-slate-900/20 border border-slate-800/50 rounded-xl px-4 py-2 opacity-40">
              <div className="flex-1 min-w-0">
                <div className="text-slate-500 text-sm line-through">{item.name}</div>
              </div>
              <button onClick={() => restore(item.id)} className="text-slate-600 hover:text-amber-400 transition flex-shrink-0">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Shopping;
