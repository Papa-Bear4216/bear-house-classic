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
  // Optional polygon outline (absolute coordinates) for non-rectangular rooms,
  // e.g. an L-shaped hallway. x/y/w/h still hold the bounding box, used for
  // hit-test fallback, pin clamping, and drift/decay lookups. When present,
  // `points` is what actually gets rendered.
  points?: { x: number; y: number }[];
  // "Mind palace" access gate: rooms marked true are visible-but-blocked to
  // `child`-role viewers (they can see the room, not open it). admin/superadmin
  // ("parents") always have unrestricted access to every room.
  restrictedToAdults?: boolean;
  // Optional app route this room deep-links to when opened by someone who can
  // access it (e.g. the Master Walk-In Closet opens Budget & Banking) — a
  // "secondary gate" nested behind the room's own restriction.
  linkedFeature?: string;
}

const LS_KEY = 'bear-house-floorplan';
const LS_SEEDED = 'bear-house-floorplan-seeded';
const COLORS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe', '#ffedd5', '#e0f2fe', '#d1fae5'];

// Pre-populated rooms matching the family's actual house layout (1000×580 viewBox).
// Right-side pod (bath column, bedrooms, hall, closets) is scaled 1:1.3 units/inch
// from the family's CubiCasa floorplan scan; the rest of the house is unchanged.
const SEED_ROOMS: Omit<FloorplanRoom, 'id'>[] = [
  { name: 'Kitchen',          x: 20,  y: 20,  w: 315, h: 118, color: '#dbeafe', cameraEntity: 'camera.wyze_cam_kitchen_cam_snapshot' },
  { name: 'Laundry',          x: 20,  y: 138, w: 186, h: 112, color: '#e0f2fe', cameraEntity: 'camera.wyze_cam_laundry_room_snapshot' },
  { name: 'Bar',              x: 206, y: 138, w: 149, h: 168, color: '#fef3c7', cameraEntity: 'camera.wyze_cam_bar_cam_snapshot' },
  { name: 'Storage',          x: 20,  y: 306, w: 82,  h: 254, color: '#f1f5f9' },
  { name: 'Dining Area',      x: 102, y: 306, w: 233, h: 254, color: '#dcfce7' },
  { name: 'Living Room',      x: 355, y: 20,  w: 248, h: 378, color: '#ede9fe', cameraEntity: 'camera.wyze_cam_bar_cam_snapshot' },
  { name: 'Foyer',            x: 355, y: 398, w: 88,  h: 162, color: '#fce7f3', cameraEntity: 'camera.wyze_cam_front_door_cam_snapshot' },
  { name: 'Foyer Closet',     x: 443, y: 398, w: 40,  h: 90,  color: '#f1f5f9' },

  // Bath column (Hall Bath / Master W.I.C. / Primary Bath), stacked
  { name: 'Hall Bath',        x: 603, y: 20,  w: 79,  h: 81,  color: '#e0f2fe' },
  {
    name: 'Master Walk-In Closet', x: 603, y: 101, w: 79, h: 66, color: '#f1f5f9',
    restrictedToAdults: true, linkedFeature: '/budget',
  },
  { name: 'Primary Bath',     x: 603, y: 167, w: 79,  h: 164, color: '#e0f2fe' },

  { name: 'Master Bedroom',   x: 682, y: 20,  w: 252, h: 252, color: '#ffedd5', restrictedToAdults: true },

  // L-shaped hallway connecting the bath column, Master Bedroom, Abriana's
  // Room, the hall closets, and Julia's/Guest room — see docs/floorplan-vision.md
  // and the family's floorplan scan for the real (non-rectangular) shape.
  {
    name: 'Hall', x: 603, y: 272, w: 128, h: 295, color: '#f8fafc',
    cameraEntity: 'camera.wyze_cam_traffic_cam_snapshot',
    points: [
      { x: 682, y: 272 }, { x: 731, y: 272 }, { x: 731, y: 433 },
      { x: 691, y: 433 }, { x: 691, y: 567 }, { x: 651, y: 567 },
      { x: 651, y: 433 }, { x: 603, y: 433 }, { x: 603, y: 331 },
      { x: 682, y: 331 },
    ],
  },

  { name: "Abriana's Room",  x: 731, y: 272, w: 203, h: 148, color: '#ffedd5', cameraEntity: 'camera.wyze_cam_manas_room_snapshot' },
  { name: "Julia's Room",    x: 483, y: 433, w: 168, h: 134, color: '#ffedd5' },
  // One tall closet between the Hall and Julia's/Guest Room (single compartment,
  // bifold door opening up into the Hall — not two stacked closets).
  { name: 'Hall Closet 1',   x: 691, y: 433, w: 40,  h: 134, color: '#f1f5f9' },
  // Row of 3 closets recessed between Abriana's Room and Guest Room.
  { name: 'Hall Closet 2',   x: 731, y: 420, w: 68,  h: 26,  color: '#f1f5f9' },
  { name: 'Hall Closet 3',   x: 799, y: 420, w: 68,  h: 26,  color: '#f1f5f9' },
  { name: 'Hall Closet 4',   x: 867, y: 420, w: 67,  h: 26,  color: '#f1f5f9' },
  { name: 'Guest Room',      x: 731, y: 446, w: 203, h: 121, color: '#ffedd5' },
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
