'use client';

import { useState } from 'react';
import { ShoppingCart, Plus, Check, Trash2, Sparkles, X, ScanLine } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useShopping } from '@/hooks/use-shopping';
import { INGREDIENT_CATEGORY_LABELS, type Ingredient } from '@/lib/recipes';
import { useFamilyMembers } from '@/hooks/use-family';
import { askHermes } from '@/lib/hermes';
import ReceiptScanner from '@/components/ReceiptScanner';
import type { ScannedItem } from '@/components/ReceiptScanner';

const CATEGORY_ORDER: Ingredient['category'][] = [
  'produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'other',
];

export default function ShoppingPage() {
  const { items, byCategory, loading, addItem, toggleItem, removeItem, clearChecked } = useShopping();
  const { users } = useFamilyMembers();

  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);
  const [hermesLoading, setHermesLoading] = useState(false);
  const [hermesTip, setHermesTip] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  const uncheckedCount = items.filter(i => !i.checked).length;
  const checkedCount = items.filter(i => i.checked).length;

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    await addItem({
      name: newItem.trim(),
      quantity: 1,
      unit: '',
      category: 'other',
      checked: false,
      addedManually: true,
    });
    setNewItem('');
    setAdding(false);
  }

  async function askHermesForTips() {
    setHermesLoading(true);
    setHermesTip('');
    try {
      const itemNames = items.filter(i => !i.checked).map(i => i.name);
      const { content } = await askHermes(
        [{ role: 'user', content: `Looking at our current shopping list, are there any items we typically forget, complementary items worth grabbing, or tips to make this shopping trip more efficient? List is: ${itemNames.join(', ')}. Keep it to 2-3 short suggestions.` }],
        { users, shopping: itemNames },
      );
      setHermesTip(content);
    } catch {
      setHermesTip('Set AI_GATEWAY_KEY to enable Hermes suggestions.');
    } finally {
      setHermesLoading(false);
    }
  }

  async function handleScannerConfirm(scannedItems: ScannedItem[], _storeName: string | null, _total: number) {
    const selected = scannedItems.filter(i => i.selected);
    for (const item of selected) {
      await addItem({
        name: item.name, quantity: item.quantity, unit: item.unit,
        category: 'other', checked: false, addedManually: true,
      });
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6 pb-24">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-400 border-2 border-black rounded-xl flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <ShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Shopping List</h1>
              <p className="text-xs text-slate-500">{uncheckedCount} items needed · {checkedCount} done</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center gap-1.5 bg-green-500 text-white text-xs font-bold px-3 py-2 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              <ScanLine className="w-3.5 h-3.5" /> Scan
            </button>
            <button
              onClick={askHermesForTips}
              disabled={hermesLoading || items.length === 0}
              className="flex items-center gap-1.5 bg-purple-500 text-white text-xs font-bold px-3 py-2 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {hermesLoading ? '…' : 'Hermes'}
            </button>
          </div>
        </div>

        {/* Hermes tip */}
        <AnimatePresence>
          {hermesTip && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-3 bg-purple-50 border-2 border-purple-300 rounded-xl text-sm text-slate-700 relative"
            >
              <button onClick={() => setHermesTip('')} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
              <p className="font-bold text-purple-700 mb-1 text-xs flex items-center gap-1"><Sparkles className="w-3 h-3" /> Hermes</p>
              <p className="whitespace-pre-line text-xs">{hermesTip}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add item */}
        <div className="mb-4">
          {adding ? (
            <form onSubmit={handleAddItem} className="flex gap-2">
              <input
                autoFocus
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                placeholder="Add item…"
                className="flex-1 border-2 border-black rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-400"
              />
              <button type="submit" className="bg-green-400 border-2 border-black rounded-xl px-4 py-2 font-bold text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all">
                Add
              </button>
              <button type="button" onClick={() => setAdding(false)} className="p-2 border-2 border-slate-300 rounded-xl">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center gap-2 bg-white border-2 border-dashed border-slate-300 rounded-xl px-4 py-3 text-sm font-bold text-slate-400 hover:border-green-400 hover:text-green-500 transition-all"
            >
              <Plus className="w-4 h-4" /> Add item manually
            </button>
          )}
        </div>

        {/* Items by category */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-bold">List is empty</p>
            <p className="text-sm mt-1">Plan meals to auto-fill, or add items manually</p>
          </div>
        ) : (
          <div className="space-y-4">
            {CATEGORY_ORDER.filter(cat => byCategory[cat]?.length).map(cat => (
              <div key={cat}>
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                  {INGREDIENT_CATEGORY_LABELS[cat]}
                </h3>
                <div className="space-y-1.5">
                  <AnimatePresence>
                    {byCategory[cat].map(item => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className={`flex items-center gap-3 bg-white border-2 rounded-xl px-3 py-2.5 group transition-all ${
                          item.checked ? 'border-slate-200 opacity-50' : 'border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                        }`}
                      >
                        <button
                          onClick={() => toggleItem(item.id, !item.checked)}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            item.checked ? 'bg-green-400 border-green-400' : 'border-slate-400 hover:border-green-400'
                          }`}
                        >
                          {item.checked && <Check className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-bold ${item.checked ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {item.name}
                          </span>
                          {(item.quantity > 0 || item.unit) && (
                            <span className="text-xs text-slate-400 ml-1.5">
                              {item.quantity > 0 ? item.quantity : ''} {item.unit}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}

            {checkedCount > 0 && (
              <button
                onClick={clearChecked}
                className="w-full text-center text-xs font-bold text-slate-400 hover:text-red-400 py-2 transition-colors"
              >
                Clear {checkedCount} checked item{checkedCount > 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showScanner && (
          <ReceiptScanner
            mode="shopping"
            onConfirm={handleScannerConfirm}
            onClose={() => setShowScanner(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
