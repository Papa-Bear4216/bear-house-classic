// ADHD Brain Battery Tracker

export type BatteryLevel = 'high' | 'medium' | 'low' | 'fried';

export interface BatteryConfig {
  id: BatteryLevel;
  label: string;
  tagline: string;
  emoji: string;
  badgeClass: string;
  borderClass: string;
  bgGlow: string;
  tip: string;
}

export const BATTERY_LEVELS: Record<BatteryLevel, BatteryConfig> = {
  high: {
    id: 'high',
    label: 'High Voltage',
    tagline: 'Hyperfocus unlocked',
    emoji: '⚡',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    borderClass: 'border-emerald-500/30',
    bgGlow: 'from-emerald-500/10 via-transparent to-transparent',
    tip: 'Riding the wave! Knock out that dreaded high-friction task right now.',
  },
  medium: {
    id: 'medium',
    label: 'Cruising',
    tagline: 'Steady momentum',
    emoji: '🔋',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    borderClass: 'border-amber-500/30',
    bgGlow: 'from-amber-500/10 via-transparent to-transparent',
    tip: 'Solid flow. Stick to bite-sized 10-minute tasks to keep rolling.',
  },
  low: {
    id: 'low',
    label: 'Low Battery',
    tagline: 'Gentle wins only',
    emoji: '🪫',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    borderClass: 'border-orange-500/30',
    bgGlow: 'from-orange-500/10 via-transparent to-transparent',
    tip: 'Be kind to your brain. Pick one effortless 2-minute chore or just rest.',
  },
  fried: {
    id: 'fried',
    label: 'Hot Mess Express',
    tagline: 'Executive burnout mode',
    emoji: '🤯',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse',
    borderClass: 'border-rose-500/30',
    bgGlow: 'from-rose-500/15 via-transparent to-transparent',
    tip: 'Executive dysfunction is real. Zero guilt today. Just drink water and breathe.',
  },
};

const STORAGE_KEY = 'familyos_brain_battery';

export function getBrainBattery(): BatteryLevel {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as BatteryLevel | null;
    if (saved && BATTERY_LEVELS[saved]) return saved;
  } catch {}
  return 'medium';
}

export function setBrainBattery(level: BatteryLevel) {
  try {
    localStorage.setItem(STORAGE_KEY, level);
    window.dispatchEvent(new CustomEvent('familyos:battery-changed', { detail: level }));
  } catch {}
}
