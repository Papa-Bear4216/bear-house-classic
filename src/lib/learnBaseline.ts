import type { Zone } from './houseTypes';

export interface BaselineStats {
  clutterScore: number;
  fillLevel: number;
  lastUpdated: string;
  sampleCount: number;
}

export function updateBaseline(zone: Zone, observedMeasure: number, alpha = 0.2): Zone {
  const prev = zone.cleanBaseline ?? {} as Record<string, any>;
  
  // Exponential moving average
  const prevClutter = typeof prev.clutterScore === 'number' ? prev.clutterScore : 0.1;
  const prevFill = typeof prev.fillLevel === 'number' ? prev.fillLevel : 0;
  const prevSamples = typeof prev.sampleCount === 'number' ? prev.sampleCount : 0;
  
  const nextClutter = prevClutter * (1 - alpha) + observedMeasure * alpha;
  const nextFill = prevFill * (1 - alpha) + observedMeasure * alpha;
  const nextSamples = prevSamples + 1;
  
  return {
    ...zone,
    cleanBaseline: {
      ...prev,
      clutterScore: Math.min(1, Math.max(0, nextClutter)),
      fillLevel: Math.min(1, Math.max(0, nextFill)),
      lastUpdated: new Date().toISOString(),
      sampleCount: nextSamples
    }
  };
}

export function getBaselineStats(zone: Zone): BaselineStats {
  const baseline = zone.cleanBaseline ?? {};
  return {
    clutterScore: typeof baseline.clutterScore === 'number' ? baseline.clutterScore : 0,
    fillLevel: typeof baseline.fillLevel === 'number' ? baseline.fillLevel : 0,
    lastUpdated: typeof baseline.lastUpdated === 'string' ? baseline.lastUpdated : 'never',
    sampleCount: typeof baseline.sampleCount === 'number' ? baseline.sampleCount : 0
  };
}

export default { updateBaseline, getBaselineStats };
