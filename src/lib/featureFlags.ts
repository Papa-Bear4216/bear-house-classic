import { useState, useEffect, useCallback } from 'react';
import { loadJSON, saveJSON, KEYS } from './familyos';
import { onSyncUpdate } from './sync';

export type FeatureFlagKey =
  | 'receipt_scanner'
  | 'streaks_leaderboards'
  | 'connection_health'
  | 'custody_calendar'
  | 'med_tracker'
  | 'shared_routines'
  | 'hermes_neutral'
  | 'weekly_roundup'
  | 'school_adder'
  | 'transaction_review';

export type FeatureCategory = 'Co-Parenting' | 'Daily Rhythm' | 'Household Engagement' | 'Smart Tools';

export interface FeatureFlagMeta {
  key: FeatureFlagKey;
  label: string;
  description: string;
  category: FeatureCategory;
  defaultValue: boolean;
}

export const FEATURE_FLAG_METAS: FeatureFlagMeta[] = [
  {
    key: 'custody_calendar',
    label: 'Custody Calendar & Swaps',
    description: 'Two-household custody schedules, overnight tracking, and parent swap requests.',
    category: 'Co-Parenting',
    defaultValue: true,
  },
  {
    key: 'med_tracker',
    label: 'Medication Tracker & Dosing Log',
    description: 'Dose logging, refills, and caregiver handoff notes.',
    category: 'Co-Parenting',
    defaultValue: true,
  },
  {
    key: 'hermes_neutral',
    label: 'Hermes Neutral Mode',
    description: 'Unbiased co-parent mediation tone and conflict-deescalating communications.',
    category: 'Co-Parenting',
    defaultValue: false,
  },
  {
    key: 'shared_routines',
    label: 'Shared Routines & Rewards',
    description: 'Bedtime and school-prep routines with Home Assistant scene triggers.',
    category: 'Daily Rhythm',
    defaultValue: true,
  },
  {
    key: 'weekly_roundup',
    label: 'Weekly Family Digest',
    description: 'Automated weekly roundup of chores, expenses, and upcoming events.',
    category: 'Daily Rhythm',
    defaultValue: true,
  },
  {
    key: 'streaks_leaderboards',
    label: 'Streaks & Leaderboards',
    description: 'Gamified chore completion streaks and friendly family point leaderboards.',
    category: 'Household Engagement',
    defaultValue: true,
  },
  {
    key: 'receipt_scanner',
    label: 'Receipt & Pantry Scanner',
    description: 'Camera and OCR scanning for purchase receipts and instant pantry stock updates.',
    category: 'Smart Tools',
    defaultValue: true,
  },
  {
    key: 'connection_health',
    label: 'Integration Health Watch',
    description: 'Real-time connection freshness and diagnostic telemetry for external services.',
    category: 'Smart Tools',
    defaultValue: true,
  },
  {
    key: 'school_adder',
    label: 'School Stuff Adder',
    description: 'Email triage for school announcements, dates, and sign-offs.',
    category: 'Smart Tools',
    defaultValue: true,
  },
  {
    key: 'transaction_review',
    label: 'Transaction Categorization & Review',
    description: 'Review uncertain transactions, 1-tap confirm or recategorize, compounding accuracy over time.',
    category: 'Smart Tools',
    defaultValue: true,
  },
];

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = Object.fromEntries(
  FEATURE_FLAG_METAS.map((m) => [m.key, m.defaultValue])
) as Record<FeatureFlagKey, boolean>;

const VALID_FEATURE_KEYS = new Set<string>(FEATURE_FLAG_METAS.map((m) => m.key));

export function getStoredOverrides(): Partial<Record<FeatureFlagKey, boolean>> {
  const raw = loadJSON<unknown>(KEYS.featureFlags, {});
  const validated: Partial<Record<FeatureFlagKey, boolean>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return validated;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (VALID_FEATURE_KEYS.has(k) && typeof v === 'boolean') {
      validated[k as FeatureFlagKey] = v;
    }
  }
  return validated;
}

export function getFeatureFlags(): Record<FeatureFlagKey, boolean> {
  const stored = getStoredOverrides();
  return { ...DEFAULT_FEATURE_FLAGS, ...stored };
}

export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  const flags = getFeatureFlags();
  return flags[key] ?? DEFAULT_FEATURE_FLAGS[key] ?? true;
}

export function setFeatureFlag(key: FeatureFlagKey, enabled: boolean): void {
  const stored = getStoredOverrides();
  const updated = { ...stored, [key]: enabled };
  saveJSON(KEYS.featureFlags, updated);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('familyos:feature_flags_changed', { detail: { key, enabled } }));
  }
}

export function resetFeatureFlags(): void {
  saveJSON(KEYS.featureFlags, {});
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('familyos:feature_flags_changed'));
  }
}

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => isFeatureEnabled(key));

  useEffect(() => {
    setEnabled(isFeatureEnabled(key));
    const update = () => {
      setEnabled(isFeatureEnabled(key));
    };

    const handleCustom = (e: Event) => {
      const custom = e as CustomEvent<{ key?: FeatureFlagKey; enabled?: boolean }>;
      if (!custom.detail?.key || custom.detail.key === key) {
        update();
      }
    };

    const unsubscribeSync = onSyncUpdate((syncKey) => {
      if (syncKey === KEYS.featureFlags) {
        update();
      }
    });

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === KEYS.featureFlags) update();
    };

    window.addEventListener('familyos:feature_flags_changed', handleCustom);
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubscribeSync();
      window.removeEventListener('familyos:feature_flags_changed', handleCustom);
      window.removeEventListener('storage', handleStorage);
    };
  }, [key]);

  return enabled;
}

export function useFeatureFlags(): {
  flags: Record<FeatureFlagKey, boolean>;
  setFlag: (key: FeatureFlagKey, enabled: boolean) => void;
  resetFlags: () => void;
} {
  const [flags, setFlags] = useState<Record<FeatureFlagKey, boolean>>(() => getFeatureFlags());

  const refresh = useCallback(() => {
    setFlags(getFeatureFlags());
  }, []);

  useEffect(() => {
    const handleCustom = () => refresh();
    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === KEYS.featureFlags) refresh();
    };
    const unsubscribeSync = onSyncUpdate((syncKey) => {
      if (syncKey === KEYS.featureFlags) refresh();
    });

    window.addEventListener('familyos:feature_flags_changed', handleCustom);
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubscribeSync();
      window.removeEventListener('familyos:feature_flags_changed', handleCustom);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refresh]);

  const handleSetFlag = useCallback((key: FeatureFlagKey, enabled: boolean) => {
    setFeatureFlag(key, enabled);
    setFlags((prev) => ({ ...prev, [key]: enabled }));
  }, []);

  const handleReset = useCallback(() => {
    resetFeatureFlags();
    setFlags(DEFAULT_FEATURE_FLAGS);
  }, []);

  return {
    flags,
    setFlag: handleSetFlag,
    resetFlags: handleReset,
  };
}
