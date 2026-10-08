// src/lib/custody.ts
// Custody Schedule & Calm Swap Coordination for Hot Mess Express / FamilyOS
import { loadJSON, saveJSON, uid, KEYS, UserRole } from './familyos';

export type CustodyPattern =
  | 'alternating_weeks'
  | '2-2-3'
  | '2-2-5-5'
  | 'split_day_alternating_weekends'
  | 'custom';

export interface CustomCustodyConfig {
  splitDayEnabled: boolean;
  morningSchoolParent: 'primary' | 'secondary';   // Residential parent handles wake up & school (Dad)
  afterSchoolParent: 'primary' | 'secondary';     // Parent providing after-school care (Mom)
  afterSchoolStartTime?: string;                  // e.g. "15:00" (after school)
  afterSchoolEndTime: string;                     // e.g. "19:30" (7:30 PM return)
  bedtimeOvernightParent: 'primary' | 'secondary'; // Residential parent handles bedtime & sleep (Dad)
  weekendPattern: 'alternating' | 'primary' | 'secondary';
  firstWeekendParent: 'primary' | 'secondary';    // Which parent has the first weekend on/after anchor
  holidayPolicy: 'working_out' | 'alternating' | 'custom_notes';
  holidayNotes: string;                           // e.g. "Holidays working out mutually as they arise."
  notes?: string;
}

