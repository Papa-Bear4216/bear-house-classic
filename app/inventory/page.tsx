'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package, Plus, ScanLine, ChefHat, Loader2, Check, X,
  Trash2, RefreshCw, AlertCircle, ShoppingCart, Search, Sparkles,
} from 'lucide-react';
import { usePantry, PANTRY_CATEGORY_EMOJI, type PantryItem, type PantryCategory } from '@/hooks/use-pantry';
import { useShopping } from '@/hooks/use-shopping';
import { runLocalAI } from '@/lib/local-ai';
import ReceiptScanner from '@/components/ReceiptScanner';
import type { ScannedItem } from '@/components/ReceiptScanner';

const CATEGORIES: PantryCategory[] = [
  'produce', 'meat', 'dairy', 'bakery', 'pantry', 'frozen', 'beverages', 'household', 'personal-care', 'other',
];

const CATEGORY_LABELS: Record<PantryCategory, string> = {
  produce: 'Produce', meat: 'Meat & Seafood', dairy: 'Dairy & Eggs', bakery: 'Bakery',
  pantry: 'Pantry & Canned', frozen: 'Frozen', beverages: 'Beverages',
  household: 'Household', 'personal-care': 'Personal Care', other: 'Other',
};

interface Recipe {
  name: string;
  ingredients: string[];
  missing?: string[];
  time?: string;
}

