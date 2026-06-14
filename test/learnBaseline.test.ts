import { describe, it } from 'vitest';
import { updateBaseline, getBaselineStats } from '../src/lib/learnBaseline';

describe('learnBaseline', () => {
  it('updates baseline with rolling average and tracks stats', () => {
    const zone = { id: 'z', type: 'floor', label: 'Z', chores: [], cleanBaseline: { clutterScore: 0.2 } } as any;
    const next = updateBaseline(zone, 0.6, 0.5);
    if (typeof next.cleanBaseline?.clutterScore !== 'number') throw new Error('no baseline');
    const stats = getBaselineStats(next);
    if (stats.sampleCount !== 1) throw new Error('sample count not tracked');
  });
});
