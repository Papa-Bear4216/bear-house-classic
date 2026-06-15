import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, isPlaceholder, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getMyFamilyId } from '../lib/family-id';

export interface FloorplanRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

const LS_KEY = 'bear-house-floorplan';
const COLORS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe', '#ffedd5', '#e0f2fe', '#d1fae5'];

export function useFloorplan() {
  const [rooms, setRooms] = useState<FloorplanRoom[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => onAuthStateChanged(auth, u => setUser(u)), []);

  useEffect(() => {
    if (!user && !isPlaceholder) return;
    if (isPlaceholder) {
      try { setRooms(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); } catch { setRooms([]); }
      setIsLoaded(true);
      return;
    }
    getMyFamilyId().then(fid => setFamilyId(fid)).catch(() => setIsLoaded(true));
  }, [user]);

  useEffect(() => {
    if (!familyId) return;
    const col = collection(db, 'households', familyId, 'floorplan');
    return onSnapshot(col, snap => {
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() } as FloorplanRoom)));
      setIsLoaded(true);
    });
  }, [familyId]);

  const addRoom = async (name: string, x: number, y: number, w: number, h: number) => {
    const color = COLORS[rooms.length % COLORS.length];
    const data = { name, x, y, w, h, color };
    if (isPlaceholder || !familyId) {
      const room: FloorplanRoom = { id: `local-${Date.now()}`, ...data };
      const updated = [...rooms, room];
      setRooms(updated);
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
      return room;
    }
    const ref = await addDoc(collection(db, 'households', familyId, 'floorplan'), { ...data, createdAt: serverTimestamp() });
    return { id: ref.id, ...data } as FloorplanRoom;
  };

  const updateRoom = async (id: string, patch: Partial<Omit<FloorplanRoom, 'id'>>) => {
    if (isPlaceholder || !familyId) {
      const updated = rooms.map(r => r.id === id ? { ...r, ...patch } : r);
      setRooms(updated);
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
      return;
    }
    await updateDoc(doc(db, 'households', familyId, 'floorplan', id), patch as Record<string, unknown>);
  };

  const deleteRoom = async (id: string) => {
    if (isPlaceholder || !familyId) {
      const updated = rooms.filter(r => r.id !== id);
      setRooms(updated);
      localStorage.setItem(LS_KEY, JSON.stringify(updated));
      return;
    }
    await deleteDoc(doc(db, 'households', familyId, 'floorplan', id));
  };

  return { rooms, addRoom, updateRoom, deleteRoom, isLoaded };
}