export default function InventoryPage() {
  const { items, loading, addItem, bulkAdd, updateItem, removeItem } = usePantry();
  const { addItem: addToShopping } = useShopping();

  const [showScanner, setShowScanner] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PantryCategory | 'all'>('all');
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [recipesError, setRecipesError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(0);

  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState(1);
  const [newUnit, setNewUnit] = useState('');
  const [newCategory, setNewCategory] = useState<PantryCategory>('other');

  const inStock = items.filter(i => i.inStock !== false);
  const outOfStock = items.filter(i => i.inStock === false);

  const filtered = useMemo(() => {
    let list = items;
    if (selectedCategory !== 'all') list = list.filter(i => i.category === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    return list;
  }, [items, selectedCategory, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<PantryCategory, PantryItem[]>();
    for (const item of filtered) {
      const cat = item.category ?? 'other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [filtered]);

  async function handleScannerConfirm(scannedItems: ScannedItem[], _storeName: string | null) {
    const selected = scannedItems.filter(i => i.selected);
    await bulkAdd(selected.map(i => ({
      name: i.name, quantity: i.quantity, unit: i.unit,
      category: i.category, inStock: true, price: i.price,
    })));
  }

  async function toggleStock(item: PantryItem) {
    await updateItem(item.id, { inStock: !item.inStock });
    if (item.inStock) {
      await addToShopping({
        name: item.name, quantity: item.quantity || 1,
        unit: item.unit || '', category: 'other' as never,
        checked: false, addedManually: true,
      });
    }
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await addItem({ name: newName.trim(), quantity: newQty, unit: newUnit, category: newCategory, inStock: true });
    setNewName(''); setNewQty(1); setNewUnit(''); setNewCategory('other');
    setShowAddForm(false);
  }

  function startEdit(item: PantryItem) {
    setEditingId(item.id);
    setEditQty(item.quantity);
  }

  async function saveEdit(id: string) {
    await updateItem(id, { quantity: editQty });
    setEditingId(null);
  }

  async function askWhatToCook() {
    setRecipesLoading(true);
    setRecipesError('');
    setRecipes(null);
    try {
      const stockItems = inStock.map(i => `${i.quantity} ${i.unit} ${i.name}`.trim()).join(', ');
      const prompt = `I have these items in my pantry/fridge: ${stockItems || 'nothing yet'}.

Suggest 4 recipes I can make (or mostly make) with what I have. For each recipe include:
- name
- ingredients needed (use what I have, mark anything extra as "missing")
- rough cook time

Respond ONLY with valid JSON:
{
  "recipes": [
    {
      "name": "Pasta Primavera",
      "time": "25 min",
      "ingredients": ["pasta", "tomatoes", "garlic"],
      "missing": ["parmesan"]
    }
  ]
}`;
      const raw = await runLocalAI(prompt);
      const match = raw.match(/```json\s*(\{[\s\S]*?\})\s*```/) ?? raw.match(/(\{[\s\S]*\})/);
      const json = match ? match[1] : raw.trim();
      const parsed = JSON.parse(json);
      setRecipes(parsed.recipes ?? []);
    } catch {
      setRecipesError('Could not generate recipes. Try again.');
    } finally {
      setRecipesLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Package className="w-6 h-6 text-green-600" /> Pantry
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {inStock.length} in stock · {outOfStock.length} depleted
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowScanner(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors">
              <ScanLine className="w-4 h-4" /> Scan
            </button>
            <button onClick={() => setShowAddForm(v => !v)}
              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
              <Plus className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search pantry…"
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button onClick={() => setSelectedCategory('all')}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors ${selectedCategory === 'all' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
            All ({items.length})
          </button>
          {CATEGORIES.filter(c => items.some(i => i.category === c)).map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors ${selectedCategory === cat ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {PANTRY_CATEGORY_EMOJI[cat]} {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Add form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.form initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              onSubmit={handleAddManual}
              className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-green-800 text-sm">Add Item</h3>
                <button type="button" onClick={() => setShowAddForm(false)}><X className="w-4 h-4 text-green-600" /></button>
              </div>
              <input value={newName} onChange={e => setNewName(e.target.value)} required
                placeholder="Item name" className="w-full px-3 py-2 border border-green-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400" />
              <div className="flex gap-2">
                <input type="number" value={newQty} onChange={e => setNewQty(Number(e.target.value))} min={0} step={0.5}
                  placeholder="Qty" className="w-20 px-3 py-2 border border-green-200 rounded-xl text-sm bg-white focus:outline-none" />
                <input value={newUnit} onChange={e => setNewUnit(e.target.value)}
                  placeholder="Unit (oz, lbs…)" className="flex-1 px-3 py-2 border border-green-200 rounded-xl text-sm bg-white focus:outline-none" />
              </div>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value as PantryCategory)}
                className="w-full px-3 py-2 border border-green-200 rounded-xl text-sm bg-white focus:outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{PANTRY_CATEGORY_EMOJI[c]} {CATEGORY_LABELS[c]}</option>)}
              </select>
              <button type="submit" className="w-full py-2 bg-green-600 text-white font-bold rounded-xl text-sm">Add to Pantry</button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Recipe suggestions */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ChefHat className="w-5 h-5 text-amber-600" />
              <h2 className="font-bold text-amber-900">What can I cook?</h2>
            </div>
            <button onClick={askWhatToCook} disabled={recipesLoading || inStock.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl disabled:opacity-40 transition-colors">
              {recipesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {recipesLoading ? 'Thinking…' : 'Suggest'}
            </button>
          </div>

          {recipesError && (
            <div className="flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5" /> {recipesError}
            </div>
          )}

          {inStock.length === 0 && !recipesLoading && (
            <p className="text-xs text-amber-600">Scan a receipt or add items to get recipe suggestions.</p>
          )}

          {recipes && (
            <div className="space-y-2">
              {recipes.map((recipe, i) => (
                <div key={i} className="bg-white/70 rounded-xl p-3 border border-amber-100">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-sm text-slate-900">{recipe.name}</p>
                    {recipe.time && <span className="text-xs text-slate-400 shrink-0">{recipe.time}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {recipe.ingredients.map((ing, j) => (
                      <span key={j} className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{ing}</span>
                    ))}
                    {recipe.missing?.map((ing, j) => (
                      <span key={`m${j}`} className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">+ {ing}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-green-500" />
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <Package className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-400">Pantry is empty</p>
            <p className="text-sm text-slate-400">Scan a receipt or add items manually to get started.</p>
          </div>
        )}

        {/* Grouped items */}
        {Array.from(grouped.entries()).map(([category, catItems]) => (
          <div key={category}>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>{PANTRY_CATEGORY_EMOJI[category]}</span> {CATEGORY_LABELS[category]}
              <span className="font-normal">({catItems.length})</span>
            </h3>
            <div className="space-y-1.5">
              {catItems.map(item => (
                <motion.div key={item.id} layout
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.inStock !== false ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                  <button onClick={() => toggleStock(item)}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.inStock !== false ? 'bg-green-100 border-green-400' : 'border-slate-300 bg-white'}`}
                    title={item.inStock !== false ? 'Mark depleted → add to shopping' : 'Mark in stock'}>
                    {item.inStock !== false
                      ? <Check className="w-3.5 h-3.5 text-green-600" />
                      : <ShoppingCart className="w-3 h-3 text-slate-400" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${item.inStock !== false ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                      {item.name}
                    </p>
                    {item.price && (
                      <p className="text-xs text-slate-400">${item.price.toFixed(2)}</p>
                    )}
                  </div>

                  {/* Quantity editor */}
                  {editingId === item.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditQty(q => Math.max(0, q - 1))} className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-sm font-bold">−</button>
                      <span className="w-8 text-center text-sm font-bold">{editQty}</span>
                      <button onClick={() => setEditQty(q => q + 1)} className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-sm font-bold">+</button>
                      <button onClick={() => saveEdit(item.id)} className="p-1 text-green-600 hover:text-green-800">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(item)} className="text-sm font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
                      {item.quantity} <span className="text-xs font-normal text-slate-400">{item.unit}</span>
                    </button>
                  )}

                  <button onClick={() => removeItem(item.id)} className="p-1 text-slate-300 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        ))}

        {/* Out of stock section */}
        {outOfStock.length > 0 && selectedCategory === 'all' && !searchQuery && (
          <div>
            <h3 className="text-xs font-black text-orange-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5" /> Depleted — Added to Shopping List ({outOfStock.length})
            </h3>
            <div className="space-y-1.5">
              {outOfStock.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-orange-100 bg-orange-50/50">
                  <button onClick={() => toggleStock(item)} className="w-7 h-7 rounded-full border-2 border-orange-300 bg-white flex items-center justify-center flex-shrink-0 hover:bg-orange-100 transition-colors">
                    <RefreshCw className="w-3 h-3 text-orange-500" />
                  </button>
                  <p className="flex-1 text-sm text-slate-500 line-through">{item.name}</p>
                  <button onClick={() => removeItem(item.id)} className="p-1 text-slate-300 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Receipt Scanner Modal */}
      <AnimatePresence>
        {showScanner && (
          <ReceiptScanner
            mode="pantry"
            onConfirm={handleScannerConfirm}
            onClose={() => setShowScanner(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
