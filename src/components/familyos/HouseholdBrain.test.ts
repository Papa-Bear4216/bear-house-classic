import { describe, it, expect } from 'vitest';
import { resolveMemberIdByName } from './HouseholdBrain';

describe('resolveMemberIdByName', () => {
  it('finds a member id by matching name', () => {
    const members = [{ id: 'm1', name: 'Maya' }, { id: 'm2', name: 'Jordan' }];
    expect(resolveMemberIdByName(members, 'Jordan')).toBe('m2');
  });

  it('returns null when no member matches', () => {
    const members = [{ id: 'm1', name: 'Maya' }];
    expect(resolveMemberIdByName(members, 'General')).toBeNull();
  });
});
