'use client';

import { useState, useCallback, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export type PantryCategory =
  | 'produce' | 'meat' | 'dairy' | 'bakery' | 'pantry'
  | 'frozen' | 'beverages' | 'household' | 'personal-care' | 'other';

export interface PantryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: PantryCategory;
  inStock: boolean;
  price?: number;
  addedAt?: unknown;
  updatedAt?: unknown;
}

export const PANTRY_CATEGORY_EMOJI: Record<PantryCategory, string> = {
  produce: '🥦', meat: '🥩', dairy: '🥛', bakery: '🍞', pantry: '🥫',
  frozen: '❄️', beverages: '🧃', household: '🧹', 'personal-care': '🧴', other: '📦',
};

export function usePantry() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid ?? null)), []);

  useEffect(() => {
    if (!uid || !db) { setLoading(false); return; }
    const ref = collection(db, 'households', uid, 'pantry');
    const q = query(ref, orderBy('name'));
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as PantryItem)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [uid]);

  const addItem = useCallback(async (item: Omit<PantryItem, 'id' | 'addedAt' | 'updatedAt'>) => {
    if (!uid || !db) return;
    await addDoc(collection(db, 'households', uid, 'pantry'), {
      ...item, addedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }, [uid]);

  const bulkAdd = useCallback(async (newItems: Omit<PantryItem, 'id' | 'addedAt' | 'updatedAt'>[]) => {
    if (!uid || !db || newItems.length === 0) return;
    const batch = writeBatch(db);
    const ref = collection(db, 'households', uid, 'pantry');
    for (const item of newItems) {
      batch.set(doc(ref), { ...item, addedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }, [uid]);

  const updateItem = useCallback(async (id: string, updates: Partial<PantryItem>) => {
    if (!uid || !db) return;
    await updateDoc(doc(db, 'households', uid, 'pantry', id), { ...updates, updatedAt: serverTimestamp() });
  }, [uid]);

  const removeItem = useCallback(async (id: string) => {
    if (!uid || !db) return;
    await deleteDoc(doc(db, 'households', uid, 'pantry', id));
  }, [uid]);

  const inStock = items.filter(i => i.inStock);
  const outOfStock = items.filter(i => !i.inStock);

  return { items, inStock, outOfStock, loading, addItem, bulkAdd, updateItem, removeItem };
}
