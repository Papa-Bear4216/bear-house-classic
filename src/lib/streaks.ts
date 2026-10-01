// src/lib/streaks.ts
// Streaks & Leaderboard Engine for Hot Mess Express / FamilyOS
import { loadJSON, saveJSON, KEYS } from './familyos';

export interface MemberStreak {
  memberId: string;
  memberName: string;
  currentStreak: number; // Consecutive active days
  longestStreak: number; // All-time best
  lastActiveDate: string; // YYYY-MM-DD
  activeToday: boolean;
}

export interface LeaderboardEntry {
  memberId: string;
  memberName: string;
  memberColor: string;
  role: string;
  points: number;
  currentStreak: number;
  longestStreak: number;
  activeToday: boolean;
  rank: number;
}

export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getLocalDateString(yesterday);
}

export function loadMemberStreaks(): Record<string, MemberStreak> {
  return loadJSON<Record<string, MemberStreak>>(KEYS.memberStreaks, {});
}

export function saveMemberStreaks(streaks: Record<string, MemberStreak>): void {
  saveJSON(KEYS.memberStreaks, streaks);
}

/**
 * Returns a computed streak status for a given member, checking date freshness.
 */
export function getMemberStreak(memberId: string, memberName: string = 'Family Member'): MemberStreak {
  const streaks = loadMemberStreaks();
  const todayStr = getLocalDateString();
  const yesterdayStr = getYesterdayDateString();

  const record = streaks[memberId];
  if (!record) {
    return {
      memberId,
      memberName,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: '',
      activeToday: false,
    };
  }

  const activeToday = record.lastActiveDate === todayStr;
  let currentStreak = record.currentStreak;

  // If last active was before yesterday, the streak expired
  if (record.lastActiveDate !== todayStr && record.lastActiveDate !== yesterdayStr) {
    currentStreak = 0;
  }

  return {
    ...record,
    memberName: record.memberName || memberName,
    currentStreak,
    activeToday,
  };
}

/**
 * Records a chore or routine completion for a member today, advancing their streak.
 */
export function recordMemberActivityForToday(memberId: string, memberName: string): MemberStreak {
  const streaks = loadMemberStreaks();
  const todayStr = getLocalDateString();
  const yesterdayStr = getYesterdayDateString();

  const existing = streaks[memberId];
  let currentStreak = 1;
  let longestStreak = 1;

  if (existing) {
    if (existing.lastActiveDate === todayStr) {
      // Already logged activity today; streak is already counted
      return { ...existing, activeToday: true };
    }

    if (existing.lastActiveDate === yesterdayStr) {
      // Activity on consecutive days: streak increases!
      currentStreak = (existing.currentStreak || 0) + 1;
    } else {
      // Missed one or more days: streak restarts at 1
      currentStreak = 1;
    }
    longestStreak = Math.max(existing.longestStreak || 0, currentStreak);
  }

  const updated: MemberStreak = {
    memberId,
    memberName,
    currentStreak,
    longestStreak,
    lastActiveDate: todayStr,
    activeToday: true,
  };

  streaks[memberId] = updated;
  saveMemberStreaks(streaks);
  return updated;
}

/**
 * Computes the full family leaderboard combining points, active streaks, and member roles.
 */
export function computeFamilyLeaderboard(
  members: { id: string; name: string; role: string; color: string }[],
  pointsBalance: Record<string, number> = {}
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = members
    .filter((m) => m.role !== 'pet')
    .map((m) => {
      const streak = getMemberStreak(m.id, m.name);
      const points = pointsBalance[m.id] ?? 0;
      return {
        memberId: m.id,
        memberName: m.name,
        memberColor: m.color,
        role: m.role,
        points,
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        activeToday: streak.activeToday,
        rank: 1,
      };
    });

  // Sort by points descending; tiebreaker by current streak descending
  entries.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.currentStreak - a.currentStreak;
  });

  // Assign ranks
  return entries.map((e, idx) => ({ ...e, rank: idx + 1 }));
}
