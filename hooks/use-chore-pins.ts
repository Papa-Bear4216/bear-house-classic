import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db, isPlaceholder, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getMyFamilyId } from '../lib/family-id';

export interface ChorePin {
  id: string;
  roomId: string;
  roomName: string;
  choreTitle: string;
  priority: 'high' | 'medium' | 'low';
  x: number;
  y: number;
  scanId: string;
  movedByParent: boolean;
}

export function useChorePins() {
  const [pins, setPins] = useState<ChorePin[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => onAuthStateChanged(auth, u => setUser(u)), []);

  useEffect(() => {
    if (!user && !isPlaceholder) return;
    if (isPlaceholder) return;
    getMyFamilyId().then(fid => setFamilyId(fid)).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!familyId) return;
    const col = collection(db, 'households', familyId, 'chorePins');
    return onSnapshot(col, snap => {
      setPins(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChorePin)));
    });
  }, [familyId]);

  const addPins = async (newPins: Omit<ChorePin, 'id'>[]) => {
    if (isPlaceholder || !familyId) return;
    await Promise.all(
      newPins.map(pin =>
        addDoc(collection(db, 'households', familyId!, 'chorePins'), {
          ...pin,
          createdAt: serverTimestamp(),
        }),
      ),
    );
  };

  const updatePinPosition = async (id: string, x: number, y: number) => {
    if (isPlaceholder || !familyId) return;
    await updateDoc(doc(db, 'households', familyId!, 'chorePins', id), {
      x, y, movedByParent: true,
    });
  };

  const deletePin = async (id: string) => {
    if (isPlaceholder || !familyId) return;
    await deleteDoc(doc(db, 'households', familyId!, 'chorePins', id));
  };

  const clearRoomPins = async (roomId: string) => {
    if (isPlaceholder || !familyId) return;
    const snap = await getDocs(
      query(
        collection(db, 'households', familyId!, 'chorePins'),
        where('roomId', '==', roomId),
      ),
    );
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  };

  return { pins, addPins, updatePinPosition, deletePin, clearRoomPins };
}
