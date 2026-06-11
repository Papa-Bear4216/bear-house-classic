'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

export type WidgetId =
  | 'daily-brief'
  | 'my-tasks'
  | 'family-tasks'
  | 'todays-schedule'
  | 'meal-tonight'
  | 'budget-pulse'
  | 'my-missions'
  | 'family-status'
  | 'quick-add'
  | 'shopping-reminder';

export interface WidgetConfig {
  id: WidgetId;
  enabled: boolean;
  order: number;
}

export interface DashboardConfig {
  widgets: WidgetConfig[];
}

const PARENT_DEFAULT: WidgetConfig[] = [
  { id: 'daily-brief', enabled: true, order: 0 },
  { id: 'todays-schedule', enabled: true, order: 1 },
  { id: 'family-tasks', enabled: true, order: 2 },
  { id: 'meal-tonight', enabled: true, order: 3 },
  { id: 'budget-pulse', enabled: true, order: 4 },
  { id: 'family-status', enabled: true, order: 5 },
  { id: 'shopping-reminder', enabled: true, order: 6 },
  { id: 'quick-add', enabled: true, order: 7 },
  { id: 'my-tasks', enabled: false, order: 8 },
  { id: 'my-missions', enabled: false, order: 9 },
];

const CHILD_DEFAULT: WidgetConfig[] = [
  { id: 'daily-brief', enabled: true, order: 0 },
  { id: 'my-missions', enabled: true, order: 1 },
  { id: 'my-tasks', enabled: true, order: 2 },
  { id: 'todays-schedule', enabled: true, order: 3 },
  { id: 'meal-tonight', enabled: true, order: 4 },
  { id: 'quick-add', enabled: true, order: 5 },
  { id: 'family-status', enabled: false, order: 6 },
  { id: 'family-tasks', enabled: false, order: 7 },
  { id: 'budget-pulse', enabled: false, order: 8 },
  { id: 'shopping-reminder', enabled: false, order: 9 },
];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  'daily-brief': '🤖 Hermes Daily Brief',
  'my-tasks': '✅ My Tasks',
  'family-tasks': '👨‍👩‍👧 Family Tasks',
  'todays-schedule': '📅 Today\'s Schedule',
  'meal-tonight': '🍽️ Meal Tonight',
  'budget-pulse': '💰 Budget Pulse',
  'my-missions': '🎮 My Missions',
  'family-status': '👥 Family Status',
  'quick-add': '⚡ Quick Add',
  'shopping-reminder': '🛒 Shopping Reminder',
};

export function useDashboard(userId: string, role: string) {
  const isParent = role === 'admin' || role === 'superadmin' || role === 'parent';
  const defaultWidgets = isParent ? PARENT_DEFAULT : CHILD_DEFAULT;

  const [config, setConfig] = useState<DashboardConfig>({ widgets: defaultWidgets });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!db || !userId) { setLoaded(true); return; }
    const uid = auth?.currentUser?.uid ?? 'shared';
    const ref = doc(db, 'households', uid, 'dashboardConfig', userId);

    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        setConfig(snap.data() as DashboardConfig);
      } else {
        setConfig({ widgets: defaultWidgets });
      }
      setLoaded(true);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  async function saveConfig(updated: DashboardConfig) {
    if (!db) return;
    const uid = auth?.currentUser?.uid ?? 'shared';
    const ref = doc(db, 'households', uid, 'dashboardConfig', userId);
    await setDoc(ref, updated);
    setConfig(updated);
  }

  async function toggleWidget(id: WidgetId) {
    const updated = {
      widgets: config.widgets.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w),
    };
    await saveConfig(updated);
  }

  async function moveWidget(id: WidgetId, direction: 'up' | 'down') {
    const sorted = [...config.widgets].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(w => w.id === id);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === sorted.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const newOrder = sorted.map((w, i) => {
      if (i === idx) return { ...w, order: sorted[swapIdx].order };
      if (i === swapIdx) return { ...w, order: sorted[idx].order };
      return w;
    });
    await saveConfig({ widgets: newOrder });
  }

  const enabledWidgets = [...config.widgets]
    .filter(w => w.enabled)
    .sort((a, b) => a.order - b.order);

  return { config, loaded, enabledWidgets, toggleWidget, moveWidget };
}
