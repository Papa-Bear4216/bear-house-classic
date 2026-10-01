import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KEYS, saveJSON } from './familyos';
import {
  ROOMS_KEY,
  addJournalEntry,
  buyTheme,
  defaultRoom,
  deleteJournalEntry,
  journalStorageKey,
  loadJournal,
  loadRooms,
  roomForMember,
  sanitizeRoom,
  saveRooms,
  updateJournalEntry,
} from './kidRoom';

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

describe('kid rooms', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('keeps a free theme and drops friends who are not in the house', () => {
    const room = sanitizeRoom({
      themeId: 'orbit',
      ownedThemeIds: ['den'],
      topFriendIds: ['sib', 'self', 'stranger', 'sib'],
      avatar: 'nope',
      mood: 'feral',
      status: 'x'.repeat(200),
    }, 'self', ['sib', 'self', 'cousin']);
    expect(room.themeId).toBe('den');
    expect(room.ownedThemeIds).toEqual(['den']);
    expect(room.topFriendIds).toEqual(['sib']);
    expect(room.avatar).toBe('🐻');
    expect(room.mood).toBe('chill');
    expect(room.status).toHaveLength(140);
  });

  it('charges reward points once and equips the pack', () => {
    const profile = defaultRoom('kid');
    const first = buyTheme(profile, 'glitter', { kid: 40, parent: 10 }, [], 1000);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.spent).toBe(30);
    expect(first.balance.kid).toBe(10);
    expect(first.balance.parent).toBe(10);
    expect(first.profile.themeId).toBe('glitter');
    const again = buyTheme(first.profile, 'glitter', first.balance, [], 2000);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.spent).toBe(0);
    expect(again.balance.kid).toBe(10);
  });

  it('refuses a pack when pending reward requests already hold the points', () => {
    const profile = defaultRoom('kid');
    const result = buyTheme(profile, 'cabinet', { kid: 80 }, [{
      id: 'r1',
      memberId: 'kid',
      memberName: 'Kid',
      rewardId: 1,
      rewardTitle: 'Movie',
      cost: 20,
      status: 'pending',
      requestedAt: 1,
    }]);
    expect(result).toEqual({ ok: false, reason: 'not-enough-points' });
  });

  it('stores the public room in the household key and the journal somewhere else', () => {
    const room = { ...defaultRoom('kid'), status: 'hi' };
    saveRooms({ kid: room });
    expect(loadRooms().kid.status).toBe('hi');
    expect(JSON.parse(storage.getItem(ROOMS_KEY) || '{}').kid.status).toBe('hi');
    expect(JSON.parse(storage.getItem(ROOMS_KEY) || '{}').kid.body).toBeUndefined();

    expect(addJournalEntry('kid', 'nobody else reads this', 50)?.[0].body).toBe('nobody else reads this');
    expect(loadJournal('kid')).toHaveLength(1);
    expect(storage.getItem(journalStorageKey('kid'))).toContain('nobody else reads this');
    expect(storage.getItem(ROOMS_KEY)).not.toContain('nobody else reads this');
    expect(storage.getItem(KEYS.points)).toBeNull();

    const updated = updateJournalEntry('kid', loadJournal('kid')[0].id, 'still private', 60);
    expect(updated?.[0].body).toBe('still private');
    expect(deleteJournalEntry('kid', updated![0].id)).toEqual([]);
    expect(loadJournal('kid')).toEqual([]);
  });

  it('does not keep a friend id after they leave the roster', () => {
    saveJSON(ROOMS_KEY, { kid: { ...defaultRoom('kid'), topFriendIds: ['gone'] } });
    expect(loadRooms().kid.topFriendIds).toEqual(['gone']);
    expect(roomForMember(loadRooms(), 'kid', []).topFriendIds).toEqual([]);
  });
});
