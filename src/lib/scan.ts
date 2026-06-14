import type { Observation } from './simulateObservation';
import type { House, Room } from './houseTypes';

export function localizeRoom(observedAnchors: { id: string; score: number }[], house: House): { room?: Room; confidence: number; matchedCount: number } {
  let best: Room | undefined = undefined;
  let bestScore = 0;
  let bestMatchedCount = 0;
  for (const r of house.rooms) {
    const roomAnchors = new Set((r.anchors || []).map((a: any) => a.id));
    let score = 0;
    let matched = 0;
    for (const a of observedAnchors) {
      if (roomAnchors.has(a.id)) {
        score += a.score;
        matched++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
      bestMatchedCount = matched;
    }
  }
  const maxPossible = observedAnchors.reduce((s, a) => s + a.score, 0) || 1;
  const confidence = Math.min(1, bestScore / maxPossible);
  return { room: best, confidence, matchedCount: bestMatchedCount };
}

export function diffZones(observation: Observation, room: Room, userAge = 30) {
  // For each zone, produce messScore and which chores to trigger
  const results = room.zones.map(z => {
    const messScore = observation.zoneMeasures[z.id] ?? 0;
    const triggers = (z.chores || []).filter(c => {
      // check age
      if (c.ageMin && userAge < c.ageMin) return false;
      // check triggerWhen simple pattern (fillLevel >= x)
      if (c.triggerWhen && c.triggerWhen.fillLevel) {
        const cond = String(c.triggerWhen.fillLevel);
        if (cond.startsWith('>=')) {
          const val = parseFloat(cond.slice(2));
          return (Number(z.cleanBaseline?.fillLevel ?? 0)) >= val || messScore >= val;
        }
      }
      // show chores when messy
      return messScore > 0.15;
    });
    return { zoneId: z.id, messScore, triggered: triggers };
  });
  return results;
}

export default { localizeRoom, diffZones };
