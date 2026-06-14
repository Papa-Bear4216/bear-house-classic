import type { Anchor, Room } from './houseTypes';

export type Observation = {
  anchors: { id: string; score: number }[];
  zoneMeasures: Record<string, number>; // zoneId => messScore 0..1
};

export function simulateObservationForRoom(room: Room, noise = 0.05): Observation {
  const anchors = (room.anchors || []).map(a => ({ id: a.id, score: 0.8 + Math.random() * 0.2 }));
  const zoneMeasures: Record<string, number> = {};
  for (const z of room.zones) {
    const base = typeof z.cleanBaseline?.clutterScore === 'number' ? z.cleanBaseline.clutterScore : 0.1;
    zoneMeasures[z.id] = Math.min(1, Math.max(0, base + noise * (Math.random() - 0.5)));
  }
  return { anchors, zoneMeasures };
}

export default { simulateObservationForRoom };
