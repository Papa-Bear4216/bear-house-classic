import React, { useState } from 'react';
import { Plus, Minus, Trash2, Package, ScanLine } from 'lucide-react';
import { loadPantry, savePantry, uid, PANTRY_CATEGORY_EMOJI, mergeIntoPantry, isAdmin, type PantryItem, type PantryCategory } from '@/lib/familyos';
import { useAppContext } from '@/contexts/AppContext';
import ReceiptScanner from '@/components/familyos/ReceiptScanner';

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

  const addItem = () => {
    if (!name.trim()) return;
    const item: PantryItem = {
      id: uid(), name: name.trim(), quantity: parseFloat(quantity) || 0, unit: unit.trim(),
      category, updatedAt: Date.now(),
    };
    save([item, ...items]);
    setName(''); setQuantity('1'); setUnit(''); setShowForm(false);
  };

  const adjustQty = (id: string, delta: number) => {
    save(items.map((i) => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta), updatedAt: Date.now() } : i));
  };

  const removeItem = (id: string) => {
    save(items.filter((i) => i.id !== id));
  };

  const handleScanSave = (scanned: { name: string; quantity: number; unit: string; category: PantryCategory }[]) => {
    save(mergeIntoPantry(items, scanned));
  };

  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, items: items.filter((i) => i.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {showScanner && (
        <ReceiptScanner onClose={() => setShowScanner(false)} onSave={handleScanSave} />
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-sage-400" /> Pantry
        </h2>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setShowScanner(true)} className="flex items-center gap-1 bg-berry-600 hover:bg-berry-500 text-white text-sm px-3 py-1.5 rounded-lg transition focus-ring">
              <ScanLine className="w-4 h-4" /> Scan Receipt
            </button>
            <button onClick={() => setShowForm((f) => !f)} className="flex items-center gap-1 bg-sage-600 hover:bg-sage-500 text-white text-sm px-3 py-1.5 rounded-lg transition focus-ring">
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <div className="bg-bark-700/60 border border-cream-400/10 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" autoFocus
              className="col-span-2 bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm placeholder-cream-400/50 outline-none focus-ring" />
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" placeholder="Quantity"
              className="bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus-ring" />
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (cups, lb…)"
              className="bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus-ring" />
            <select value={category} onChange={(e) => setCategory(e.target.value as PantryCategory)}
              className="col-span-2 bg-bark-800 border border-cream-400/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus-ring">
              {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{PANTRY_CATEGORY_EMOJI[c]} {c}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-cream-400/60 hover:text-white text-sm px-3 py-1.5 rounded transition focus-ring">Cancel</button>
            <button onClick={addItem} className="bg-sage-600 hover:bg-sage-500 text-white text-sm px-4 py-1.5 rounded-lg transition focus-ring">Add</button>
          </div>
        </div>
      )}

      {byCategory.length === 0 && !showForm && (
        <div className="text-center text-cream-400/50 py-8 text-sm">Pantry is empty. Add items or scan a receipt.</div>
      )}

      {byCategory.map(({ cat, items: catItems }) => (
        <div key={cat} className="space-y-2">
          <div className="text-cream-400/50 text-xs uppercase tracking-wide">{PANTRY_CATEGORY_EMOJI[cat]} {cat}</div>
          {catItems.map((i) => (
            <div key={i.id} className="flex items-center gap-3 bg-bark-700/40 border border-cream-400/10 rounded-xl px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <span className="text-white text-sm font-medium">{i.name}</span>
                {i.unit && <span className="text-cream-400/50 text-xs ml-2">{i.unit}</span>}
              </div>
              {canEdit && (
                <>
                  <button onClick={() => adjustQty(i.id, -1)} className="w-6 h-6 rounded-lg bg-bark-800 hover:bg-bark-800/70 flex items-center justify-center text-cream-200 focus-ring">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-10 text-center text-sm font-bold text-white">{i.quantity}</span>
                  <button onClick={() => adjustQty(i.id, 1)} className="w-6 h-6 rounded-lg bg-bark-800 hover:bg-bark-800/70 flex items-center justify-center text-cream-200 focus-ring">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeItem(i.id)} className="text-cream-400/40 hover:text-rose-400 transition focus-ring">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              {!canEdit && <span className="text-sm font-bold text-white">{i.quantity}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default Pantry;
