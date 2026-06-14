import { describe, it } from 'vitest';
import { buildEmptyHouse, addRoom } from '../src/lib/buildHouse';

describe('buildHouse', () => {
  it('builds empty house and adds room', () => {
    const h = buildEmptyHouse('h1', 'H');
    const room = { id: 'r1', floorId: 'f1', name: 'Room', zones: [] } as any;
    const h2 = addRoom(h, room);
    if (h2.rooms.length !== 1) throw new Error('room not added');
  });
});
