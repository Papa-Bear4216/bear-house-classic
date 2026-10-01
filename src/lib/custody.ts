// src/lib/custody.ts
// Custody Schedule & Calm Swap Coordination for Hot Mess Express / FamilyOS
import { loadJSON, saveJSON, uid, KEYS, UserRole } from './familyos';

export type CustodyPattern = 'alternating_weeks' | '2-2-3' | '2-2-5-5' | 'custom';

export interface CustodySchedule {
  id: string;
  pattern: CustodyPattern;
  startDate: string; // YYYY-MM-DD anchor date
  primaryHouseName: string; // e.g. "Mom's House" or "House A"
  secondaryHouseName: string; // e.g. "Dad's House" or "House B"
  primaryParentName: string;
  secondaryParentName: string;
  transitionTime: string; // e.g. "17:00"
  overrides?: Record<string, 'primary' | 'secondary'>; // date string -> house
  children?: string[]; // child names covered by this schedule
}

export interface CustodySwapRequest {
  id: string;
  childName: string; // specific child name or "All Children"
  requesterId: string;
  requesterName: string;
  targetHouse: 'primary' | 'secondary'; // house destination for the child on currentDate
  currentDate: string; // YYYY-MM-DD of the day to swap
  makeupDate?: string; // optional YYYY-MM-DD offered in return (goes to opposite house)
  reason?: string;
  status: 'pending' | 'approved' | 'declined' | 'cancelled';
  createdAt: number;
  resolvedAt?: number;
  responderId?: string;
  responderName?: string;
  responseNote?: string;
}

export const DEFAULT_CUSTODY_SCHEDULE: CustodySchedule = {
  id: 'default-custody',
  pattern: '2-2-3',
  startDate: '2026-01-05', // Fixed, stable anchor (Monday)
  primaryHouseName: "Mom's House",
  secondaryHouseName: "Dad's House",
  primaryParentName: 'Mom',
  secondaryParentName: 'Dad',
  transitionTime: '17:00',
  overrides: {},
  children: [],
};

// Patterns defined by daily sequence of house designations starting from anchor date
// 'P' = Primary, 'S' = Secondary
export const PATTERN_SEQUENCES: Record<Exclude<CustodyPattern, 'custom'>, ('P' | 'S')[]> = {
  // 7 days primary, 7 days secondary
  alternating_weeks: [
    'P', 'P', 'P', 'P', 'P', 'P', 'P',
    'S', 'S', 'S', 'S', 'S', 'S', 'S',
  ],
  // 14-day cycle: Week 1: 2P, 2S, 3P. Week 2: 2S, 2P, 3S.
  '2-2-3': [
    'P', 'P', 'S', 'S', 'P', 'P', 'P',
    'S', 'S', 'P', 'P', 'S', 'S', 'S',
  ],
  // 14-day cycle: 2P, 2S, 5P, 5S.
  '2-2-5-5': [
    'P', 'P', 'S', 'S', 'P', 'P', 'P', 'P', 'P',
    'S', 'S', 'S', 'S', 'S',
  ],
};

export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateToDays(dateStr: string): number {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NaN;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) {
    return NaN;
  }
  return Math.floor(Date.UTC(y, m - 1, d) / (1000 * 60 * 60 * 24));
}

/**
 * Computes which household has custody for a given calendar day (YYYY-MM-DD).
 * Checks overrides and approved swaps first, then falls back to repeating pattern.
 * If childName is specified, matches swaps for that child or "All Children".
 * If childName is undefined ("All"), only swaps for "All Children" apply to avoid individual swaps leaking.
 */
