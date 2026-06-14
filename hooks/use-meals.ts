'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, where,
} from 'firebase/firestore';
import { auth } from '@/lib/firebase';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface PlannedMeal {
  id: string;
  date: string; // YYYY-MM-DD
  slot: MealSlot;
  recipeId: string;
  servings: number;
  notes?: string;
}

export function useMeals(weekStart: string) {
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }

    const uid = auth?.currentUser?.uid ?? 'shared';
    const start = weekStart;
    const end = shiftDate(weekStart, 7);

    const q = query(
      collection(db, 'mealPlans'),
      where('weekOwner', '==', uid),
      where('date', '>=', start),
      where('date', '<', end),
    );

    const unsub = onSnapshot(q, snap => {
      setMeals(snap.docs.map(d => ({ id: d.id, ...d.data() } as PlannedMeal)));
      setLoading(false);
    });
    return unsub;
  }, [weekStart]);

  async function addMeal(meal: Omit<PlannedMeal, 'id'>) {
    if (!db) return;
    const uid = auth?.currentUser?.uid ?? 'shared';
    const id = `${uid}_${meal.date}_${meal.slot}`;
    await setDoc(doc(db, 'mealPlans', id), { ...meal, weekOwner: uid });
  }

  async function removeMeal(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'mealPlans', id));
  }

  return { meals, loading, addMeal, removeMeal };
}

export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}
