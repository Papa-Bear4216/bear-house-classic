import React, { useState, useEffect } from 'react';
import { Plus, Minus, Trash2, Package, ScanLine } from 'lucide-react';
import { loadPantry, savePantry, uid, PANTRY_CATEGORY_EMOJI, mergeIntoPantry, isAdmin, type PantryItem, type PantryCategory } from '@/lib/familyos';
import { onSyncUpdate } from '@/lib/sync';
import { useWriteQueued } from '@/lib/useWriteQueued';
import { useAppContext } from '@/contexts/AppContext';
import { triggerConfetti } from '@/lib/confetti';
import ReceiptScanner from '@/components/familyos/ReceiptScanner';

const STORAGE_KEY = 'familyos_pantry';

const CATEGORY_ORDER: PantryCategory[] = [
  'produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'personal-care', 'other',
];

const Pantry: React.FC = () => {
  const { currentRole } = useAppContext();
  const canEdit = !!currentRole && isAdmin(currentRole);
  const [items, setItems] = useState<PantryItem[]>(() => loadPantry());
  const [showForm, setShowForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState<PantryCategory>('pantry');

  const save = (next: PantryItem[]) => { setItems(next); savePantry(next); };

  // Reconcile with cross-device updates and offline-queue flushes.
  useEffect(() => {
    return onSyncUpdate((key) => {
      if (key !== STORAGE_KEY && key !== '*') return;
      setItems(loadPantry());
    });
  }, []);

  const pendingSync = useWriteQueued(STORAGE_KEY);

  const addItem = () => {
    if (!name.trim()) return;
    const item: PantryItem = {
      id: uid(), name: name.trim(), quantity: parseFloat(quantity) || 0, unit: unit.trim(),
      category, updatedAt: Date.now(),
    };
    save([item, ...items]);
    setName(''); setQuantity('1'); setUnit(''); setShowForm(false);
    triggerConfetti(undefined, undefined, 20);
  };

  const adjustQty = (id: string, delta: number) => {
    save(items.map((i) => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta), updatedAt: Date.now() } : i));
  };

  const removeItem = (id: string) => {
    save(items.filter((i) => i.id !== id));
  };

  const handleScanSave = (scanned: { name: string; quantity: number; unit: string; category: PantryCategory }[]) => {
    save(mergeIntoPantry(items, scanned));
    triggerConfetti(undefined, undefined, 40);
  };

  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, items: items.filter((i) => i.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {showScanner && (
        <ReceiptScanner onClose={() => setShowScanner(false)} onSave={handleScanSave} />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2.5 tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-500/10">
              <Package className="w-5 h-5" />
            </div>
            Pantry Inventory
            {pendingSync && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full font-medium" title="You're offline — this will sync when you reconnect.">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Offline — will sync
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-1">Real-time household food supply & ingredients</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowScanner(true)} 
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-lg shadow-purple-500/20 focus-ring"
            >
              <ScanLine className="w-4 h-4" /> Scan Receipt
            </button>
            <button 
              onClick={() => setShowForm((f) => !f)} 
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-lg shadow-emerald-500/20 focus-ring"
            >
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="bg-slate-900/80 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="font-semibold text-sm text-emerald-400 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Quick Add to Pantry
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="Item name (e.g. Sriracha, Rolled Oats)" 
              autoFocus
              className="col-span-1 sm:col-span-2 bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition" 
            />
            <input 
              value={quantity} 
              onChange={(e) => setQuantity(e.target.value)} 
              type="number" 
              placeholder="Quantity"
              className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition" 
            />
            <input 
              value={unit} 
              onChange={(e) => setUnit(e.target.value)} 
              placeholder="Unit (cups, lb, cans…)"
              className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition" 
            />
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value as PantryCategory)}
              className="col-span-1 sm:col-span-2 bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition">
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{PANTRY_CATEGORY_EMOJI[c]} {c}</option>)}
            </select>
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
              className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold px-5 py-2 rounded-xl transition shadow-lg shadow-emerald-500/20 focus-ring"
            >
              Add to Stock
            </button>
          </div>
        </div>
      )}

      {byCategory.length === 0 && !showForm && (
        <div className="text-center bg-slate-900/40 border border-slate-800/60 rounded-2xl py-12 px-4">
          <Package className="w-10 h-10 text-slate-600 mx-auto mb-3 opacity-60" />
          <p className="text-slate-400 font-medium text-sm">Pantry is empty.</p>
          <p className="text-slate-500 text-xs mt-1">Add items or scan a grocery receipt to populate ingredients.</p>
        </div>
      )}

      {byCategory.map(({ cat, items: catItems }) => (
        <div key={cat} className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <span className="text-base">{PANTRY_CATEGORY_EMOJI[cat]}</span>
            <span>{cat}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/50">{catItems.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {catItems.map((i) => (
              <div 
                key={i.id} 
                className="flex items-center justify-between gap-3 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 hover:border-slate-700/80 rounded-2xl px-4 py-3 shadow-md transition group"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-white text-sm font-medium truncate block">{i.name}</span>
                  {i.unit && <span className="text-slate-400 text-xs">{i.unit}</span>}
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button 
                      onClick={() => adjustQty(i.id, -1)} 
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-95 focus-ring"
                      title="Decrease quantity"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-emerald-400 tabular-nums">{i.quantity}</span>
                    <button 
                      onClick={() => adjustQty(i.id, 1)} 
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-95 focus-ring"
                      title="Increase quantity"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => removeItem(i.id)} 
                      className="w-7 h-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-slate-500 hover:text-rose-400 transition active:scale-95 focus-ring ml-1 opacity-60 group-hover:opacity-100"
                      title="Delete item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-sm font-bold text-emerald-400 tabular-nums bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">{i.quantity} {i.unit || ''}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Pantry;
