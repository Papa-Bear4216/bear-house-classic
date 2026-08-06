import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, RotateCcw, ShoppingCart } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, householdPersons } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { useWriteQueued } from '@/lib/useWriteQueued';
import { useAppContext } from '@/contexts/AppContext';
import { openAmazonSearch, createAmazonSendQueue } from '@/lib/amazonCart';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

const STORAGE_KEY = 'familyos_shopping';
const CATEGORIES = ['Groceries', 'Household', 'School', 'Other'] as const;
type Category = typeof CATEGORIES[number];

// Lightweight keyword guess so typing "tide pods" while on the Groceries tab
// still lands in Household — no AI call needed for something this cheap to
// pattern-match. Falls back to whatever tab is active if nothing matches.
const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  Groceries: ['milk', 'eggs', 'bread', 'produce', 'meat', 'chicken', 'cheese', 'fruit', 'vegetable', 'snack', 'cereal', 'juice', 'coffee', 'rice', 'pasta'],
  Household: ['soap', 'detergent', 'tide', 'paper towel', 'toilet paper', 'trash bag', 'cleaner', 'bleach', 'batteries', 'light bulb', 'filter'],
  School: ['notebook', 'pencil', 'folder', 'backpack', 'glue', 'crayon', 'binder', 'homework'],
  Other: [],
};

function guessCategory(itemName: string, fallback: Category): Category {
  const lower = itemName.toLowerCase();
  for (const cat of CATEGORIES) {
    if (CATEGORY_KEYWORDS[cat].some(kw => lower.includes(kw))) return cat;
  }
  return fallback;
}

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

