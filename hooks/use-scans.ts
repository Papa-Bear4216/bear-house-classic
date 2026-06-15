import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, limit, where } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage, isPlaceholder, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getMyFamilyId } from '../lib/family-id';

export interface HermesResult {
  status: string;
  discrepancies: string[];
  drift: string;
  summary: string;
}

export interface ScanRecord {
  id: string;
  roomId: string;
  roomName: string;
  imageUrl: string;
  hermesResult: HermesResult | null;
  scanResult: unknown;
  hermesComment: string | null;
  missionCount: number;
  timestamp: Date;
}

export function useScans(roomId?: string) {
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => onAuthStateChanged(auth, u => setUser(u)), []);

  useEffect(() => {
    if (!user && !isPlaceholder) return;
    if (isPlaceholder) { setIsLoaded(true); return; }
    getMyFamilyId().then(fid => setFamilyId(fid)).catch(() => setIsLoaded(true));
  }, [user]);

  useEffect(() => {
    if (!familyId) return;
    const col = collection(db, 'households', familyId, 'scans');
    const q = roomId
      ? query(col, where('roomId', '==', roomId), orderBy('timestamp', 'desc'), limit(20))
      : query(col, orderBy('timestamp', 'desc'), limit(100));
    return onSnapshot(q, snap => {
      setScans(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestamp: data.timestamp?.toDate?.() ?? new Date(),
        } as ScanRecord;
      }));
      setIsLoaded(true);
    });
  }, [familyId, roomId]);

  const saveScan = async (opts: {
    roomId: string;
    roomName: string;
    imageBase64: string;
    hermesResult: HermesResult | null;
    scanResult: unknown;
    hermesComment: string | null;
    missionCount: number;
  }): Promise<string> => {
    if (isPlaceholder || !familyId) return 'local';
    const ts = Date.now();
    const storageRef = ref(storage, `scans/${familyId}/${opts.roomId}/${ts}.jpg`);
    await uploadString(storageRef, opts.imageBase64, 'data_url');
    const imageUrl = await getDownloadURL(storageRef);
    const docRef = await addDoc(collection(db, 'households', familyId, 'scans'), {
      roomId: opts.roomId,
      roomName: opts.roomName,
      imageUrl,
      hermesResult: opts.hermesResult,
      scanResult: opts.scanResult,
      hermesComment: opts.hermesComment,
      missionCount: opts.missionCount,
      timestamp: serverTimestamp(),
    });
    return docRef.id;
  };

  return { scans, saveScan, isLoaded };
}
