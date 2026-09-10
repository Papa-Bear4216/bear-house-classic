import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveMemberIdByName } from './HouseholdBrain';
import {
  getHaEntitiesForRoom,
  matchHaEntityForChore,
  DEFAULT_ROOM_MAP,
  loadRoomMap,
  saveRoomMap,
  triggerHaDevice,
  KEYS,
} from '@/lib/familyos';

// vitest.config.ts runs this suite under environment: 'node', which lacks a
// standard browser localStorage / sessionStorage. Node 22/24 defines an unconfigured
// globalThis.localStorage getter that throws if accessed. Polyfill a complete
// in-memory store so tests run cleanly under all Node/Vitest environments.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  [name: string]: any;
}

const mockLocalStorage = new MemoryStorage();
const mockSessionStorage = new MemoryStorage();

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true,
  });
} catch {
  (globalThis as any).localStorage = mockLocalStorage;
}

try {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: mockSessionStorage,
    writable: true,
    configurable: true,
  });
} catch {
  (globalThis as any).sessionStorage = mockSessionStorage;
}

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
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads default room map with rooms and pre-configured HA entities', () => {
    const rooms = loadRoomMap();
    expect(rooms.length).toBeGreaterThan(0);
    const kitchen = rooms.find((r) => r.name === 'Kitchen');
    expect(kitchen).toBeDefined();
    expect(kitchen?.haEntities).toContain('light.kitchen_ceiling');
  });

  it('falls back to DEFAULT_ROOM_MAP when storage is empty', () => {
    saveRoomMap([]);
    const rooms = loadRoomMap();
    expect(rooms.length).toBe(DEFAULT_ROOM_MAP.length);
  });

  it('falls back to DEFAULT_ROOM_MAP when storage contains empty array via direct localStorage', () => {
    localStorage.setItem(KEYS.roomMap, JSON.stringify([]));
    const rooms = loadRoomMap();
    expect(rooms.length).toBe(DEFAULT_ROOM_MAP.length);
    localStorage.removeItem(KEYS.roomMap);
  });

  it('persists and loads custom room definitions via saveRoomMap', () => {
    const custom = [
      { id: 'sunroom', name: 'Sunroom', haEntities: ['light.sunroom_lights'] },
    ];
    saveRoomMap(custom);
    const loaded = loadRoomMap();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('Sunroom');
    expect(loaded[0].haEntities).toContain('light.sunroom_lights');
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

  it('validates entity format in triggerHaDevice before making a network request', async () => {
    // Missing domain prefix
    const resNoDomain = await triggerHaDevice('kitchen_lights');
    expect(resNoDomain.ok).toBe(false);
    expect(resNoDomain.error).toMatch(/domain prefix/i);

    // Unsupported domain prefix
    const resBadDomain = await triggerHaDevice('unsupported_domain.device_123');
    expect(resBadDomain.ok).toBe(false);
    expect(resBadDomain.error).toMatch(/unsupported domain/i);
  });

  it('triggers a valid HA device successfully via API', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const res = await triggerHaDevice('light.kitchen_ceiling', 'turn_on');
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/ha-control'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ domain: 'light', service: 'turn_on', entityId: 'light.kitchen_ceiling' }),
      })
    );

    vi.unstubAllGlobals();
  });

  it('handles HA device error responses gracefully', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Home Assistant unreachable' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const res = await triggerHaDevice('switch.kitchen_fan');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Home Assistant unreachable');

    vi.unstubAllGlobals();
  });

  it('ensures climate domain entities default to turn_on instead of toggle', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const res = await triggerHaDevice('climate.living_room');
    expect(res.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/ha-control'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ domain: 'climate', service: 'turn_on', entityId: 'climate.living_room' }),
      })
    );

    vi.unstubAllGlobals();
  });

  it('supports expanded action types lock, unlock, open_cover, close_cover', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await triggerHaDevice('lock.front_door', 'lock');
    expect(fetchSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/ha-control'),
      expect.objectContaining({
        body: JSON.stringify({ domain: 'lock', service: 'lock', entityId: 'lock.front_door' }),
      })
    );

    await triggerHaDevice('cover.garage_door', 'open_cover');
    expect(fetchSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/ha-control'),
      expect.objectContaining({
        body: JSON.stringify({ domain: 'cover', service: 'open_cover', entityId: 'cover.garage_door' }),
      })
    );

    vi.unstubAllGlobals();
  });

  it('default rooms have defined zones and coordinates for interactive floor plan', () => {
    const rooms = loadRoomMap();
    const mainRooms = rooms.filter((r) => r.zone === 'main');
    const upstairsRooms = rooms.filter((r) => r.zone === 'upstairs');
    const workRooms = rooms.filter((r) => r.zone === 'work');

    expect(mainRooms.length).toBeGreaterThan(0);
    expect(upstairsRooms.length).toBeGreaterThan(0);
    expect(workRooms.length).toBeGreaterThan(0);

    // Each default room has valid coordinates
    rooms.forEach((r) => {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x).toBeLessThanOrEqual(100);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeLessThanOrEqual(100);
    });
  });

  describe('matchHaEntityForChore', () => {
    const kitchenEntities = ['light.kitchen_ceiling', 'switch.kitchen_fan'];
    const livingEntities = ['light.living_room_main', 'climate.living_room_thermostat', 'vacuum.downstairs_vac'];

    it('matches entity object ID using word-boundary token overlap with chore text', () => {
      expect(matchHaEntityForChore('Dust ceiling fixture', kitchenEntities, 'Kitchen')).toBe('light.kitchen_ceiling');
      expect(matchHaEntityForChore('Turn off kitchen fan', kitchenEntities, 'Kitchen')).toBe('switch.kitchen_fan');
      expect(matchHaEntityForChore('Run downstairs vac', livingEntities, 'Living')).toBe('vacuum.downstairs_vac');
    });

    it('returns undefined with NO fallback to roomEntities[0] when chore has no device match', () => {
      // Prior bug bound roomEntities[0] (light.kitchen_ceiling) to arbitrary chores
      expect(matchHaEntityForChore('Wipe counters', kitchenEntities, 'Kitchen')).toBeUndefined();
      expect(matchHaEntityForChore('Empty trash', kitchenEntities, 'Kitchen')).toBeUndefined();
      expect(matchHaEntityForChore('Fold laundry', livingEntities, 'Living')).toBeUndefined();
    });

    it('does not falsely bind a device when the only matching word is the room name itself', () => {
      expect(matchHaEntityForChore('Mop kitchen floor', kitchenEntities, 'Kitchen')).toBeUndefined();
      expect(matchHaEntityForChore('Vacuum living room rug', ['light.living_room_main'], 'Living Room')).toBeUndefined();
    });

    it('returns undefined for empty input or empty room entities', () => {
      expect(matchHaEntityForChore('', kitchenEntities, 'Kitchen')).toBeUndefined();
      expect(matchHaEntityForChore('Dust ceiling', [], 'Kitchen')).toBeUndefined();
    });
  });
});

