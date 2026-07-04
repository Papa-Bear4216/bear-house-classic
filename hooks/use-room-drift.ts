'use client';

import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db, isPlaceholder, auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getMyFamilyId } from '../lib/family-id';
import type { FloorplanRoom } from './use-floorplan';
import type { ScanRecord } from './use-scans';
import type { Task } from '../lib/familyos';

export interface RoomDrift {
  roomId: string;
  roomName: string;
  cleanliness: number; // 0 to 100
  driftScore: number; // 100 - cleanliness (0 to 100)
  status: 'clean' | 'drifting' | 'messy';
  lastActivity: Date;
  forecastMessage: string;
}

// Decay rates per day for room types
const DECAY_RATES: Record<string, number> = {
  Kitchen: 15,
  'Primary Bath': 12,
  'Hall Bath': 12,
  'Living Room': 10,
  'Master Bedroom': 7,
  "Abriana's Room": 7,
  "Julia's Room": 7,
  'Guest Room': 7,
  'Bedroom 5': 7,
  Laundry: 5,
  Bar: 5,
  Storage: 5,
  Foyer: 5,
  Hall: 5,
  'Dining Area': 5,
};

function getRoomDecayRate(name: string): number {
  return DECAY_RATES[name] ?? 8; // Default 8% per day
}

export function useRoomDrift(rooms: FloorplanRoom[]) {
  const [drifts, setDrifts] = useState<Record<string, RoomDrift>>({});
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    if (!user && !isPlaceholder) return;
    if (isPlaceholder) {
      // Load scans/tasks from local storage for placeholder mode
      try {
        const storedTasks = JSON.parse(localStorage.getItem('bearhouse_tasks') || '[]');
        setTasks(storedTasks);
      } catch {}
      return;
    }
    getMyFamilyId().then(fid => setFamilyId(fid)).catch(() => {});
  }, [user]);

  // Subscribe to scans
  useEffect(() => {
    if (isPlaceholder) return;
    if (!familyId) return;
    const col = collection(db, 'households', familyId, 'scans');
    const q = query(col, orderBy('timestamp', 'desc'));
    return onSnapshot(q, snap => {
      setScans(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestamp: data.timestamp?.toDate?.() ?? new Date(),
        } as ScanRecord;
      }));
    });
  }, [familyId]);

  // Subscribe to tasks
  useEffect(() => {
    if (isPlaceholder) return;
    const q = query(collection(db, 'tasks'), orderBy('date', 'desc'));
    return onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    });
  }, []);

  // Recalculate drift whenever rooms, scans, or tasks change
  useEffect(() => {
    const newDrifts: Record<string, RoomDrift> = {};
    const now = new Date();

    rooms.forEach(room => {
      // Find the most recent scan for this room
      const roomScans = scans.filter(s => s.roomId === room.id);
      const lastScan = roomScans[0]; // ordered desc by timestamp
      
      let initialCleanliness = 100;
      let lastScanTime = new Date((room as any).createdAt || now.getTime() - 24 * 3600 * 1000); // default to 1 day ago

      if (lastScan) {
        lastScanTime = new Date(lastScan.timestamp);
        const scanRes = lastScan.scanResult as any;
        const messLevel = scanRes?.houseScan?.overallMessLevel?.toLowerCase() || 'low';
        
        if (messLevel === 'low') initialCleanliness = 95;
        else if (messLevel === 'medium') initialCleanliness = 60;
        else if (messLevel === 'high') initialCleanliness = 25;
      }

      // Find all completed tasks for this room that happened AFTER the last scan
      const roomTasks = tasks.filter(t => 
        (t.roomId === room.id || t.title.toLowerCase().startsWith(room.name.toLowerCase() + ':')) &&
        (t.status === 'done' || t.completed === true)
      );

      const tasksAfterScan = roomTasks.filter(t => {
        if (!t.updatedAt) return false;
        const completeTime = new Date(t.updatedAt.toDate?.() ?? t.updatedAt);
        return completeTime > lastScanTime;
      });

      // Each completed task boosts cleanliness by 20%
      let cleanliness = Math.min(100, initialCleanliness + tasksAfterScan.length * 20);

      // Find the most recent activity (scan or task completion)
      let lastActivityTime = lastScanTime;
      tasksAfterScan.forEach(t => {
        const completeTime = new Date(t.updatedAt?.toDate?.() ?? t.updatedAt ?? now);
        if (completeTime > lastActivityTime) {
          lastActivityTime = completeTime;
        }
      });

      // Calculate decay since the last activity
      const timeDiffMs = now.getTime() - lastActivityTime.getTime();
      const timeDiffHours = Math.max(0, timeDiffMs / (1000 * 60 * 60));
      const dailyDecayRate = getRoomDecayRate(room.name);
      const hourlyDecayRate = dailyDecayRate / 24;

      cleanliness = Math.max(0, cleanliness - timeDiffHours * hourlyDecayRate);
      const driftScore = Math.round(100 - cleanliness);
      cleanliness = Math.round(cleanliness);

      // Determine status
      let status: RoomDrift['status'] = 'clean';
      if (driftScore > 60) status = 'messy';
      else if (driftScore > 20) status = 'drifting';

      // Forecast message
      let forecastMessage = '';
      if (status === 'messy') {
        forecastMessage = 'Needs cleaning immediately! 🚨';
      } else {
        // how many hours/days left before reaching 60% drift (40% cleanliness)
        const targetCleanliness = 40;
        if (cleanliness <= targetCleanliness) {
          forecastMessage = 'Drifting to clutter zone soon!';
        } else {
          const hoursLeft = (cleanliness - targetCleanliness) / hourlyDecayRate;
          const daysLeft = hoursLeft / 24;
          if (daysLeft < 1) {
            forecastMessage = `Will clutter up in ${Math.round(hoursLeft)} hours`;
          } else {
            forecastMessage = `Will clutter up in ${Math.ceil(daysLeft)} days`;
          }
        }
      }

      newDrifts[room.id] = {
        roomId: room.id,
        roomName: room.name,
        cleanliness,
        driftScore,
        status,
        lastActivity: lastActivityTime,
        forecastMessage,
      };
    });

    setDrifts(newDrifts);
  }, [rooms, scans, tasks]);

  return drifts;
}