const Shopping: React.FC = () => {
  const { currentUser, currentRole, householdMembers } = useAppContext();
  const { toast } = useToast();
  const PERSONS = ['Anyone', ...householdPersons(householdMembers).filter((p) => p !== 'Family' && p !== 'General')];
  const [items, setItems] = useState<ShoppingItem[]>(() => loadJSON(STORAGE_KEY, []));
  const [activeTab, setActiveTab] = useState<Category>('Groceries');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [assignedTo, setAssignedTo] = useState('Anyone');
  const [showForm, setShowForm] = useState(false);
  const [sendQueue, setSendQueue] = useState<{ remaining: string[]; openNext: () => string | null } | null>(null);
  const [lastSent, setLastSent] = useState('');

  const save = (next: ShoppingItem[]) => {
    setItems(next);
    saveJSON(STORAGE_KEY, next);
  };

  useEffect(() => {
    return onSyncUpdate((key) => {
      if (key !== STORAGE_KEY && key !== '*') return;
      setItems(loadJSON(STORAGE_KEY, []));
    });
  }, []);

  const addItem = () => {
    if (!name.trim()) return;
    const item: ShoppingItem = {
      id: uid(),
      name: name.trim(),
      category: guessCategory(name.trim(), activeTab),
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
    const item = items.find(i => i.id === id);
    save(items.map(i => i.id === id ? { ...i, deletedAt: Date.now(), deletedBy: currentUser.id } : i));
    if (item) {
      toast({
        description: `Removed "${item.name}"`,
        action: <ToastAction altText="Undo" onClick={() => restore(id)}>Undo</ToastAction>,
      });
    }
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
  const pendingSync = useWriteQueued(STORAGE_KEY);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Shopping List</h2>
        {pendingSync && (
          <span className="inline-flex items-center gap-1 text-xs text-honey-400/90 bg-honey-400/10 border border-honey-400/30 px-2 py-0.5 rounded-full ml-2" title="You're offline — this will sync when you reconnect.">
            <span className="w-1.5 h-1.5 rounded-full bg-honey-400 animate-pulse" /> Offline — will sync
          </span>
        )}
        <div className="flex gap-2">
          {isAdm && completed.length > 0 && (
            <button onClick={clearCompleted} className="text-xs text-cream-400/60 hover:text-rose-400 border border-cream-400/10 hover:border-rose-500/40 px-2 py-1 rounded transition focus-ring">
              Clear completed
            </button>
          )}
          {active.length > 0 && !sendQueue && (
            <button
              onClick={() => setSendQueue(createAmazonSendQueue(active.map(i => i.name)))}
              title="Step through your list, opening one Amazon search tab at a time — pick the exact product yourself"
              className="flex items-center gap-1 bg-orange-700 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded-lg transition focus-ring"
            >
              <ShoppingCart className="w-4 h-4" /> Send list to Amazon
            </button>
          )}
          <button onClick={() => setShowForm(f => !f)} className="flex items-center gap-1 bg-sage-600 hover:bg-sage-500 text-white text-sm px-3 py-1.5 rounded-lg transition focus-ring">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      </div>

      {/* Amazon send-list step-through — one tab at a time, browsers block
          rapid multi-tab opens as popup spam */}
      {sendQueue && (
        <div className="bg-orange-950/40 border border-orange-700/40 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="text-sm text-orange-200">
            {lastSent && <span className="block text-xs text-orange-300/70 mb-0.5">Opened: {lastSent}</span>}
            {sendQueue.remaining.length > 0
              ? `${sendQueue.remaining.length} item(s) left to send`
              : 'All items sent.'}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {sendQueue.remaining.length > 0 ? (
              <button
                onClick={() => { const sent = sendQueue.openNext(); if (sent) setLastSent(sent); setSendQueue({ ...sendQueue }); }}
                className="bg-orange-600 hover:bg-orange-500 text-white text-sm px-3 py-1.5 rounded-lg transition focus-ring"
              >
                Open next
              </button>
            ) : (
              <button
                onClick={() => { setSendQueue(null); setLastSent(''); }}
                className="bg-bark-700 hover:bg-bark-600 text-white text-sm px-3 py-1.5 rounded-lg transition focus-ring"
              >
                Done
              </button>
            )}
            <button
              onClick={() => { setSendQueue(null); setLastSent(''); }}
              className="text-orange-300/60 hover:text-white text-sm px-2 py-1.5 transition focus-ring"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition focus-ring ${activeTab === cat ? 'bg-sage-600 text-white' : 'bg-bark-700 text-cream-400/60 hover:text-white'}`}
          >
            {cat}
            <span className="ml-1.5 text-xs opacity-70">{items.filter(i => i.category === cat && !i.completed && !i.deletedAt).length || ''}</span>
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-bark-700/60 border border-cream-400/10 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Item name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="e.g. Milk, Tide Pods..."
                className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm placeholder-cream-400/50 focus:border-sage-500 outline-none"
                autoFocus
              />
              {name.trim() && guessCategory(name.trim(), activeTab) !== activeTab && (
                <div className="text-honey-400/80 text-xs mt-1">
                  Will be added to {guessCategory(name.trim(), activeTab)}
                </div>
              )}
            </div>
            <div>
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Qty</label>
              <input
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="1"
                className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm placeholder-cream-400/50 focus:border-sage-500 outline-none"
              />
            </div>
            <div>
              <label className="text-cream-400/60 text-xs uppercase tracking-wide mb-1 block">Assigned to</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm focus:border-sage-500 outline-none"
              >
                {PERSONS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-cream-400/60 hover:text-white text-sm px-3 py-1.5 rounded transition focus-ring">Cancel</button>
            <button onClick={addItem} className="bg-sage-600 hover:bg-sage-500 text-white text-sm px-4 py-1.5 rounded-lg transition focus-ring">Add Item</button>
          </div>
        </div>
      )}

      {/* Active items */}
      <div className="space-y-2">
        {active.length === 0 && completed.length === 0 && deleted.length === 0 && (
          <div className="text-center text-cream-400/50 py-8 text-sm">No items in {activeTab}. Add something!</div>
        )}
        {active.map(item => (
          <div key={item.id} className="flex items-center gap-3 bg-bark-700/40 border border-cream-400/10 rounded-xl px-4 py-3">
            <button onClick={() => toggleComplete(item.id)} className="text-cream-400/60 hover:text-sage-500 transition flex-shrink-0 focus-ring">
              <Circle className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium">{item.name}</div>
              <div className="text-cream-400/50 text-xs flex gap-2">
                {item.quantity !== '1' && <span>Qty: {item.quantity}</span>}
                {item.assignedTo !== 'Anyone' && <span>For: {item.assignedTo}</span>}
              </div>
            </div>
            <button
              onClick={() => openAmazonSearch(item.name)}
              title="Search this item on Amazon"
              className="text-cream-400/40 hover:text-orange-400 transition flex-shrink-0 focus-ring"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
            {isAdm && (
              <button onClick={() => softDelete(item.id)} className="text-cream-400/40 hover:text-rose-400 transition flex-shrink-0 focus-ring">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-2">
          <div className="text-cream-400/50 text-xs uppercase tracking-wide">Completed ({completed.length})</div>
          {completed.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-bark-800/40 border border-bark-700 rounded-xl px-4 py-3 opacity-60">
              <button onClick={() => toggleComplete(item.id)} className="text-sage-500 transition flex-shrink-0 focus-ring">
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-cream-400/60 text-sm line-through">{item.name}</div>
              </div>
              {isAdm && (
                <button onClick={() => softDelete(item.id)} className="text-cream-400/40 hover:text-rose-400 transition flex-shrink-0 focus-ring">
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
          <div className="text-cream-400/40 text-xs uppercase tracking-wide">Removed ({deleted.length})</div>
          {deleted.map(item => (
            <div key={item.id} className="flex items-center gap-3 bg-bark-800/20 border border-bark-700/50 rounded-xl px-4 py-2 opacity-40">
              <div className="flex-1 min-w-0">
                <div className="text-cream-400/50 text-sm line-through">{item.name}</div>
              </div>
              <button onClick={() => restore(item.id)} className="text-cream-400/40 hover:text-honey-400 transition flex-shrink-0 focus-ring">
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