export function getHouseForDate(
  dateStr: string,
  schedule: CustodySchedule,
  swaps: CustodySwapRequest[] = [],
  childName?: string,
): 'primary' | 'secondary' {
  // 1. Direct manual calendar overrides
  if (schedule.overrides && schedule.overrides[dateStr]) {
    return schedule.overrides[dateStr];
  }

  // 2. Approved swap requests (sorted by resolvedAt descending so latest resolution wins)
  const matchingApprovedSwaps = swaps
    .filter((s) => {
      if (s.status !== 'approved') return false;
      if (s.currentDate !== dateStr && s.makeupDate !== dateStr) return false;
      if (childName) {
        // Child-specific query: matches this child or whole-family swaps
        if (s.childName !== 'All Children' && s.childName !== childName) return false;
      } else {
        // Global view: only whole-family swaps apply globally
        if (s.childName !== 'All Children') return false;
      }
      return true;
    })
    .sort((a, b) => (b.resolvedAt || b.createdAt) - (a.resolvedAt || a.createdAt));

  const activeSwap = matchingApprovedSwaps[0];
  if (activeSwap) {
    if (activeSwap.currentDate === dateStr) {
      return activeSwap.targetHouse;
    }
    if (activeSwap.makeupDate === dateStr) {
      // Makeup date returns child to opposite house
      return activeSwap.targetHouse === 'primary' ? 'secondary' : 'primary';
    }
  }

  // 3. Repeating pattern
  if (schedule.pattern === 'custom') {
    return 'primary';
  }

  const seq = PATTERN_SEQUENCES[schedule.pattern];
  if (!seq || seq.length === 0) return 'primary';

  const anchorDays = parseDateToDays(schedule.startDate);
  const targetDays = parseDateToDays(dateStr);
  if (isNaN(anchorDays) || isNaN(targetDays)) {
    return 'primary';
  }

  const diff = targetDays - anchorDays;

  // Handle modulo properly for past dates
  const cycleIndex = ((diff % seq.length) + seq.length) % seq.length;
  return seq[cycleIndex] === 'P' ? 'primary' : 'secondary';
}

/**
 * Calculates total overnight count and percentages between two dates.
 */
export function calculateOvernights(
  startDateStr: string,
  endDateStr: string,
  schedule: CustodySchedule,
  swaps: CustodySwapRequest[] = [],
  childName?: string,
): { primary: number; secondary: number; total: number; primaryPercent: number; secondaryPercent: number } {
  let primaryCount = 0;
  let secondaryCount = 0;

  const startDays = parseDateToDays(startDateStr);
  const endDays = parseDateToDays(endDateStr);

  if (isNaN(startDays) || isNaN(endDays) || startDays > endDays) {
    return { primary: 0, secondary: 0, total: 0, primaryPercent: 50, secondaryPercent: 50 };
  }

  for (let d = startDays; d <= endDays; d++) {
    const cur = new Date(d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const house = getHouseForDate(cur, schedule, swaps, childName);
    if (house === 'primary') primaryCount++;
    else secondaryCount++;
  }

  const total = primaryCount + secondaryCount;
  const primaryPercent = total > 0 ? Math.round((primaryCount / total) * 100) : 50;
  const secondaryPercent = total > 0 ? 100 - primaryPercent : 50;

  return { primary: primaryCount, secondary: secondaryCount, total, primaryPercent, secondaryPercent };
}

// ── Storage Helpers ─────────────────────────────────────────────────────────

export function loadCustodySchedule(): CustodySchedule {
  const stored = loadJSON<CustodySchedule | null>(KEYS.custodySchedule, null);
  if (stored && stored.startDate && /^\d{4}-\d{2}-\d{2}$/.test(stored.startDate)) {
    return stored;
  }
  saveJSON(KEYS.custodySchedule, DEFAULT_CUSTODY_SCHEDULE);
  return DEFAULT_CUSTODY_SCHEDULE;
}

export function saveCustodySchedule(schedule: CustodySchedule): void {
  const toSave: CustodySchedule = { ...schedule };
  if (!toSave.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(toSave.startDate)) {
    toSave.startDate = DEFAULT_CUSTODY_SCHEDULE.startDate;
  }
  saveJSON(KEYS.custodySchedule, toSave);
}

export function loadCustodySwaps(): CustodySwapRequest[] {
  return loadJSON<CustodySwapRequest[]>(KEYS.custodySwaps, []);
}

export function saveCustodySwaps(swaps: CustodySwapRequest[]): void {
  saveJSON(KEYS.custodySwaps, swaps);
}

export function createCustodySwap(params: {
  childName: string;
  requesterId: string;
  requesterName: string;
  requesterRole?: UserRole;
  targetHouse: 'primary' | 'secondary';
  currentDate: string;
  makeupDate?: string;
  reason?: string;
}): { ok: boolean; error?: string; swap?: CustodySwapRequest } {
  // Role gate: only admins/parents can coordinate swaps
  if (params.requesterRole && params.requesterRole !== 'admin' && params.requesterRole !== 'superadmin') {
    return { ok: false, error: 'Only parents or administrators can request custody swaps.' };
  }

  if (!params.currentDate || !/^\d{4}-\d{2}-\d{2}$/.test(params.currentDate)) {
    return { ok: false, error: 'Valid date to swap is required.' };
  }
  if (!params.requesterId) {
    return { ok: false, error: 'Valid requester account is required.' };
  }
  if (params.makeupDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.makeupDate)) {
      return { ok: false, error: 'Invalid makeup date format.' };
    }
    if (params.makeupDate === params.currentDate) {
      return { ok: false, error: 'Makeup date cannot be the same as swap date.' };
    }
  }

  const currentSwaps = loadCustodySwaps();

  const newSwap: CustodySwapRequest = {
    id: uid(),
    childName: params.childName.trim() || 'All Children',
    requesterId: params.requesterId,
    requesterName: params.requesterName.trim() || 'Parent',
    targetHouse: params.targetHouse,
    currentDate: params.currentDate,
    makeupDate: params.makeupDate || undefined,
    reason: params.reason?.trim() || undefined,
    status: 'pending',
    createdAt: Date.now(),
  };

  saveCustodySwaps([newSwap, ...currentSwaps]);
  return { ok: true, swap: newSwap };
}

