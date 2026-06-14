'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch,
} from 'firebase/firestore';
import type { Ingredient } from '@/lib/recipes';

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: Ingredient['category'];
  checked: boolean;
  fromRecipeId?: string;
  fromMealDate?: string;
  addedManually?: boolean;
}

export function useShopping() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const uid = auth?.currentUser?.uid ?? 'shared';
    const colRef = collection(db, 'households', uid, 'shoppingList');

    const unsub = onSnapshot(colRef, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShoppingItem)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const uid = () => auth?.currentUser?.uid ?? 'shared';

  async function addItem(item: Omit<ShoppingItem, 'id'>) {
    if (!db) return;
    const id = crypto.randomUUID();
    await setDoc(doc(db, 'households', uid(), 'shoppingList', id), { ...item, id });
  }

  async function toggleItem(id: string, checked: boolean) {
    if (!db) return;
    await updateDoc(doc(db, 'households', uid(), 'shoppingList', id), { checked });
  }

  async function removeItem(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'households', uid(), 'shoppingList', id));
  }

  async function clearChecked() {
    if (!db) return;
    const batch = writeBatch(db);
    items.filter(i => i.checked).forEach(i => {
      batch.delete(doc(db, 'households', uid(), 'shoppingList', i.id));
    });
    await batch.commit();
  }

  async function addFromRecipe(
    recipeIngredients: Ingredient[],
    recipeId: string,
    mealDate: string,
    multiplier = 1,
  ) {
    if (!db) return;
    const batch = writeBatch(db);
    for (const ing of recipeIngredients) {
      const existing = items.find(
        i => i.name.toLowerCase() === ing.name.toLowerCase() && !i.checked,
      );
      if (existing) {
        batch.update(doc(db, 'households', uid(), 'shoppingList', existing.id), {
          quantity: existing.quantity + ing.quantity * multiplier,
        });
      } else {
        const id = crypto.randomUUID();
        const item: ShoppingItem = {
          id,
          name: ing.name,
          quantity: ing.quantity * multiplier,
          unit: ing.unit,
          category: ing.category,
          checked: false,
          fromRecipeId: recipeId,
          fromMealDate: mealDate,
        };
        batch.set(doc(db, 'households', uid(), 'shoppingList', id), item);
      }
    }
    await batch.commit();
  }

  const byCategory = items.reduce<Record<string, ShoppingItem[]>>((acc, item) => {
    const cat = item.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return { items, byCategory, loading, addItem, toggleItem, removeItem, clearChecked, addFromRecipe };
}
