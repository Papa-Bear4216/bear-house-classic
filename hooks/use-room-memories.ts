'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, isPlaceholder, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getMyFamilyId } from '../lib/family-id';

// "Mind palace" memory notes: free-text personal notes tied to a room, keyed
// by room ID. Bedrooms coordinate to the family member who sleeps there —
// see docs on the floorplan "mindpalace" gating for the reasoning.
export interface RoomMemory {
  roomId: string;
  note: string;
  updatedBy?: string;
  updatedAt?: unknown;
}

const LS_KEY = 'bear-house-room-memories';

export function useRoomMemories() {
  const [memories, setMemories] = useState<Record<string, RoomMemory>>({});
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => onAuthStateChanged(auth, u => setUser(u)), []);

  useEffect(() => {
    if (!user && !isPlaceholder) return;
    if (isPlaceholder) {
      try { setMemories(JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch { setMemories({}); }
      return;
    }
    getMyFamilyId().then(fid => setFamilyId(fid)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!familyId) return;
    const col = collection(db, 'households', familyId, 'roomMemories');
    return onSnapshot(col, snap => {
      const next: Record<string, RoomMemory> = {};
      snap.docs.forEach(d => { next[d.id] = d.data() as RoomMemory; });
      setMemories(next);
    });
  }, [familyId]);

  const setMemory = async (roomId: string, note: string, updatedBy?: string) => {
    if (isPlaceholder || !familyId) {
      const updated = { ...memories, [roomId]: { roomId, note, updatedBy } };
      setMemories(updated);
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
      return;
    }
    await setDoc(doc(db, 'households', familyId, 'roomMemories', roomId), {
      roomId, note, updatedBy, updatedAt: serverTimestamp(),
    });
  };

  return { memories, setMemory };
}