export interface SwapResponseResult {
  ok: boolean;
  error?: string;
  swap?: CustodySwapRequest;
}

export function respondToCustodySwap(params: {
  swapId: string;
  decision: 'approved' | 'declined' | 'cancelled';
  responderId: string;
  responderName: string;
  responderRole?: UserRole;
  responseNote?: string;
}): SwapResponseResult {
  const current = loadCustodySwaps();
  const idx = current.findIndex((s) => s.id === params.swapId);
  if (idx === -1) {
    return { ok: false, error: 'Swap request not found.' };
  }

  const target = current[idx];

  // 1. Guard against non-pending modifications
  if (target.status !== 'pending') {
    return { ok: false, error: `This request is already ${target.status}.` };
  }

  const isRequester =
    params.responderId && target.requesterId
      ? params.responderId === target.requesterId
      : params.responderName.trim().toLowerCase() === target.requesterName.trim().toLowerCase();

  // 2. Cancellation: Requester can cancel their own pending swap
  if (params.decision === 'cancelled') {
    if (!isRequester && params.responderRole !== 'superadmin') {
      return { ok: false, error: 'Only the requester can cancel this request.' };
    }
    const cancelled: CustodySwapRequest = {
      ...target,
      status: 'cancelled',
      resolvedAt: Date.now(),
      responderId: params.responderId,
      responderName: params.responderName.trim(),
      responseNote: params.responseNote?.trim() || 'Cancelled by requester',
    };
    current[idx] = cancelled;
    saveCustodySwaps(current);
    return { ok: true, swap: cancelled };
  }

  // 3. Approve / Decline: Requester CANNOT approve/decline their own request
  if (isRequester) {
    return { ok: false, error: 'A requester cannot approve or decline their own swap request.' };
  }

  // 4. Role gate: only co-parent admins can approve or decline
  if (params.responderRole && params.responderRole !== 'admin' && params.responderRole !== 'superadmin') {
    return { ok: false, error: 'Only parents or administrators can approve or decline custody swaps.' };
  }

  // 5. Prevent conflicting overlapping approvals for the same child
  if (params.decision === 'approved') {
    const conflict = current.find((s) => {
      if (s.id === target.id || s.status !== 'approved') return false;
      const childMatch =
        s.childName === 'All Children' ||
        target.childName === 'All Children' ||
        s.childName === target.childName;
      if (!childMatch) return false;

      const datesToMatch = [s.currentDate, s.makeupDate].filter(Boolean);
      return (
        datesToMatch.includes(target.currentDate) ||
        (target.makeupDate && datesToMatch.includes(target.makeupDate))
      );
    });

    if (conflict) {
      return {
        ok: false,
        error: `Conflicting swap already approved for ${target.childName} on this date.`,
      };
    }
  }

  const updated: CustodySwapRequest = {
    ...target,
    status: params.decision,
    resolvedAt: Date.now(),
    responderId: params.responderId,
    responderName: params.responderName.trim(),
    responseNote: params.responseNote?.trim() || undefined,
  };

  current[idx] = updated;
  saveCustodySwaps(current);
  return { ok: true, swap: updated };
}