export interface CustodySchedule {
  id: string;
  pattern: CustodyPattern;
  startDate: string; // YYYY-MM-DD anchor date
  primaryHouseName: string; // e.g. "Dad's House" or "House A"
  secondaryHouseName: string; // e.g. "Mom's House" or "House B"
  primaryParentName: string;
  secondaryParentName: string;
  transitionTime: string; // e.g. "17:00" or "19:30"
  overrides?: Record<string, 'primary' | 'secondary'>; // date string -> house
  children?: string[]; // child names covered by this schedule
  customConfig?: CustomCustodyConfig;
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

export const DEFAULT_NON_TRADITIONAL_CONFIG: CustomCustodyConfig = {
  splitDayEnabled: true,
  morningSchoolParent: 'primary',   // Dad (Primary residential parent)
  afterSchoolParent: 'secondary',   // Mom (Secondary after-school parent)
  afterSchoolStartTime: '15:00',
  afterSchoolEndTime: '19:30',      // 7:30 PM
  bedtimeOvernightParent: 'primary', // Dad (Primary residential parent)
  weekendPattern: 'alternating',
  firstWeekendParent: 'primary',    // Dad weekend 1, Mom weekend 2
  holidayPolicy: 'working_out',
  holidayNotes: 'Holidays working out mutually as they arise.',
  notes: 'Wake up, school, and bed with Dad (Primary). Mom (Secondary) after school till 7:30 PM. Alternate weekends, holidays working out.',
};

export const DEFAULT_CUSTODY_SCHEDULE: CustodySchedule = {
  id: 'default-custody',
  pattern: '2-2-3',
  startDate: '2026-01-05', // Fixed, stable anchor (Monday)
  primaryHouseName: "Dad's House",
  secondaryHouseName: "Mom's House",
  primaryParentName: 'Dad',
  secondaryParentName: 'Mom',
  transitionTime: '17:00',
  overrides: {},
  children: [],
  customConfig: DEFAULT_NON_TRADITIONAL_CONFIG,
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
  // 14-day cycle: Week 1: 7 days Dad overnight (Primary). Week 2: 4 days Dad overnight (Primary), 3 days Mom weekend (Secondary).
  split_day_alternating_weekends: [
    'P', 'P', 'P', 'P', 'P', 'P', 'P',
    'P', 'P', 'P', 'P', 'S', 'S', 'S',
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
  if (schedule.pattern === 'split_day_alternating_weekends') {
    return resolveNonTraditionalOvernight(dateStr, schedule);
  }

  if (schedule.pattern === 'custom') {
    return resolveCustomPatternHouse(dateStr, schedule);
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
 * Resolves the overnight household for custom or non-traditional schedules.
 * Defaults to weekday split where bedtime/overnight is with primary parent (Dad)
 * and alternating weekends rotate between Dad and Mom.
 */
export function resolveCustomPatternHouse(
  dateStr: string,
  schedule: CustodySchedule,
): 'primary' | 'secondary' {
  const config = schedule.customConfig || DEFAULT_NON_TRADITIONAL_CONFIG;
  const anchorDays = parseDateToDays(schedule.startDate);
  const targetDays = parseDateToDays(dateStr);
  if (isNaN(anchorDays) || isNaN(targetDays)) {
    return config.bedtimeOvernightParent || 'primary';
  }

  // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const dayOfWeek = ((targetDays + 4) % 7 + 7) % 7;
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;

  if (!isWeekend) {
    // Weekday (Mon-Thu): overnight is with designated bedtime/overnight parent (Primary parent / Dad)
    return config.bedtimeOvernightParent || 'primary';
  }

  // Weekend: rotation check
  if (config.weekendPattern === 'primary') return 'primary';
  if (config.weekendPattern === 'secondary') return 'secondary';

  // Alternating weekends:
  // Normalize both dates to their week's Monday (day 1) to determine week offset
  const anchorDow = ((anchorDays + 4) % 7 + 7) % 7;
  const daysSinceMondayAnchor = anchorDow === 0 ? 6 : anchorDow - 1;
  const anchorMonday = anchorDays - daysSinceMondayAnchor;

  const daysSinceMondayTarget = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const targetMonday = targetDays - daysSinceMondayTarget;

  const weekOffset = Math.round((targetMonday - anchorMonday) / 7);
  const isEvenWeek = ((weekOffset % 2) + 2) % 2 === 0;

  const firstParent = config.firstWeekendParent || 'primary';
  const secondParent = firstParent === 'primary' ? 'secondary' : 'primary';

  return isEvenWeek ? firstParent : secondParent;
}

export function resolveNonTraditionalOvernight(
  dateStr: string,
  schedule: CustodySchedule,
): 'primary' | 'secondary' {
  return resolveCustomPatternHouse(dateStr, {
    ...schedule,
    customConfig: schedule.customConfig || DEFAULT_NON_TRADITIONAL_CONFIG,
  });
}

export interface CustodyDaySegment {
  parent: 'primary' | 'secondary';
  parentName: string;
  houseName: string;
  periodLabel: string;
  timeWindow?: string;
}

export interface CustodyDayDetails {
  dateStr: string;
  house: 'primary' | 'secondary'; // Overnight house for standard tracking
  houseName: string;
  parentName: string;
  isSplitDay: boolean;
  isWeekend: boolean;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  dayName: string;   // "Sun", "Mon", ...
  summaryLabel: string;
  segments?: CustodyDaySegment[];
  hasOverride: boolean;
  hasSwap: boolean;
  activeSwap?: CustodySwapRequest;
  holidayNote?: string;
  afterSchoolHandoff?: {
    parentName: string;
    endTime: string;
  };
}

/**
 * Provides comprehensive, ADHD-friendly intra-day breakdown for any calendar day.
 * Distinguishes daytime care (e.g. Mom after-school till 7:30 PM) from overnight residency (Dad).
 */
export function getCustodyDayDetails(
  dateStr: string,
  schedule: CustodySchedule,
  swaps: CustodySwapRequest[] = [],
  childName?: string,
): CustodyDayDetails {
  const days = parseDateToDays(dateStr);
  const dayOfWeek = isNaN(days) ? 0 : ((days + 4) % 7 + 7) % 7;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayName = dayNames[dayOfWeek] || 'Day';
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;

  // 1. Direct manual calendar override
  const hasOverride = Boolean(schedule.overrides && schedule.overrides[dateStr]);
  const overrideHouse = hasOverride ? schedule.overrides![dateStr] : undefined;

  // 2. Approved swap request
  const matchingApprovedSwaps = swaps
    .filter((s) => {
      if (s.status !== 'approved') return false;
      if (s.currentDate !== dateStr && s.makeupDate !== dateStr) return false;
      if (childName) {
        if (s.childName !== 'All Children' && s.childName !== childName) return false;
      } else {
        if (s.childName !== 'All Children') return false;
      }
      return true;
    })
    .sort((a, b) => (b.resolvedAt || b.createdAt) - (a.resolvedAt || a.createdAt));

  const activeSwap = matchingApprovedSwaps[0];
  let swapHouse: 'primary' | 'secondary' | undefined;
  if (activeSwap) {
    if (activeSwap.currentDate === dateStr) {
      swapHouse = activeSwap.targetHouse;
    } else if (activeSwap.makeupDate === dateStr) {
      swapHouse = activeSwap.targetHouse === 'primary' ? 'secondary' : 'primary';
    }
  }

  const hasSwap = Boolean(swapHouse);

  // If override or swap exists, it directly dictates the house
  if (hasOverride || hasSwap) {
    const effHouse = (hasOverride ? overrideHouse! : swapHouse!) as 'primary' | 'secondary';
    const isPrimary = effHouse === 'primary';
    const houseName = isPrimary ? schedule.primaryHouseName : schedule.secondaryHouseName;
    const parentName = isPrimary ? schedule.primaryParentName : schedule.secondaryParentName;

    return {
      dateStr,
      house: effHouse,
      houseName,
      parentName,
      isSplitDay: false,
      isWeekend,
      dayOfWeek,
      dayName,
      summaryLabel: `${houseName} (${hasOverride ? 'Override' : 'Swap'})`,
      hasOverride,
      hasSwap,
      activeSwap,
      holidayNote: schedule.customConfig?.holidayNotes,
    };
  }

  // 3. Check if this is a split-day pattern
  const isNonTraditional =
    schedule.pattern === 'split_day_alternating_weekends' ||
    (schedule.pattern === 'custom' && (schedule.customConfig?.splitDayEnabled ?? true));

  if (isNonTraditional) {
    const config = schedule.customConfig || DEFAULT_NON_TRADITIONAL_CONFIG;
    const overnightHouse = resolveCustomPatternHouse(dateStr, schedule);
    const morningParent = config.morningSchoolParent || 'primary';
    const afterSchoolParent = config.afterSchoolParent || 'secondary';
    const bedtimeParent = config.bedtimeOvernightParent || 'primary';

    const morningParentName = morningParent === 'primary' ? schedule.primaryParentName : schedule.secondaryParentName;
    const morningHouseName = morningParent === 'primary' ? schedule.primaryHouseName : schedule.secondaryHouseName;

    const afterSchoolParentName = afterSchoolParent === 'primary' ? schedule.primaryParentName : schedule.secondaryParentName;
    const afterSchoolHouseName = afterSchoolParent === 'primary' ? schedule.primaryHouseName : schedule.secondaryHouseName;

    const bedtimeParentName = bedtimeParent === 'primary' ? schedule.primaryParentName : schedule.secondaryParentName;
    const bedtimeHouseName = bedtimeParent === 'primary' ? schedule.primaryHouseName : schedule.secondaryHouseName;

    const afterSchoolEnd = config.afterSchoolEndTime || '19:30';

    // Monday through Thursday: Split weekday
    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      return {
        dateStr,
        house: bedtimeParent,
        houseName: bedtimeHouseName,
        parentName: bedtimeParentName,
        isSplitDay: true,
        isWeekend: false,
        dayOfWeek,
        dayName,
        summaryLabel: `${bedtimeParentName} (School & Bed) · ${afterSchoolParentName} (After-School till 7:30 PM)`,
        afterSchoolHandoff: {
          parentName: afterSchoolParentName,
          endTime: afterSchoolEnd,
        },
        segments: [
          {
            parent: morningParent,
            parentName: morningParentName,
            houseName: morningHouseName,
            periodLabel: 'Wake up & School',
            timeWindow: 'Morning dropoff',
          },
          {
            parent: afterSchoolParent,
            parentName: afterSchoolParentName,
            houseName: afterSchoolHouseName,
            periodLabel: 'After-School Care',
            timeWindow: `After school → ${afterSchoolEnd}`,
          },
          {
            parent: bedtimeParent,
            parentName: bedtimeParentName,
            houseName: bedtimeHouseName,
            periodLabel: 'Bedtime & Overnight',
            timeWindow: `${afterSchoolEnd} → Morning`,
          },
        ],
        hasOverride: false,
        hasSwap: false,
        holidayNote: config.holidayNotes,
      };
    }

    // Friday:
    if (dayOfWeek === 5) {
      if (overnightHouse === afterSchoolParent) {
        // Weekend belongs to afterSchool parent (Secondary parent / Mom's weekend begins Friday!)
        const wkndParentName = afterSchoolParentName;
        const wkndHouseName = afterSchoolHouseName;
        return {
          dateStr,
          house: afterSchoolParent,
          houseName: wkndHouseName,
          parentName: wkndParentName,
          isSplitDay: false,
          isWeekend: true,
          dayOfWeek,
          dayName,
          summaryLabel: `${wkndParentName}'s Weekend (Starts Friday)`,
          segments: [
            {
              parent: morningParent,
              parentName: morningParentName,
              houseName: morningHouseName,
              periodLabel: 'Wake up & School',
              timeWindow: 'Morning dropoff',
            },
            {
              parent: afterSchoolParent,
              parentName: wkndParentName,
              houseName: wkndHouseName,
              periodLabel: 'Weekend Pickup & Overnight',
              timeWindow: 'After school onwards',
            },
          ],
          hasOverride: false,
          hasSwap: false,
          holidayNote: config.holidayNotes,
        };
      } else {
        // Weekend belongs to overnight/morning parent (Primary parent / Dad's weekend): Secondary parent (Mom) still has after-school till 7:30 PM
        return {
          dateStr,
          house: bedtimeParent,
          houseName: bedtimeHouseName,
          parentName: bedtimeParentName,
          isSplitDay: true,
          isWeekend: true,
          dayOfWeek,
          dayName,
          summaryLabel: `${bedtimeParentName} Weekend (${afterSchoolParentName} After-School till 7:30 PM)`,
          afterSchoolHandoff: {
            parentName: afterSchoolParentName,
            endTime: afterSchoolEnd,
          },
          segments: [
            {
              parent: morningParent,
              parentName: morningParentName,
              houseName: morningHouseName,
              periodLabel: 'Wake up & School',
              timeWindow: 'Morning dropoff',
            },
            {
              parent: afterSchoolParent,
              parentName: afterSchoolParentName,
              houseName: afterSchoolHouseName,
              periodLabel: 'After-School Care',
              timeWindow: `After school → ${afterSchoolEnd}`,
            },
            {
              parent: bedtimeParent,
              parentName: bedtimeParentName,
              houseName: bedtimeHouseName,
              periodLabel: 'Weekend Begins',
              timeWindow: `${afterSchoolEnd} onwards`,
            },
          ],
          hasOverride: false,
          hasSwap: false,
          holidayNote: config.holidayNotes,
        };
      }
    }

    // Saturday & Sunday: Full weekend
    const wkndParentName = overnightHouse === 'primary' ? schedule.primaryParentName : schedule.secondaryParentName;
    const wkndHouseName = overnightHouse === 'primary' ? schedule.primaryHouseName : schedule.secondaryHouseName;

    return {
      dateStr,
      house: overnightHouse,
      houseName: wkndHouseName,
      parentName: wkndParentName,
      isSplitDay: false,
      isWeekend: true,
      dayOfWeek,
      dayName,
      summaryLabel: `${wkndParentName}'s Weekend`,
      hasOverride: false,
      hasSwap: false,
      holidayNote: config.holidayNotes,
    };
  }

  // 4. Traditional standard schedule
  const traditionalHouse = getHouseForDate(dateStr, schedule, swaps, childName);
  const isPrimary = traditionalHouse === 'primary';
  const houseName = isPrimary ? schedule.primaryHouseName : schedule.secondaryHouseName;
  const parentName = isPrimary ? schedule.primaryParentName : schedule.secondaryParentName;

  return {
    dateStr,
    house: traditionalHouse,
    houseName,
    parentName,
    isSplitDay: false,
    isWeekend,
    dayOfWeek,
    dayName,
    summaryLabel: houseName,
    hasOverride: false,
    hasSwap: false,
  };
}

export interface CustodyOvernightBreakdown {
  primary: number;
  secondary: number;
  total: number;
  primaryPercent: number;
  secondaryPercent: number;
  splitDaysCount?: number;
  secondaryAfterSchoolVisits?: number;
  primaryAfterSchoolVisits?: number;
}

/**
 * Calculates total overnight count, percentages, and intra-day metrics between two dates.
 */
export function calculateOvernights(
  startDateStr: string,
  endDateStr: string,
  schedule: CustodySchedule,
  swaps: CustodySwapRequest[] = [],
  childName?: string,
): CustodyOvernightBreakdown {
  let primaryCount = 0;
  let secondaryCount = 0;
  let splitDaysCount = 0;
  let secondaryAfterSchoolVisits = 0;
  let primaryAfterSchoolVisits = 0;

  const startDays = parseDateToDays(startDateStr);
  const endDays = parseDateToDays(endDateStr);

  if (isNaN(startDays) || isNaN(endDays) || startDays > endDays) {
    return {
      primary: 0,
      secondary: 0,
      total: 0,
      primaryPercent: 50,
      secondaryPercent: 50,
      splitDaysCount: 0,
      secondaryAfterSchoolVisits: 0,
      primaryAfterSchoolVisits: 0,
    };
  }

  for (let d = startDays; d <= endDays; d++) {
    const cur = new Date(d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const details = getCustodyDayDetails(cur, schedule, swaps, childName);
    if (details.house === 'primary') primaryCount++;
    else secondaryCount++;

    if (details.isSplitDay) {
      splitDaysCount++;
      if (details.afterSchoolHandoff?.parentName === schedule.secondaryParentName) {
        secondaryAfterSchoolVisits++;
      }
      if (details.afterSchoolHandoff?.parentName === schedule.primaryParentName) {
        primaryAfterSchoolVisits++;
      }
    }
  }

  const total = primaryCount + secondaryCount;
  const primaryPercent = total > 0 ? Math.round((primaryCount / total) * 100) : 50;
  const secondaryPercent = total > 0 ? 100 - primaryPercent : 50;

  return {
    primary: primaryCount,
    secondary: secondaryCount,
    total,
    primaryPercent,
    secondaryPercent,
    splitDaysCount,
    secondaryAfterSchoolVisits,
    primaryAfterSchoolVisits,
  };
}

// ── Storage Helpers ─────────────────────────────────────────────────────────

export function loadCustodySchedule(): CustodySchedule {
  const stored = loadJSON<CustodySchedule | null>(KEYS.custodySchedule, null);
  if (stored && stored.startDate && /^\d{4}-\d{2}-\d{2}$/.test(stored.startDate)) {
    // Self-healing migration: If previous version inverted roles (where Dad handled bedtime/wakeups but was marked secondary)
    if (
      stored.customConfig &&
      stored.customConfig.morningSchoolParent === 'secondary' &&
      stored.customConfig.bedtimeOvernightParent === 'secondary' &&
      stored.secondaryParentName === 'Dad' &&
      stored.primaryParentName === 'Mom'
    ) {
      stored.primaryParentName = 'Dad';
      stored.primaryHouseName = "Dad's House";
      stored.secondaryParentName = 'Mom';
      stored.secondaryHouseName = "Mom's House";
      stored.customConfig.morningSchoolParent = 'primary';
      stored.customConfig.bedtimeOvernightParent = 'primary';
      stored.customConfig.afterSchoolParent = 'secondary';
      stored.customConfig.firstWeekendParent = 'primary';
      saveJSON(KEYS.custodySchedule, stored);
    }
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

export interface CustodyScheduleSettings {
  template?: string;
  pattern?: CustodyPattern;
  startDate: string;
  primaryHouseholdName?: string;
  secondaryHouseholdName?: string;
  primaryHouseName?: string;
  secondaryHouseName?: string;
  transitionDay?: string;
  transitionTime?: string;
  transitionLocation?: string;
  customConfig?: CustomCustodyConfig;
}

/**
 * Calculates overnight counts given either a CustodySchedule or CustodyScheduleSettings.
 */
export function calculateCustodyOvernights(
  scheduleOrSettings: CustodySchedule | CustodyScheduleSettings,
  startDateStr: string,
  endDateStr: string,
  swaps: CustodySwapRequest[] = [],
  childName?: string,
): CustodyOvernightBreakdown {
  const pattern = (('template' in scheduleOrSettings ? (scheduleOrSettings as any).template : undefined) ||
    scheduleOrSettings.pattern ||
    '2-2-3') as CustodyPattern;
  const primaryHouseName =
    ('primaryHouseholdName' in scheduleOrSettings ? (scheduleOrSettings as any).primaryHouseholdName : undefined) ||
    ('primaryHouseName' in scheduleOrSettings ? (scheduleOrSettings as any).primaryHouseName : undefined) ||
    'Primary House';
  const secondaryHouseName =
    ('secondaryHouseholdName' in scheduleOrSettings ? (scheduleOrSettings as any).secondaryHouseholdName : undefined) ||
    ('secondaryHouseName' in scheduleOrSettings ? (scheduleOrSettings as any).secondaryHouseName : undefined) ||
    'Secondary House';

  const schedule: CustodySchedule = {
    id: 'id' in scheduleOrSettings ? (scheduleOrSettings as any).id : 'schedule',
    pattern,
    startDate: scheduleOrSettings.startDate,
    primaryHouseName,
    secondaryHouseName,
    primaryParentName: 'primaryParentName' in scheduleOrSettings ? (scheduleOrSettings as any).primaryParentName : 'Parent A',
    secondaryParentName: 'secondaryParentName' in scheduleOrSettings ? (scheduleOrSettings as any).secondaryParentName : 'Parent B',
    transitionTime: scheduleOrSettings.transitionTime || '17:00',
    overrides: 'overrides' in scheduleOrSettings ? (scheduleOrSettings as any).overrides : undefined,
    children: 'children' in scheduleOrSettings ? (scheduleOrSettings as any).children : undefined,
    customConfig: 'customConfig' in scheduleOrSettings ? (scheduleOrSettings as any).customConfig : undefined,
  };

  return calculateOvernights(startDateStr, endDateStr, schedule, swaps, childName);
}

