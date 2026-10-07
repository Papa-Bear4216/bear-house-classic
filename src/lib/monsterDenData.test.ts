import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CREATURE_ROSTER,
  WARDROBE_CATALOG,
  ROOM_DECOR_CATALOG,
  EXPEDITION_ZONES,
  getProfileForMember,
  updateMemberProfile,
  addAdventureFuel,
  feedMonster,
  petMonster,
  computeFinalRotation,
  recordBedtime,
  wakeUpMonster,
  recordPetFeeding,
  getPetFeedingStatus,
  getLocalDateStr,
  getYesterdayLocalDateStr,
  getSleepDayStr,
  getYesterdaySleepDayStr,
  MONSTER_SNACKS,
  defaultMealForPet,
  DEFAULT_FAMILY_PETS,
  MONSTER_DEN_KEY,
} from './monsterDenData';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
}

const storage = new MemoryStorage();
vi.stubGlobal('localStorage', storage);

describe('monsterDenData', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('provides the Fuggler Squad and Whimsical Derps in the roster', () => {
    expect(CREATURE_ROSTER.length).toBeGreaterThanOrEqual(6);
    const fugglers = CREATURE_ROSTER.filter((c) => c.clan === 'fuggler');
    const magical = CREATURE_ROSTER.filter((c) => c.clan === 'magical');
    expect(fugglers.length).toBeGreaterThan(0);
    expect(magical.length).toBeGreaterThan(0);

    // Verify Snarl-Tooth has human chompers
    const snarlTooth = CREATURE_ROSTER.find((c) => c.id === 'snarl-tooth');
    expect(snarlTooth).toBeDefined();
    expect(snarlTooth?.teeth).toBe('human-chompers');
    expect(snarlTooth?.texture).toBe('burlap');
  });

  it('initializes default profile with starter creature and free spin', () => {
    const profile = getProfileForMember('kid-tester');
    expect(profile.memberId).toBe('kid-tester');
    expect(profile.activeCreatureId).toBe(CREATURE_ROSTER[0].id);
    expect(profile.unlockedCreatureIds).toContain(CREATURE_ROSTER[0].id);
    expect(profile.spinsAvailable).toBe(1);
    expect(profile.placedDecorations.length).toBeGreaterThan(0);
  });

  it('persists profile updates cleanly', () => {
    getProfileForMember('kid-tester');
    const updated = updateMemberProfile('kid-tester', {
      statusText: 'Testing my awesome den!',
      statusMood: '⚡ Electric',
    });
    expect(updated.statusText).toBe('Testing my awesome den!');
    expect(updated.statusMood).toBe('⚡ Electric');

    const fresh = getProfileForMember('kid-tester');
    expect(fresh.statusText).toBe('Testing my awesome den!');
  });

  it('charges adventure fuel from chores properly with 100% cap', () => {
    getProfileForMember('kid-tester');
    const fuel1 = addAdventureFuel('kid-tester', 30);
    expect(fuel1).toBe(50); // initial was 20 + 30 = 50

    const fuel2 = addAdventureFuel('kid-tester', 80);
    expect(fuel2).toBe(100); // capped at 100
  });

  it('feeds and pets monster without death or punishment, applying specific snack boosts', () => {
    getProfileForMember('kid-tester');
    // Using crunchy kibble (hungerBoost: 40, happinessBoost: 10)
    const kibble = MONSTER_SNACKS.find((s) => s.id === 'crunchy-kibble')!;
    const { hunger, happiness } = feedMonster('kid-tester', kibble);
    expect(hunger).toBe(100); // 80 + 40 = 120 -> capped at 100
    expect(happiness).toBe(100); // 90 + 10 = 100

    const happy = petMonster('kid-tester');
    expect(happy).toBe(100);
  });

  it('validates expedition zones data integrity', () => {
    expect(EXPEDITION_ZONES.length).toBe(3);
    EXPEDITION_ZONES.forEach((z) => {
      expect(z.checkpoints.length).toBeGreaterThanOrEqual(3);
      expect(z.possibleSouvenirs.length).toBeGreaterThanOrEqual(3);
      expect(z.stories.length).toBeGreaterThanOrEqual(3);
      expect(z.fuelCost).toBeGreaterThan(0);
    });
  });

  it('aligns final rotation precisely with pointer at 270 degrees across random initial angles', () => {
    const totalSlices = 8;
    const sliceAngle = 360 / totalSlices;

    for (let winningIndex = 0; winningIndex < totalSlices; winningIndex++) {
      const mid = winningIndex * sliceAngle + sliceAngle / 2;
      for (let rot = 0; rot < 720; rot += 45) {
        const finalRot = computeFinalRotation(rot, winningIndex, totalSlices);
        const landedAngle = ((finalRot + mid) % 360 + 360) % 360;
        expect(Math.round(landedAngle)).toBe(270);
      }
    }
  });

  it('tracks bedtime wind-down, advances streaks, and wakes up monster', () => {
    getProfileForMember('kid-tester');
    const bedtime1 = recordBedtime('kid-tester');
    expect(bedtime1.success).toBe(true);
    expect(bedtime1.streak).toBe(1);
    expect(bedtime1.pointsAwarded).toBe(15);
    expect(bedtime1.tuckedIn).toBe(true);

    const profile = getProfileForMember('kid-tester');
    expect(profile.tuckedIn).toBe(true);
    expect(profile.bedtimeStreak).toBe(1);

    // Re-tucking in on the same date should not award duplicate points
    const sameDay = recordBedtime('kid-tester');
    expect(sameDay.pointsAwarded).toBe(0);
    expect(sameDay.streak).toBe(1);

    // Waking up
    const awake = wakeUpMonster('kid-tester');
    expect(awake.tuckedIn).toBe(false);
  });

  it('records family pet feeding with double-feeding prevention and fuel rewards', () => {
    getProfileForMember('kid-tester');
    const initialFuel = getProfileForMember('kid-tester').adventureFuel;

    // First feeding
    const res1 = recordPetFeeding('pet-dog-1', 'kid-tester', 'Mary', 'breakfast');
    expect(res1.success).toBe(true);
    expect(res1.fuelAwarded).toBe(20);
    expect(res1.pointsAwarded).toBe(10);
    expect(getProfileForMember('kid-tester').adventureFuel).toBe(initialFuel + 20);

    // Status check
    const status1 = getPetFeedingStatus('pet-dog-1');
    expect(status1.lastFeeding).toBeDefined();
    expect(status1.todayFeeding).toBeDefined();
    expect(status1.todayFeeding?.fedByName).toBe('Mary');
    expect(status1.todayFeeding?.mealType).toBe('breakfast');
    expect(status1.isFedRecently).toBe(true);

    // Double feeding within 2 hours blocked
    const res2 = recordPetFeeding('pet-dog-1', 'kid-tester-2', 'Jack', 'breakfast');
    expect(res2.success).toBe(false);
    expect(res2.alreadyFedBy).toBe('Mary');
    expect(res2.reason).toContain('already fed');
    expect(res2.fuelAwarded).toBe(0);

    // Unknown pet rejection
    const resUnknown = recordPetFeeding('non-existent-pet', 'kid-tester', 'Mary', 'breakfast');
    expect(resUnknown.success).toBe(false);
    expect(resUnknown.reason).toBe('Unknown pet.');

    // defaultMealForPet handles pets with single meal (Bubbles the fish)
    const fish = DEFAULT_FAMILY_PETS.find((p) => p.id === 'pet-fish-1')!;
    expect(defaultMealForPet(fish)).toBe('breakfast');
  });

  it('correctly formats local dates without UTC timezone skew', () => {
    const testDate = new Date(2026, 9, 3, 23, 45, 0); // Oct 3, 2026 11:45 PM local
    expect(getLocalDateStr(testDate)).toBe('2026-10-03');
    expect(getYesterdayLocalDateStr(testDate)).toBe('2026-10-02');
  });

  it('correctly calculates sleep days with 4 AM rollover', () => {
    // 11:30 PM Oct 3 -> sleep day 2026-10-03
    const nightDate = new Date(2026, 9, 3, 23, 30, 0);
    expect(getSleepDayStr(nightDate)).toBe('2026-10-03');
    expect(getYesterdaySleepDayStr(nightDate)).toBe('2026-10-02');

    // 1:30 AM Oct 4 (past midnight) -> belongs to night of 2026-10-03
    const pastMidnight = new Date(2026, 9, 4, 1, 30, 0);
    expect(getSleepDayStr(pastMidnight)).toBe('2026-10-03');
    expect(getYesterdaySleepDayStr(pastMidnight)).toBe('2026-10-02');

    // 4:30 AM Oct 4 -> new sleep day 2026-10-04
    const nextMorning = new Date(2026, 9, 4, 4, 30, 0);
    expect(getSleepDayStr(nextMorning)).toBe('2026-10-04');
    expect(getYesterdaySleepDayStr(nextMorning)).toBe('2026-10-03');
  });

  it('auto-clears tuckedIn status when over 10 hours have passed', () => {
    getProfileForMember('kid-sleeper');
    // Tuck in 11 hours ago
    const elevenHoursAgo = Date.now() - 11 * 60 * 60 * 1000;
    updateMemberProfile('kid-sleeper', {
      tuckedIn: true,
      tuckedInAt: elevenHoursAgo,
      lastBedtimeDate: getSleepDayStr(new Date(elevenHoursAgo)),
    });

    const refreshed = getProfileForMember('kid-sleeper');
    expect(refreshed.tuckedIn).toBe(false);
  });

  it('prevents bedtime re-tuck-in happiness exploit on the same sleep day', () => {
    updateMemberProfile('kid-exploit', { happiness: 70, bedtimeStreak: 0 });

    // First tuck-in of the day
    const firstResult = recordBedtime('kid-exploit');
    expect(firstResult.success).toBe(true);
    expect(firstResult.pointsAwarded).toBe(15);
    expect(getProfileForMember('kid-exploit').happiness).toBe(100);

    // Wake up
    const afterWake = wakeUpMonster('kid-exploit');
    expect(afterWake.tuckedIn).toBe(false);
    expect(afterWake.happiness).toBe(100);

    // Lower happiness slightly to test exploit attempt
    updateMemberProfile('kid-exploit', { happiness: 65 });

    // Second tuck-in on same sleep day should NOT award extra points or reset happiness to 100
    const secondResult = recordBedtime('kid-exploit');
    expect(secondResult.success).toBe(true);
    expect(secondResult.pointsAwarded).toBe(0);
    expect(getProfileForMember('kid-exploit').happiness).toBe(65);

    // Waking up again should not inflate happiness
    const secondWake = wakeUpMonster('kid-exploit');
    expect(secondWake.happiness).toBe(65);
  });
});

