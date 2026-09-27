import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./householdAuth', () => ({ authedFetch: vi.fn(), getAccessToken: vi.fn() }));

import { voiceTriggersAdd, resolveClaim, RewardRedemption } from './familyos';
import { authedFetch, getAccessToken } from './householdAuth';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAccessToken).mockResolvedValue('test-token');
});

describe('voiceTriggersAdd', () => {
  it('returns the created trigger on success instead of throwing on an out-of-scope reference', async () => {
    // Regression guard: `data` was previously declared inside the !res.ok
    // branch and referenced again on the success path, throwing a
    // ReferenceError that the outer catch converted into a false failure —
    // every successful trigger creation looked like it had failed.
    vi.mocked(authedFetch).mockResolvedValue({
      ok: true,
      json: async () => ({ trigger: { id: 't1', trigger: 'lights off', deviceId: 'd1', action: 'turn_off' } }),
    } as Response);

    const result = await voiceTriggersAdd('lights off', 'd1', 'turn_off');

    expect(result.ok).toBe(true);
    expect(result.trigger).toEqual({ id: 't1', trigger: 'lights off', deviceId: 'd1', action: 'turn_off' });
  });

  it('returns the server error message on failure', async () => {
    vi.mocked(authedFetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Trigger already exists' }),
    } as Response);

    const result = await voiceTriggersAdd('lights off', 'd1', 'turn_off');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Trigger already exists');
  });

  it('returns a network-error message when the fetch itself throws', async () => {
    vi.mocked(authedFetch).mockRejectedValue(new Error('offline'));

    const result = await voiceTriggersAdd('lights off', 'd1', 'turn_off');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('offline');
  });
});

describe('resolveClaim', () => {
  const pendingEntry: RewardRedemption = {
    id: 'r1', memberId: 'm1', memberName: 'Kid', rewardId: 1, rewardTitle: 'Movie night',
    cost: 50, status: 'pending', requestedAt: Date.now(),
  };

  it('approves a pending redemption and deducts its cost once', () => {
    const result = resolveClaim([pendingEntry], { m1: 100 }, 'r1', 'approved', 'Parent');
    expect(result.redemptions[0].status).toBe('approved');
    expect(result.balance.m1).toBe(50);
  });

  it('is a no-op when the redemption is already resolved — prevents double-charge/approve', () => {
    // Regression guard: two devices (or a rapid double-click) resolving the
    // same redemption before either sees the other's result must not
    // double-deduct the balance or flip an already-resolved status.
    const alreadyApproved: RewardRedemption = { ...pendingEntry, status: 'approved', resolvedAt: Date.now(), resolvedBy: 'Parent' };
    const result = resolveClaim([alreadyApproved], { m1: 50 }, 'r1', 'approved', 'OtherParent');
    expect(result.redemptions[0]).toEqual(alreadyApproved);
    expect(result.balance.m1).toBe(50); // unchanged — not deducted a second time
  });

  it('is a no-op for a redemption id that does not exist', () => {
    const result = resolveClaim([pendingEntry], { m1: 100 }, 'nonexistent', 'approved', 'Parent');
    expect(result.redemptions).toEqual([pendingEntry]);
    expect(result.balance).toEqual({ m1: 100 });
  });
});
