'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

export interface PointSettings {
  autoAward: boolean;
  easyPoints: number;
  mediumPoints: number;
  hardPoints: number;
  defaultTaskPoints: number;
  streakBonus: boolean;
  streakDays: number;
  streakBonusPoints: number;
}

export interface FeatureSettings {
  showBudget: boolean;
  showScanner: boolean;
  showGallery: boolean;
  showCalls: boolean;
  showMap: boolean;
  showRewards: boolean;
  showGames: boolean;
}

export interface AppSettings {
  points: PointSettings;
  features: FeatureSettings;
}

const DEFAULTS: AppSettings = {
  points: {
    autoAward: true,
    easyPoints: 15,
    mediumPoints: 30,
    hardPoints: 50,
    defaultTaskPoints: 10,
    streakBonus: false,
    streakDays: 7,
    streakBonusPoints: 25,
  },
  features: {
    showBudget: true,
    showScanner: true,
    showGallery: true,
    showCalls: true,
    showMap: true,
    showRewards: true,
    showGames: true,
  },
};

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const uid = () => auth?.currentUser?.uid ?? 'shared';

  useEffect(() => {
    if (!db) { setLoading(false); return; }
    const ref = doc(db, 'households', uid(), 'settings', 'app');
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = snap.data();
        setSettingsState({
          points: { ...DEFAULTS.points, ...(data.points ?? {}) },
          features: { ...DEFAULTS.features, ...(data.features ?? {}) },
        });
      } else {
        setSettingsState(DEFAULTS);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function saveSettings(updates: Partial<AppSettings>) {
    if (!db) return;
    const merged: AppSettings = {
      points: { ...settings.points, ...(updates.points ?? {}) },
      features: { ...settings.features, ...(updates.features ?? {}) },
    };
    setSettingsState(merged);
    await setDoc(doc(db, 'households', uid(), 'settings', 'app'), merged, { merge: true });
  }

  async function updatePointSettings(updates: Partial<PointSettings>) {
    await saveSettings({ points: { ...settings.points, ...updates } });
  }

  async function updateFeatureSettings(updates: Partial<FeatureSettings>) {
    await saveSettings({ features: { ...settings.features, ...updates } });
  }

  return { settings, loading, saveSettings, updatePointSettings, updateFeatureSettings };
}
