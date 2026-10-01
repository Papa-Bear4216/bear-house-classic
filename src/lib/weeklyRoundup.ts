// src/lib/weeklyRoundup.ts
// Weekly Family Digest & Co-Parent Logistics Roundup
import {
  loadJSON,
  KEYS,
  loadPointsBalance,
  type HouseholdMember,
} from './familyos';
import { loadMemberStreaks } from './streaks';
import {
  calculateCustodyOvernights,
  loadCustodySwaps,
  type CustodyScheduleSettings,
} from './custody';

export interface WeeklyRoundupData {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  generatedAt: number;

  custody: {
    primaryHouseName: string;
    secondaryHouseName: string;
    primaryOvernights: number;
    secondaryOvernights: number;
    transitions: {
      date: string;
      dayOfWeek: string;
      toHousehold: string;
      location?: string;
    }[];
  };

  choresAndStreaks: {
    totalChoresCompleted: number;
    activeKids: {
      name: string;
      choresDone: number;
      streakDays: number;
      xpBalance: number;
    }[];
  };

  health: {
    activeMedications: {
      medName: string;
      kidName: string;
      dosage: string;
      dosesLoggedLast7Days: number;
    }[];
  };

  upcomingEvents: {
    title: string;
    date: string;
    time?: string;
  }[];
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Compiles a weekly family digest spanning past 7 days of accomplishments and next 7 days of logistics.
 */
export function generateWeeklyRoundup(
  householdMembers: HouseholdMember[] = []
): WeeklyRoundupData {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const startOfToday = new Date(year, month, date);
  const endOfWindow = new Date(year, month, date + 6);
  const startOfWindowMs = startOfToday.getTime();
  const endOfWindowMs = new Date(year, month, date + 7).getTime() - 1;

  const startDateStr = formatDateStr(startOfToday);
  const endDateStr = formatDateStr(endOfWindow);

  // 1. Custody calculations for coming week
  const rawSchedule = loadJSON<any>(KEYS.custodySchedule, null) || loadJSON<any>((KEYS as any).custodySchedules, null);
  const scheduleSettings = rawSchedule;
  const swaps = loadCustodySwaps();

  let primaryOvernights = 0;
  let secondaryOvernights = 0;
  const transitions: WeeklyRoundupData['custody']['transitions'] = [];

  const primaryName = scheduleSettings?.primaryHouseName || scheduleSettings?.primaryHouseholdName || 'Primary House';
  const secondaryName = scheduleSettings?.secondaryHouseName || scheduleSettings?.secondaryHouseholdName || 'Secondary House';

  if (scheduleSettings) {
    const counts = calculateCustodyOvernights(scheduleSettings, startDateStr, endDateStr, swaps);
    primaryOvernights = counts.primary;
    secondaryOvernights = counts.secondary;

    // Detect transitions across next 7 days, checking from yesterday to catch transitions occurring on day 0
    const yesterday = new Date(year, month, date - 1);
    const yesterdayStr = formatDateStr(yesterday);
    const yesterdayHouseKey = calculateCustodyOvernights(scheduleSettings, yesterdayStr, yesterdayStr, swaps).primary > 0 ? 'primary' : 'secondary';
    let prevHouseKey = yesterdayHouseKey;

    for (let i = 0; i < 7; i++) {
      const curDate = new Date(year, month, date + i);
      const curStr = formatDateStr(curDate);
      const singleDay = calculateCustodyOvernights(scheduleSettings, curStr, curStr, swaps);
      const currentHouseKey = singleDay.primary > 0 ? 'primary' : 'secondary';
      const currentHouseName = currentHouseKey === 'primary' ? primaryName : secondaryName;

      if (currentHouseKey !== prevHouseKey) {
        transitions.push({
          date: curStr,
          dayOfWeek: DAY_NAMES[curDate.getDay()],
          toHousehold: currentHouseName,
          location: scheduleSettings.transitionLocation || 'School / Designated Exchange',
        });
      }
      prevHouseKey = currentHouseKey;
    }
  }

  // 2. Chores, Tasks & Streaks in past 7 days
  const tasks = loadJSON<any[]>(KEYS.tasks, []);
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const recentCompletedTasks = tasks.filter(
    (t) => t.completed && (t.completedAt || t.createdAt) >= sevenDaysAgo
  );

  const streaks = loadMemberStreaks();
  const points = loadPointsBalance();

  const kids = householdMembers.filter((m) => m.role === 'child');
  const activeKids = kids.map((kid) => {
    const kidTasks = recentCompletedTasks.filter(
      (t) => t.person && t.person.toLowerCase() === kid.name.toLowerCase()
    ).length;
    const streak = streaks[kid.id]?.currentStreak ?? 0;
    const balance = points[kid.id] ?? 0;
    return {
      name: kid.name,
      choresDone: kidTasks,
      streakDays: streak,
      xpBalance: balance,
    };
  });

  // 3. Health & Medications
  const meds = loadJSON<any[]>(KEYS.medications, []);
  const doses = loadJSON<any[]>(KEYS.medDoses, []);
  const recentDoses = doses.filter(
    (d) => !d.deletedAt && (d.timestamp || d.givenAt || 0) >= sevenDaysAgo
  );

  const activeMedications = meds
    .filter((m) => !m.deletedAt)
    .map((m) => {
      const doseCount = recentDoses.filter((d) => d.medicationId === m.id).length;
      return {
        medName: m.name,
        kidName: m.person || m.childName || 'Kid',
        dosage: m.dosage || '',
        dosesLoggedLast7Days: doseCount,
      };
    });

  // 4. Upcoming Activities & Calendar (strictly aligned with the week window)
  const activities = loadJSON<any[]>(KEYS.activities, []);
  const upcomingEvents = activities
    .filter(
      (a) => !a.completed && a.scheduledAt && a.scheduledAt >= startOfWindowMs && a.scheduledAt <= endOfWindowMs
    )
    .sort((a, b) => a.scheduledAt - b.scheduledAt)
    .map((a) => ({
      title: a.title || a.name || 'Event',
      date: formatDateStr(new Date(a.scheduledAt)),
      time: new Date(a.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    }));

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    generatedAt: Date.now(),
    custody: {
      primaryHouseName: primaryName,
      secondaryHouseName: secondaryName,
      primaryOvernights,
      secondaryOvernights,
      transitions,
    },
    choresAndStreaks: {
      totalChoresCompleted: recentCompletedTasks.length,
      activeKids,
    },
    health: {
      activeMedications,
    },
    upcomingEvents,
  };
}

/**
 * Formats weekly digest into calm, clear, child-centered text suitable for SMS, email, or messaging.
 */
export function formatWeeklyRoundupText(data: WeeklyRoundupData): string {
  const lines: string[] = [];

  lines.push(`📅 Weekly Kid Logistics Digest (${data.startDate} to ${data.endDate})`);
  lines.push('');

  // Custody
  if (data.custody.primaryOvernights > 0 || data.custody.secondaryOvernights > 0) {
    lines.push('🏡 Custody & Overnights:');
    lines.push(`• ${data.custody.primaryHouseName}: ${data.custody.primaryOvernights} overnights`);
    lines.push(`• ${data.custody.secondaryHouseName}: ${data.custody.secondaryOvernights} overnights`);

    if (data.custody.transitions.length > 0) {
      lines.push('Transitions this week:');
      for (const t of data.custody.transitions) {
        lines.push(`  - ${t.dayOfWeek} (${t.date}): Hand-off to ${t.toHousehold}${t.location ? ` @ ${t.location}` : ''}`);
      }
    }
    lines.push('');
  }

  // Health
  if (data.health.activeMedications.length > 0) {
    lines.push('💊 Health & Medications:');
    for (const m of data.health.activeMedications) {
      lines.push(`• ${m.kidName}: ${m.medName}${m.dosage ? ` (${m.dosage})` : ''} — ${m.dosesLoggedLast7Days} doses logged this week`);
    }
    lines.push('');
  }

  // Kid Momentum
  if (data.choresAndStreaks.activeKids.length > 0) {
    lines.push('⭐ Kid Momentum & Chores:');
    for (const k of data.choresAndStreaks.activeKids) {
      lines.push(`• ${k.name}: ${k.choresDone} chores completed | 🔥 ${k.streakDays}d streak | ${k.xpBalance} Squad XP`);
    }
    lines.push('');
  }

  // Upcoming
  if (data.upcomingEvents.length > 0) {
    lines.push('🗓️ Upcoming Events:');
    for (const e of data.upcomingEvents) {
      lines.push(`• ${e.date}${e.time ? ` @ ${e.time}` : ''}: ${e.title}`);
    }
    lines.push('');
  }

  lines.push('Have a smooth and positive week!');
  return lines.join('\n');
}
