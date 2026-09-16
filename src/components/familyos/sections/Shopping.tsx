import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, RotateCcw, ShoppingCart } from 'lucide-react';
import { loadJSON, saveJSON, uid, canDelete, householdPersons } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { useWriteQueued } from '@/lib/useWriteQueued';
import { useAppContext } from '@/contexts/AppContext';
import { openAmazonSearch, createAmazonSendQueue } from '@/lib/amazonCart';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { logActivity } from '@/lib/householdActivity';
import { autoArchiveOld } from '@/lib/autoArchive';
import { useSwipe } from '@/lib/useSwipe';
import { triggerConfetti } from '@/lib/confetti';

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

// One row, its own swipe-gesture state — swipe left to delete (mirrors the
// trash icon), swipe right to complete (mirrors the check button). Desktop/
// mouse users are unaffected; touch-only handlers, no click behavior changed.
interface SwipeableItemRowProps {
  children: React.ReactNode;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}
const SwipeableItemRow: React.FC<SwipeableItemRowProps> = ({ children, onSwipeLeft, onSwipeRight }) => {
  const { offsetX, onTouchStart, onTouchMove, onTouchEnd } = useSwipe({ onSwipeLeft, onSwipeRight });
  const bg = offsetX < -20 ? 'bg-rose-950/40 border-rose-500/40' : offsetX > 20 ? 'bg-emerald-950/40 border-emerald-500/40' : 'bg-slate-900/60 border-white/10';
  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.15s, background-color 0.15s' : 'none' }}
      className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 backdrop-blur-md transition-all hover:border-white/20 shadow-sm ${bg}`}
    >
      {children}
    </div>
  );
};

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

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

  // Auto-archive items completed 30+ days ago so "Completed" doesn't
  // silently accumulate forever — same soft-delete/restore mechanism as
  // the manual "Clear completed" button, just automatic.
  useEffect(() => {
    if (!currentUser) return;
    const { items: archived, archivedCount } = autoArchiveOld(items, currentUser.id);
    if (archivedCount > 0) save(archived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

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
    if (currentUser) logActivity(currentUser.name, `added "${item.name}" to shopping`);
    setName('');
    setQuantity('1');
    setShowForm(false);
  };

  const toggleComplete = (id: string) => {
    const item = items.find(i => i.id === id);
    const completing = item && !item.completed;
    save(items.map(i => i.id === id ? { ...i, completed: !i.completed, completedAt: i.completed ? undefined : Date.now() } : i));
    if (completing) {
      triggerConfetti(window.innerWidth / 2, window.innerHeight * 0.4, 45);
      if (currentUser && item) logActivity(currentUser.name, `checked off "${item.name}"`);
    }
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

  const startEdit = (item: ShoppingItem) => { setEditingId(item.id); setEditText(item.name); };
  const saveEdit = () => {
    const text = editText.trim();
    if (editingId && text) save(items.map(i => i.id === editingId ? { ...i, name: text } : i));
    setEditingId(null);
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <ShoppingCart className="w-3 h-3 text-emerald-400" /> Household Supplies
            </span>
            {pendingSync && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full" title="You're offline — this will sync when you reconnect.">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Offline — will sync
              </span>
            )}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Shopping <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">List</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Instant sync, Amazon export, and fast swipe triage.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdm && completed.length > 0 && (
            <button
              onClick={clearCompleted}
              className="text-xs text-slate-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/40 px-3 py-2 rounded-xl transition-all font-medium"
            >
              Clear completed
            </button>
          )}
          {active.length > 0 && !sendQueue && (
            <button
              onClick={() => setSendQueue(createAmazonSendQueue(active.map(i => i.name)))}
              title="Step through your list, opening one Amazon search tab at a time"
              className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-all shadow-md shadow-amber-500/20 active:scale-95"
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Send to Amazon
            </button>
          )}
          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-all shadow-md shadow-emerald-500/20 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" /> Add Item
          </button>
        </div>
      </div>

      {/* Amazon send-list step-through */}
      {sendQueue && (
        <div className="bg-gradient-to-r from-amber-950/40 to-orange-950/40 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-lg">
          <div className="text-sm text-amber-200">
            {lastSent && <span className="block text-xs text-amber-300/80 mb-0.5 font-medium">Opened tab: {lastSent}</span>}
            <span className="font-semibold">
              {sendQueue.remaining.length > 0
                ? `${sendQueue.remaining.length} item(s) left to send to Amazon`
                : 'All items sent to Amazon!'}
            </span>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {sendQueue.remaining.length > 0 ? (
              <button
                onClick={() => { const sent = sendQueue.openNext(); if (sent) setLastSent(sent); setSendQueue({ ...sendQueue }); }}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-all shadow-md shadow-amber-500/25 active:scale-95"
              >
                Open next
              </button>
            ) : (
              <button
                onClick={() => { setSendQueue(null); setLastSent(''); }}
                className="bg-white/10 hover:bg-white/15 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-all"
              >
                Done
              </button>
            )}
            <button
              onClick={() => { setSendQueue(null); setLastSent(''); }}
              className="text-amber-300/70 hover:text-white text-xs px-2.5 py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 bg-white/[0.02] p-1.5 rounded-2xl border border-white/5">
        {CATEGORIES.map(cat => {
          const count = items.filter(i => i.category === cat && !i.completed && !i.deletedAt).length;
          const isSelected = activeTab === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{cat}</span>
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  isSelected ? 'bg-black/20 text-white' : 'bg-white/10 text-slate-300'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">Item name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                placeholder="e.g. Oat Milk, Tide Pods, Fresh Apples..."
                className="w-full bg-white/[0.04] border border-white/10 focus:border-emerald-500 focus:bg-white/[0.07] rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 outline-none transition-all shadow-inner"
                autoFocus
              />
              {name.trim() && guessCategory(name.trim(), activeTab) !== activeTab && (
                <div className="text-amber-300/90 text-xs mt-1.5 font-medium flex items-center gap-1">
                  ✨ Will be categorized as <span className="underline font-semibold">{guessCategory(name.trim(), activeTab)}</span>
                </div>
              )}
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">Qty</label>
              <input
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="1"
                className="w-full bg-white/[0.04] border border-white/10 focus:border-emerald-500 focus:bg-white/[0.07] rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-500 outline-none transition-all shadow-inner"
              />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5 block">Assigned to</label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-all"
              >
                {PERSONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-white text-xs font-medium px-4 py-2 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={addItem}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-500/20 active:scale-95"
            >
              Add Item
            </button>
          </div>
        </div>
      )}

      {/* Active items */}
      <div className="space-y-2.5">
        {active.length === 0 && completed.length === 0 && deleted.length === 0 && (
          <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-2xl p-10 text-center text-slate-400">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ShoppingCart className="w-7 h-7 text-emerald-400" />
            </div>
            <p className="font-bold text-white text-base">Shopping list is clear</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              No pending items in {activeTab}. Add an item or let Hermes auto-populate low pantry stock!
            </p>
          </div>
        )}
        {active.map(item => (
          <SwipeableItemRow
            key={item.id}
            onSwipeLeft={() => { if (isAdm) softDelete(item.id); }}
            onSwipeRight={() => toggleComplete(item.id)}
          >
            <button
              onClick={() => toggleComplete(item.id)}
              title="Check off item"
              className="text-slate-400 hover:text-emerald-400 hover:scale-110 active:scale-90 transition-all flex-shrink-0"
            >
              <Circle className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              {editingId === item.id ? (
                <input
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                  autoFocus
                  className="w-full bg-white/[0.05] border border-emerald-500 rounded-lg px-2.5 py-1 text-white text-sm outline-none"
                />
              ) : (
                <button
                  onClick={() => startEdit(item)}
                  className="text-white text-sm font-semibold tracking-tight text-left hover:text-emerald-300 transition-colors"
                  title="Click to edit"
                >
                  {item.name}
                </button>
              )}
              <div className="text-slate-400 text-xs flex gap-2 mt-1">
                {item.quantity !== '1' && (
                  <span className="bg-white/5 border border-white/5 px-2 py-0.5 rounded-full text-[11px] font-medium text-slate-300">
                    Qty: {item.quantity}
                  </span>
                )}
                {item.assignedTo !== 'Anyone' && (
                  <span className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[11px] font-medium text-emerald-300">
                    For: {item.assignedTo}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => openAmazonSearch(item.name)}
              title="Search this item on Amazon"
              className="text-slate-400 hover:text-amber-400 hover:scale-110 transition-all flex-shrink-0 p-1.5 rounded-lg hover:bg-white/5"
            >
              <ShoppingCart className="w-4 h-4" />
            </button>
            {isAdm && (
              <button
                onClick={() => softDelete(item.id)}
                title="Remove item"
                className="text-slate-500 hover:text-rose-400 hover:scale-110 transition-all flex-shrink-0 p-1.5 rounded-lg hover:bg-white/5"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </SwipeableItemRow>
        ))}
      </div>

      {/* Completed */}
      {completed.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
            Completed ({completed.length})
          </div>
          {completed.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3.5 bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 opacity-60 hover:opacity-90 transition-opacity"
            >
              <button
                onClick={() => toggleComplete(item.id)}
                title="Mark uncompleted"
                className="text-emerald-400 transition flex-shrink-0 hover:scale-110"
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-slate-400 text-sm line-through font-medium">{item.name}</div>
              </div>
              {isAdm && (
                <button
                  onClick={() => softDelete(item.id)}
                  title="Remove item"
                  className="text-slate-500 hover:text-rose-400 transition flex-shrink-0 p-1 rounded-lg hover:bg-white/5"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Deleted items (admin only) */}
      {isAdm && deleted.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
            Recently Removed ({deleted.length})
          </div>
          {deleted.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-3 bg-white/[0.01] border border-white/5 rounded-xl px-4 py-2 opacity-40 hover:opacity-75 transition-opacity"
            >
              <div className="flex-1 min-w-0">
                <div className="text-slate-500 text-sm line-through">{item.name}</div>
              </div>
              <button
                onClick={() => restore(item.id)}
                title="Restore item"
                className="text-slate-400 hover:text-amber-400 transition flex-shrink-0 p-1"
              >
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

