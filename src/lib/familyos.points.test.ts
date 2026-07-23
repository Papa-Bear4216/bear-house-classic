import { describe, it, expect, beforeEach } from 'vitest';
import {
  KEYS, loadPointsBalance, awardPoints, loadRedemptions, saveRedemptions,
  REWARD_CATALOG, POINT_VALUES, computeSpendable, resolveClaim,
  type RewardRedemption,
} from './familyos';

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

function redemption(overrides: Partial<RewardRedemption> = {}): RewardRedemption {
  return {
    id: 'r1', memberId: 'm1', memberName: 'Jordan', rewardId: 1,
    rewardTitle: 'Extra Screen Time (30m)', cost: 50,
    status: 'pending', requestedAt: 1000,
    ...overrides,
  };
}

describe('computeSpendable', () => {
  it('equals the full balance when there are no pending redemptions', () => {
    expect(computeSpendable(100, [], 'm1')).toBe(100);
  });

  it('subtracts the cost of pending redemptions for that member', () => {
    const redemptions = [redemption({ memberId: 'm1', cost: 30, status: 'pending' })];
    expect(computeSpendable(100, redemptions, 'm1')).toBe(70);
  });

  it('sums multiple pending redemptions for the same member', () => {
    const redemptions = [
      redemption({ id: 'r1', memberId: 'm1', cost: 30, status: 'pending' }),
      redemption({ id: 'r2', memberId: 'm1', cost: 20, status: 'pending' }),
    ];
    expect(computeSpendable(100, redemptions, 'm1')).toBe(50);
  });

  it('ignores pending redemptions belonging to other members', () => {
    const redemptions = [redemption({ memberId: 'm2', cost: 90, status: 'pending' })];
    expect(computeSpendable(100, redemptions, 'm1')).toBe(100);
  });

  it('ignores resolved (approved/denied) redemptions, only pending holds spendable', () => {
    const redemptions = [
      redemption({ id: 'r1', memberId: 'm1', cost: 30, status: 'approved' }),
      redemption({ id: 'r2', memberId: 'm1', cost: 20, status: 'denied' }),
    ];
    expect(computeSpendable(100, redemptions, 'm1')).toBe(100);
  });
});

describe('resolveClaim', () => {
  it('approving marks the entry approved, sets resolver, and deducts cost from balance', () => {
    const redemptions = [redemption({ cost: 50, status: 'pending' })];
    const balance = { m1: 100 };
    const result = resolveClaim(redemptions, balance, 'r1', 'approved', 'Maya');

    expect(result.redemptions[0]).toMatchObject({ status: 'approved', resolvedBy: 'Maya' });
    expect(result.redemptions[0].resolvedAt).toBeTypeOf('number');
    expect(result.balance).toEqual({ m1: 50 });
  });

  it('denying marks the entry denied, sets resolver, and leaves balance unchanged', () => {
    const redemptions = [redemption({ cost: 50, status: 'pending' })];
    const balance = { m1: 100 };
    const result = resolveClaim(redemptions, balance, 'r1', 'denied', 'Maya');

    expect(result.redemptions[0]).toMatchObject({ status: 'denied', resolvedBy: 'Maya' });
    expect(result.balance).toEqual({ m1: 100 });
  });

  it('only touches the targeted entry, leaving other redemptions untouched', () => {
    const redemptions = [
      redemption({ id: 'r1', cost: 50, status: 'pending' }),
      redemption({ id: 'r2', memberId: 'm2', cost: 30, status: 'pending' }),
    ];
    const balance = { m1: 100, m2: 100 };
    const result = resolveClaim(redemptions, balance, 'r1', 'approved', 'Maya');

    expect(result.redemptions[1]).toEqual(redemptions[1]);
    expect(result.balance.m2).toBe(100);
  });

  it('returns inputs unchanged when the target id does not exist', () => {
    const redemptions = [redemption({ id: 'r1', status: 'pending' })];
    const balance = { m1: 100 };
    const result = resolveClaim(redemptions, balance, 'does-not-exist', 'approved', 'Maya');

    expect(result.redemptions).toEqual(redemptions);
    expect(result.balance).toEqual(balance);
  });

  it('deducts from a balance of 0 (or missing) down into negative rather than throwing — approval does not re-check affordability', () => {
    // resolveClaim trusts the caller to have already gated "Request" on affordability at
    // request time; it does not re-validate here, matching the plan's no-ledger, simple
    // balance-decrement design. This test documents that behavior explicitly.
    const redemptions = [redemption({ cost: 50, status: 'pending' })];
    const balance = {};
    const result = resolveClaim(redemptions, balance, 'r1', 'approved', 'Maya');
    expect(result.balance.m1).toBe(-50);
  });
});
