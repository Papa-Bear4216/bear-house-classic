'use client';

import { useState, useCallback, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export type GameType = 'trivia' | 'challenge' | 'riddle' | 'story';

export interface GameChallenge {
  id: string;
  title: string;
  type: GameType;
  content: string;
  options?: string[];
  answer?: string;
  xpReward: number;
  createdBy: string;
  active: boolean;
  createdAt?: unknown;
}

export function useGames() {
  const [games, setGames] = useState<GameChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user || !db) { setLoading(false); return; }
    const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() } as GameChallenge)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [user]);

  const addGame = useCallback(async (game: Omit<GameChallenge, 'id' | 'createdAt'>) => {
    if (!db) return;
    await addDoc(collection(db, 'games'), { ...game, createdAt: serverTimestamp() });
  }, []);

  const updateGame = useCallback(async (id: string, updates: Partial<GameChallenge>) => {
    if (!db) return;
    await updateDoc(doc(db, 'games', id), updates);
  }, []);

  const deleteGame = useCallback(async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db, 'games', id));
  }, []);

  return { games: games.filter(g => g.active !== false), allGames: games, loading, addGame, updateGame, deleteGame };
}
