import { describe, it } from 'vitest';
import { simulateObservationForRoom } from '../src/lib/simulateObservation';
import { localizeRoom, diffZones } from '../src/lib/scan';
import { sampleHouse } from '../src/lib/sampleHouse';

describe('scan', () => {
  it('localizes and diffs', () => {
    const room = sampleHouse.rooms[0];
    const obs = simulateObservationForRoom(room, 0.01);
    const loc = localizeRoom(obs.anchors, sampleHouse as any);
    if (!loc.room) throw new Error('did not localize');
    if (loc.matchedCount < 0) throw new Error('matchedCount invalid');
    const diffs = diffZones(obs as any, loc.room as any);
    if (!Array.isArray(diffs)) throw new Error('diffZones failed');
  });
});
