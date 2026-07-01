import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
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
  cameraEntity?: string; // e.g. "camera.kitchen_wyze"
}

const LS_KEY = 'bear-house-floorplan';
const LS_SEEDED = 'bear-house-floorplan-seeded';
const COLORS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe', '#ffedd5', '#e0f2fe', '#d1fae5'];

// Pre-populated rooms matching the family's actual house layout (1000×580 viewBox)
const SEED_ROOMS: Omit<FloorplanRoom, 'id'>[] = [
  { name: 'Kitchen',          x: 20,  y: 20,  w: 315, h: 118, color: '#dbeafe' },
  { name: 'Laundry',          x: 20,  y: 138, w: 186, h: 112, color: '#e0f2fe' },
  { name: 'Bar',              x: 206, y: 138, w: 149, h: 168, color: '#fef3c7' },
  { name: 'Storage',          x: 20,  y: 306, w: 82,  h: 254, color: '#f1f5f9' },
  { name: 'Dining Area',      x: 102, y: 306, w: 233, h: 254, color: '#dcfce7' },
  { name: 'Living Room',      x: 355, y: 20,  w: 248, h: 378, color: '#ede9fe' },
  { name: 'Foyer',            x: 355, y: 398, w: 88,  h: 162, color: '#fce7f3' },
  { name: 'Primary Bath',     x: 603, y: 20,  w: 88,  h: 73,  color: '#e0f2fe' },
  { name: 'W.I.C.',           x: 603, y: 93,  w: 88,  h: 58,  color: '#f1f5f9' },
  { name: 'Hall Bath',        x: 603, y: 151, w: 88,  h: 147, color: '#e0f2fe' },
  { name: 'Hall',             x: 691, y: 235, w: 148, h: 163, color: '#f8fafc' },
  { name: 'Primary Bedroom',  x: 691, y: 20,  w: 289, h: 215, color: '#ffedd5' },
  { name: 'Bedroom 2',        x: 839, y: 235, w: 141, h: 163, color: '#ffedd5' },
  { name: 'Bedroom 3',        x: 443, y: 398, w: 200, h: 162, color: '#ffedd5' },
  { name: 'Bedroom 4',        x: 691, y: 398, w: 189, h: 162, color: '#ffedd5' },
  { name: 'Bedroom 5',        x: 839, y: 398, w: 141, h: 162, color: '#ffedd5' },
];

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
    return onSnapshot(col, async snap => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as FloorplanRoom));
      setRooms(loaded);
      setIsLoaded(true);

      // Auto-seed the house layout on first load if no rooms exist
      if (loaded.length === 0 && !localStorage.getItem(LS_SEEDED)) {
        localStorage.setItem(LS_SEEDED, '1');
        try {
          const batch = writeBatch(db);
          SEED_ROOMS.forEach(room => {
            const ref = doc(col);
            batch.set(ref, { ...room, createdAt: serverTimestamp() });
          });
          await batch.commit();
        } catch {
          localStorage.removeItem(LS_SEEDED);
        }
      }
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
