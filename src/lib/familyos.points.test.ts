import { describe, it, expect, beforeEach } from 'vitest';
import { KEYS, loadPointsBalance, awardPoints, loadRedemptions, saveRedemptions, REWARD_CATALOG, POINT_VALUES } from './familyos';

// vitest.config.ts runs this suite under environment: 'node', which has no
// localStorage global — loadJSON/saveJSON in familyos.ts read/write it
// directly, so a minimal in-memory polyfill is needed for these tests to
// exercise real persistence rather than only pure-function logic.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();

describe('points storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadPointsBalance returns empty object when nothing stored', () => {
    expect(loadPointsBalance()).toEqual({});
  });

  it('awardPoints adds to a new member balance', () => {
    awardPoints('member-1', 15);
    expect(loadPointsBalance()).toEqual({ 'member-1': 15 });
  });

  it('awardPoints accumulates on an existing balance', () => {
    awardPoints('member-1', 15);
    awardPoints('member-1', 30);
    expect(loadPointsBalance()).toEqual({ 'member-1': 45 });
  });

  it('awardPoints keeps separate balances per member', () => {
    awardPoints('member-1', 15);
    awardPoints('member-2', 50);
    expect(loadPointsBalance()).toEqual({ 'member-1': 15, 'member-2': 50 });
  });

  it('loadRedemptions returns empty array when nothing stored', () => {
    expect(loadRedemptions()).toEqual([]);
  });

  it('saveRedemptions persists and loadRedemptions reads it back', () => {
    const entry = {
      id: 'r1', memberId: 'member-1', memberName: 'Kid', rewardId: 1,
      rewardTitle: 'Extra Screen Time (30m)', cost: 50,
      status: 'pending' as const, requestedAt: 1000,
    };
    saveRedemptions([entry]);
    expect(loadRedemptions()).toEqual([entry]);
  });

  it('REWARD_CATALOG has 6 items matching the original bear-house-os catalog', () => {
    expect(REWARD_CATALOG).toHaveLength(6);
    expect(REWARD_CATALOG.map(r => r.title)).toEqual([
      'Extra Screen Time (30m)',
      'Choose Movie Night',
      '$5 Allowance Bonus',
      'Stay Up 1hr Late',
      'Trip to Ice Cream Shop',
      'Skip One Chore',
    ]);
    expect(REWARD_CATALOG.map(r => r.cost)).toEqual([50, 100, 200, 150, 300, 120]);
  });

  it('POINT_VALUES matches original bear-house-os defaults', () => {
    expect(POINT_VALUES).toEqual({ easy: 15, medium: 30, hard: 50, default: 10 });
  });
});
