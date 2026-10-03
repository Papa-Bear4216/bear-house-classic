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

  it('feeds and pets monster without death or punishment', () => {
    getProfileForMember('kid-tester');
    const { hunger, happiness } = feedMonster('kid-tester', 'graham-cracker');
    expect(hunger).toBeGreaterThanOrEqual(80);
    expect(happiness).toBeGreaterThanOrEqual(90);

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
});
