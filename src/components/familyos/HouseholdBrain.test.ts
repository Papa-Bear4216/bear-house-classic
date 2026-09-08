import { describe, it, expect } from 'vitest';
import { resolveMemberIdByName } from './HouseholdBrain';
import { getHaEntitiesForRoom, DEFAULT_ROOM_MAP, loadRoomMap } from '@/lib/familyos';

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

describe('Room Map & Home Assistant Entity Linking', () => {
  it('loads default room map with rooms and pre-configured HA entities', () => {
    const rooms = loadRoomMap();
    expect(rooms.length).toBeGreaterThan(0);
    const kitchen = rooms.find((r) => r.name === 'Kitchen');
    expect(kitchen).toBeDefined();
    expect(kitchen?.haEntities).toContain('light.kitchen_ceiling');
  });

  it('resolves HA entities for a specific room case-insensitively', () => {
    const entities = getHaEntitiesForRoom('kitchen');
    expect(entities).toContain('light.kitchen_ceiling');
    expect(entities).toContain('switch.kitchen_fan');
  });

  it('returns empty array for an unknown room or undefined room', () => {
    expect(getHaEntitiesForRoom('Secret Vault')).toEqual([]);
    expect(getHaEntitiesForRoom(undefined)).toEqual([]);
  });
});
