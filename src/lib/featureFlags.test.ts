import { describe, it, expect, beforeEach, vi } from 'vitest';

const { store, dispatchFn } = vi.hoisted(() => {
  const store = new Map<string, string>();
  const dispatchFn = vi.fn();
  return { store, dispatchFn };
});

vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
});

vi.stubGlobal('window', {
  dispatchEvent: dispatchFn,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

import {
  getFeatureFlags,
  isFeatureEnabled,
  setFeatureFlag,
  resetFeatureFlags,
  FEATURE_FLAG_METAS,
  DEFAULT_FEATURE_FLAGS,
} from './featureFlags';
import { KEYS } from './familyos';

describe('Feature Switchboard (featureFlags)', () => {
  beforeEach(() => {
    store.clear();
    dispatchFn.mockClear();
  });

  it('exposes metadata for all 9 planned features', () => {
    expect(FEATURE_FLAG_METAS).toHaveLength(9);
    const keys = FEATURE_FLAG_METAS.map((m) => m.key);
    expect(keys).toContain('custody_calendar');
    expect(keys).toContain('med_tracker');
    expect(keys).toContain('hermes_neutral');
    expect(keys).toContain('shared_routines');
    expect(keys).toContain('weekly_roundup');
    expect(keys).toContain('streaks_leaderboards');
    expect(keys).toContain('receipt_scanner');
    expect(keys).toContain('connection_health');
    expect(keys).toContain('school_adder');
  });

  it('defaults planned features according to their metadata', () => {
    const flags = getFeatureFlags();
    expect(flags).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(isFeatureEnabled('custody_calendar')).toBe(true);
    expect(isFeatureEnabled('med_tracker')).toBe(true);
    expect(isFeatureEnabled('hermes_neutral')).toBe(false);
  });

  it('allows disabling and enabling individual features', () => {
    setFeatureFlag('custody_calendar', false);
    expect(isFeatureEnabled('custody_calendar')).toBe(false);
    expect(isFeatureEnabled('med_tracker')).toBe(true); // other flags untouched

    expect(dispatchFn).toHaveBeenCalled();
    const event = dispatchFn.mock.calls.find((c: any) => c[0]?.type === 'familyos:feature_flags_changed')?.[0] as CustomEvent;
    expect(event).toBeDefined();
    expect(event.detail).toEqual({ key: 'custody_calendar', enabled: false });

    // Stored in localStorage under KEYS.featureFlags as sparse override
    const stored = JSON.parse(store.get(KEYS.featureFlags) || '{}');
    expect(stored).toEqual({ custody_calendar: false });

    // Re-enable
    setFeatureFlag('custody_calendar', true);
    expect(isFeatureEnabled('custody_calendar')).toBe(true);
  });

  it('resets all feature flags back to defaults', () => {
    setFeatureFlag('receipt_scanner', false);
    setFeatureFlag('school_adder', false);
    expect(isFeatureEnabled('receipt_scanner')).toBe(false);
    expect(isFeatureEnabled('school_adder')).toBe(false);

    resetFeatureFlags();
    expect(isFeatureEnabled('receipt_scanner')).toBe(true);
    expect(isFeatureEnabled('school_adder')).toBe(true);

    const stored = JSON.parse(store.get(KEYS.featureFlags) || '{}');
    expect(stored).toEqual({});
  });
});
