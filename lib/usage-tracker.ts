'use client';

import { db, auth } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';

export interface UsageEvent {
  page: string;
  action?: string;
  hour: number; // 0-23
  dayOfWeek: number; // 0=Sun
  date: string; // YYYY-MM-DD
}

export interface HermesMemory {
  pageFrequency: Record<string, number>; // page -> visit count
  hourlyActivity: Record<string, number>; // "page:hour" -> count
  recentQueries: string[]; // last 20 Hermes queries
  commonActions: Record<string, number>; // action -> count
  lastUpdated: string;
}

const MEMORY_KEY = 'hermesMemory';

function uid() {
  return auth?.currentUser?.uid ?? 'shared';
}

export async function trackUsage(page: string, action?: string) {
  if (typeof window === 'undefined' || !db) return;

  const now = new Date();
  const event: UsageEvent = {
    page,
    action,
    hour: now.getHours(),
    dayOfWeek: now.getDay(),
    date: format(now, 'yyyy-MM-dd'),
  };

  try {
    const ref = doc(db, 'households', uid(), 'hermesMemory', MEMORY_KEY);
    const snap = await getDoc(ref);
    const memory: HermesMemory = snap.exists() ? snap.data() as HermesMemory : {
      pageFrequency: {}, hourlyActivity: {}, recentQueries: [], commonActions: {}, lastUpdated: '',
    };

    memory.pageFrequency[page] = (memory.pageFrequency[page] ?? 0) + 1;
    memory.hourlyActivity[`${page}:${event.hour}`] = (memory.hourlyActivity[`${page}:${event.hour}`] ?? 0) + 1;
    if (action) memory.commonActions[action] = (memory.commonActions[action] ?? 0) + 1;
    memory.lastUpdated = now.toISOString();

    await setDoc(ref, memory, { merge: true });
  } catch {
    // Non-critical — never block UI
  }
}

export async function trackHermesQuery(query: string) {
  if (!db) return;
  try {
    const ref = doc(db, 'households', uid(), 'hermesMemory', MEMORY_KEY);
    const snap = await getDoc(ref);
    const memory: HermesMemory = snap.exists() ? snap.data() as HermesMemory : {
      pageFrequency: {}, hourlyActivity: {}, recentQueries: [], commonActions: {}, lastUpdated: '',
    };
    // Keep last 20 queries, stripped to first 80 chars
    memory.recentQueries = [query.slice(0, 80), ...memory.recentQueries].slice(0, 20);
    await setDoc(ref, memory, { merge: true });
  } catch { /* non-critical */ }
}

export async function getHermesMemory(): Promise<HermesMemory | null> {
  if (!db) return null;
  try {
    const ref = doc(db, 'households', uid(), 'hermesMemory', MEMORY_KEY);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() as HermesMemory : null;
  } catch { return null; }
}

export function buildMemorySummary(memory: HermesMemory): string {
  const top = Object.entries(memory.pageFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([p, c]) => `${p}(${c}x)`);

  const peakHours = Object.entries(memory.hourlyActivity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => { const [page, h] = k.split(':'); return `${page} around ${h}:00`; });

  const lines = [
    top.length ? `Most used features: ${top.join(', ')}` : '',
    peakHours.length ? `Peak usage patterns: ${peakHours.join('; ')}` : '',
    memory.recentQueries.length ? `Recent questions: "${memory.recentQueries.slice(0, 3).join('", "')}"` : '',
  ].filter(Boolean);

  return lines.join('\n');
}
